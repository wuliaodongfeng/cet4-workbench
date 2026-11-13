/**
 * words.js —— 背词页逻辑
 * 负责：范围筛选、认词 / 拼写两种模式、评分落盘、断点快照
 * 渲染见 words-view.js，数据源见 words-source.js
 */
window.Words = (function () {
  const state = {
    phase: 'loading', // loading | quiz | done
    sessionMode: 'due', // due（今日到期）| extra（提前学习）
    cards: [],
    index: 0,
    flipped: false,
    dueCount: 0,
    range: 'all',
    viewMode: 'recognize', // recognize（认词）| spell（拼写）
    spellResult: null,
    resume: null,
    overflow: 0,
    streak: 0,
    doneToday: 0
  };

  const el = {};

  /** 拼写归一化：转小写、只保留字母 */
  function normalizeSpelling(text) {
    return String(text).toLowerCase().replace(/[^a-z]/g, '');
  }

  /** 初始化：缓存容器、绑定事件、加载词卡 */
  async function init() {
    el.page = document.getElementById('page-words');
    el.dueCount = document.getElementById('words-due-count');
    el.progressFill = document.getElementById('words-progress-fill');
    el.progressText = document.getElementById('words-progress-text');
    el.stage = document.getElementById('words-stage');
    el.actions = document.getElementById('words-actions');
    el.resume = document.getElementById('words-resume');
    el.rangeBar = document.getElementById('words-range');
    el.modeBar = document.getElementById('words-mode');
    el.label = document.querySelector('#page-words .words-label');
    el.banner = document.getElementById('words-banner');
    el.page.addEventListener('click', handleClick);
    el.page.addEventListener('keydown', handleKeydown);
    await loadDueWords();
  }

  /** 事件委托：翻面 / 评分 / 范围 / 模式 / 快照 / 拼写 */
  function handleClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'flip') flip();
    else if (action === 'rate') rate(Number(target.dataset.rating));
    else if (action === 'learn-new') learnNewWords();
    else if (action === 'back-today') loadDueWords();
    else if (action === 'range') changeRange(target.dataset.range);
    else if (action === 'mode') changeViewMode(target.dataset.mode);
    else if (action === 'resume') resumeSession();
    else if (action === 'spell-submit') submitSpelling();
    else if (action === 'spell-next') rate(state.spellResult && state.spellResult.correct ? 3 : 1);
    else if (action === 'speak-word') speakCurrent('word');
    else if (action === 'speak-example') speakCurrent('example');
  }

  /** 朗读当前卡片的单词或例句；浏览器不支持时给出提示 */
  function speakCurrent(part) {
    const card = state.cards[state.index];
    if (!card) return;
    if (!Speech.supported()) {
      window.toast('当前浏览器不支持朗读，可换用 Chrome / Edge');
      return;
    }
    if (part === 'example') Speech.speakExample(card.example);
    else Speech.speakWord(card.word);
  }

  /** 拼写输入框内按回车直接提交 */
  function handleKeydown(event) {
    if (event.key !== 'Enter') return;
    if (!event.target.closest('[data-spell]')) return;
    event.preventDefault();
    submitSpelling();
  }

  /** 加载当前范围下的词卡 */
  async function loadDueWords() {
    state.phase = 'loading';
    render();
    try {
      const session = await WordsSource.loadCards(state.range);
      state.dueCount = session.dueCount;
      state.cards = session.cards;
      state.index = 0;
      state.flipped = false;
      state.spellResult = null;
      state.sessionMode = 'due';
      state.phase = session.cards.length ? 'quiz' : 'done';
      state.resume = session.resume;
      state.overflow = session.overflow || 0;
      state.streak = session.streak || 0;
      state.doneToday = session.doneToday || 0;
      render();
    } catch (err) {
      state.phase = 'done';
      render();
      window.toast('读取词库失败：' + err.message);
    }
  }

  /** 从快照恢复上次的背词现场 */
  async function resumeSession() {
    if (!state.resume) return;
    try {
      const draft = await DB.getDraft('words');
      if (!draft) {
        state.resume = null;
        render();
        return;
      }
      const cards = await WordsSource.cardsFromDraft(draft);
      if (!cards.length) {
        state.resume = null;
        render();
        return;
      }

      state.range = draft.range || 'all';
      state.viewMode = draft.viewMode === 'spell' ? 'spell' : 'recognize';
      state.sessionMode = draft.sessionMode || 'due';
      state.cards = cards;
      state.index = Math.min(draft.index || 0, cards.length - 1);
      state.flipped = false;
      state.spellResult = null;
      state.phase = 'quiz';
      state.resume = null;
      state.overflow = 0;
      render();
      window.toast('已回到上次的背词进度');
    } catch (err) {
      window.toast('恢复进度失败：' + err.message);
    }
  }

  /** 切换范围并重新加载词卡 */
  async function changeRange(range) {
    if (WordsSource.RANGE_LIST.indexOf(range) < 0 || range === state.range) return;
    state.range = range;
    await loadDueWords();
  }

  /** 切换认词 / 拼写模式 */
  function changeViewMode(mode) {
    const next = mode === 'spell' ? 'spell' : 'recognize';
    if (next === state.viewMode) return;
    state.viewMode = next;
    state.flipped = false;
    state.spellResult = null;
    WordsSource.saveDraft(state);
    render();
  }

  /** 认词模式翻面查看释义 */
  function flip() {
    if (state.phase !== 'quiz' || state.viewMode === 'spell') return;
    state.flipped = true;
    render();
  }

  /** 拼写模式提交：归一化比对，正确映射 Good，错误映射 Again */
  function submitSpelling() {
    if (state.phase !== 'quiz' || state.viewMode !== 'spell' || state.spellResult) return;
    const card = state.cards[state.index];
    const input = document.getElementById('spell-input');
    if (!card || !input) return;
    if (!input.value.trim()) {
      window.toast('请先拼写单词');
      return;
    }
    state.spellResult = {
      correct: normalizeSpelling(input.value) === normalizeSpelling(card.word),
      value: input.value.trim()
    };
    state.flipped = true;
    render();
  }

  /** 评分：更新 FSRS、写回词卡、记录复习日志，然后进入下一张 */
  async function rate(rating) {
    if (state.phase !== 'quiz' || !state.flipped) {
      window.toast('请先显示答案再评分');
      return;
    }
    const card = state.cards[state.index];
    if (!card) return;
    const wasNew = !card.fsrs || Number(card.fsrs.reps) === 0;
    Speech.stop();

    try {
      const updated = FSRS.rate(card, rating);
      await DB.putWord(updated);
      await DB.putAttempt({
        id: 'wa-' + updated.id + '-' + Date.now().toString(36),
        refId: updated.id,
        kind: 'word',
        correct: rating >= 3,
        rating: rating,
        timestamp: Date.now()
      });
      // 新词计入当天额度，避免一天被 4888 个词淹没
      if (wasNew) WordsSource.countNewLearned();
      state.index += 1;
      state.flipped = false;
      state.spellResult = null;
      if (state.index >= state.cards.length) state.phase = 'done';
      WordsSource.saveDraft(state);
      render();
    } catch (err) {
      window.toast('保存复习进度失败：' + err.message);
    }
  }

  /** 学习新词：提前学习还没学过（reps = 0）的词，最多 10 个 */
  async function learnNewWords() {
    try {
      const words = await DB.getWords();
      const extras = WordsSource.prioritizeLayers(
        words.filter(function (word) {
          return !word.fsrs || Number(word.fsrs.reps) === 0;
        })
      ).slice(0, 10);

      if (!extras.length) {
        window.toast('暂时没有可提前学习的单词，可到「我的」页导入词库');
        return;
      }
      state.cards = extras;
      state.index = 0;
      state.flipped = false;
      state.spellResult = null;
      state.sessionMode = 'extra';
      state.phase = 'quiz';
      render();
    } catch (err) {
      window.toast('读取词库失败：' + err.message);
    }
  }

  /** 统一渲染入口（委托给渲染层） */
  function render() {
    WordsView.render(state, el);
  }

  /** 标签页切回时只重绘，不打断正在进行的学习 */
  function refresh() {
    render();
  }

  /** 数据被导入 / 覆盖后重新加载 */
  function reload() {
    return loadDueWords();
  }

  return {
    init: init,
    render: render,
    refresh: refresh,
    reload: reload
  };
})();

// DONE: words.js
