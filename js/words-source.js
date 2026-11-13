/**
 * words-source.js —— 背词页数据源
 * 负责：范围筛选、每日复习上限、新词分层排队、快照读取 / 保存
 */
window.WordsSource = (function () {
  const RANGE_LIST = ['all', 'cet4', 'high', 'wrong'];
  // 每日新词上限：把 4888 个待学词拆成每天可完成的小份
  const DAILY_NEW = 20;
  // 每日复习上限：到期卡太多时先做逾期最久的 100 张，其余顺延到明天
  const REVIEW_CAP = 100;
  // 新词分层配额比例：高频词 60% / 有例句 30% / 其余补足
  const LAYER_SHARE = [0.6, 0.3, 1];
  const NEW_KEY_PREFIX = 'cet4wb:newDone:';
  // localStorage 不可用时的当天近似计数
  let memoryNewDate = '';
  let memoryNewDone = 0;

  /** 今日已学新词数 */
  function readNewDone() {
    const today = FSRS.todayStr();
    try {
      return Math.max(0, Number(window.localStorage.getItem(NEW_KEY_PREFIX + today)) || 0);
    } catch (err) {
      if (memoryNewDate !== today) {
        memoryNewDate = today;
        memoryNewDone = 0;
      }
      return memoryNewDone;
    }
  }

  /** 学完一个新词后累加当天计数 */
  function countNewLearned() {
    const today = FSRS.todayStr();
    const next = readNewDone() + 1;
    try {
      window.localStorage.setItem(NEW_KEY_PREFIX + today, String(next));
    } catch (err) {
      memoryNewDate = today;
      memoryNewDone = next;
    }
  }

  /** 把词按考频代理拆成三层：高频标签 / 有例句 / 其余 */
  function splitLayers(words) {
    const high = [];
    const example = [];
    const rest = [];
    words.forEach(function (word) {
      const isHigh = Array.isArray(word.tags) && word.tags.indexOf('high') >= 0;
      if (isHigh) high.push(word);
      else if (word.example && String(word.example).trim()) example.push(word);
      else rest.push(word);
    });
    return [high, example, rest];
  }

  /** 三层顺序排列（高频 → 有例句 → 其余），不改变各层内部顺序 */
  function prioritizeLayers(words) {
    const layers = splitLayers(words);
    return layers[0].concat(layers[1], layers[2]);
  }

  /** 按配额从三层各取一部分新词，不足的名额由后续层补上 */
  function pickNewWords(fresh, quota) {
    if (!quota || !fresh.length) return [];
    const layers = splitLayers(fresh);
    const picked = [];
    let remaining = quota;

    layers.forEach(function (layer, index) {
      const share = Math.max(1, Math.ceil(quota * LAYER_SHARE[index]));
      const take = Math.min(layer.length, Math.min(remaining, share));
      picked.push.apply(picked, layer.slice(0, take));
      remaining -= take;
    });

    if (remaining > 0) {
      const used = {};
      picked.forEach(function (word) {
        used[word.id] = true;
      });
      layers.forEach(function (layer) {
        layer.forEach(function (word) {
          if (remaining > 0 && !used[word.id]) {
            picked.push(word);
            used[word.id] = true;
            remaining -= 1;
          }
        });
      });
    }
    return picked.slice(0, quota);
  }

  /** 每个词最近一次作答记录，用于识别「上次评了 Again」的错词 */
  function latestWordAttempts(attempts) {
    const latest = {};
    attempts.forEach(function (item) {
      if (item.kind !== 'word') return;
      const prev = latest[item.refId];
      if (!prev || Number(item.timestamp) >= Number(prev.timestamp)) latest[item.refId] = item;
    });
    return latest;
  }

  /** 到期卡拆成「错词 / 复习 / 新词」三队：错词优先，复习按逾期倒序，新词按层给额度 */
  function limitCards(cards, latest) {
    const wrong = [];
    const normal = [];
    const fresh = [];
    cards.forEach(function (word) {
      const reps = word.fsrs ? Number(word.fsrs.reps) || 0 : 0;
      if (reps === 0) {
        fresh.push(word);
        return;
      }
      const record = latest[word.id];
      if (record && record.correct === false) wrong.push(word);
      else normal.push(word);
    });

    function byDue(a, b) {
      return String(a.fsrs.due).localeCompare(String(b.fsrs.due));
    }
    wrong.sort(byDue);
    normal.sort(byDue);
    const keptWrong = wrong.slice(0, REVIEW_CAP);
    const keptNormal = normal.slice(0, Math.max(0, REVIEW_CAP - keptWrong.length));
    const quota = Math.max(0, DAILY_NEW - readNewDone());
    const picked = pickNewWords(fresh, quota);

    return {
      cards: keptWrong.concat(keptNormal, picked),
      overflow: Math.max(0, wrong.length + normal.length - keptWrong.length - keptNormal.length),
      breakdown: { wrong: keptWrong.length, due: keptNormal.length, fresh: picked.length }
    };
  }

  /** 按范围过滤词卡：全部 / CET4 / 高频 / 错词，返回 { cards, overflow, breakdown } */
  function filterCards(words, attempts, range) {
    const latest = latestWordAttempts(attempts);
    if (range === 'wrong') {
      const cards = words.filter(function (word) {
        return latest[word.id] && latest[word.id].correct === false && FSRS.isDue(word);
      });
      return { cards: cards, overflow: 0, breakdown: { wrong: cards.length, due: 0, fresh: 0 } };
    }

    const due = words.filter(function (word) {
      return FSRS.isDue(word);
    });
    if (range === 'high') {
      return limitCards(due.filter(function (word) {
        return Array.isArray(word.tags) && word.tags.indexOf('high') >= 0;
      }), latest);
    }
    if (range === 'cet4') {
      return limitCards(due.filter(function (word) {
        return !Array.isArray(word.tags) || word.tags.indexOf('cet4') >= 0;
      }), latest);
    }
    return limitCards(due, latest);
  }

  /** 读取未完成的背词快照 */
  async function readResume() {
    const draft = await DB.getDraft('words');
    if (!draft || !Array.isArray(draft.ids) || !draft.ids.length) return null;
    if (!draft.index || draft.index >= draft.ids.length) return null;
    return {
      index: draft.index,
      total: draft.ids.length,
      range: draft.range || 'all',
      viewMode: draft.viewMode || 'recognize'
    };
  }

  /** 加载某范围下的词卡、今日到期数、顺延数量、打卡天数与上一轮快照 */
  async function loadCards(range) {
    const words = await DB.getWords();
    const attempts = await DB.getAttempts();
    const session = filterCards(words, attempts, range);
    return {
      cards: session.cards,
      dueCount: session.cards.length,
      breakdown: session.breakdown,
      overflow: session.overflow,
      resume: await readResume(),
      streak: Stats.streak(attempts),
      doneToday: Stats.todayDone(attempts)
    };
  }

  /** 按快照里的 id 顺序还原词卡，已删除的词自动跳过 */
  async function cardsFromDraft(draft) {
    const words = await DB.getWords();
    const index = {};
    words.forEach(function (word) {
      index[word.id] = word;
    });
    return draft.ids.map(function (id) {
      return index[id];
    }).filter(Boolean);
  }

  /** 保存背词快照；state.phase 为 done 时标记作废 */
  function saveDraft(state) {
    DB.putDraft({
      id: 'words',
      kind: 'words',
      ids: state.cards.map(function (card) {
        return card.id;
      }),
      index: state.index,
      sessionMode: state.sessionMode,
      range: state.range,
      viewMode: state.viewMode,
      done: state.phase === 'done',
      updatedAt: Date.now()
    }).catch(function (err) {
      window.toast('保存背词进度失败：' + err.message);
    });
  }

  return {
    RANGE_LIST: RANGE_LIST,
    DAILY_NEW: DAILY_NEW,
    REVIEW_CAP: REVIEW_CAP,
    filterCards: filterCards,
    loadCards: loadCards,
    cardsFromDraft: cardsFromDraft,
    saveDraft: saveDraft,
    countNewLearned: countNewLearned,
    prioritizeLayers: prioritizeLayers
  };
})();

// DONE: words-source.js
