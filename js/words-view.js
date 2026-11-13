/**
 * words-view.js —— 背词页渲染层
 * 只负责把 state 渲染成 DOM，全部 DOM 操作集中在 render()
 */
window.WordsView = (function () {
  /**
   * 首次渲染时创建稳定骨架，保证翻面动画不被重建打断
   */
  function ensureSkeleton(el) {
    if (el.built) return;
    el.stage.innerHTML = `
      <div class="card-shell">
        <div class="word-card" role="button" tabindex="0" data-action="flip">
          <div class="card-inner" id="word-card-inner">
            <div class="card-face card-front" id="card-front"></div>
            <div class="card-face card-back" id="card-back"></div>
          </div>
        </div>
      </div>
      <div class="stage-done" id="words-done"></div>
      <div class="stage-loading">正在读取词库…</div>`;
    el.inner = document.getElementById('word-card-inner');
    el.front = document.getElementById('card-front');
    el.back = document.getElementById('card-back');
    el.done = document.getElementById('words-done');
    el.built = true;
  }

  /**
   * 顶部：今日待复习数量与进度条
   */
  function renderHead(state, el) {
    const total = state.cards.length;
    const done = Math.min(state.index, total);
    el.dueCount.textContent = String(state.sessionMode === 'extra' ? total : state.dueCount);
    if (el.label) {
      el.label.textContent = state.sessionMode === 'extra'
        ? '提前学习'
        : (state.range === 'wrong' ? '错词待复习' : '今日任务');
    }
    el.progressFill.style.width = (total ? Math.round((done / total) * 100) : 0) + '%';
    el.progressText.textContent = done + ' / ' + total;
    renderBanner(state, el);
  }

  /**
   * 今日任务强提示：剩余张数 + 连续打卡 + 到期卡顺延说明
   */
  function renderBanner(state, el) {
    if (!el.banner) return;
    const streak = state.streak ? '连续打卡 ' + state.streak + ' 天' : '今天开始打卡';
    let text;
    if (state.sessionMode === 'extra') {
      text = '提前学习模式 · ' + streak;
    } else if (state.phase === 'done' || state.index >= state.cards.length) {
      text = '今日任务已完成 · ' + streak;
    } else {
      const left = Math.max(0, state.cards.length - state.index);
      text = '今日还剩 ' + left + ' 张 · ' + streak;
    }
    if (state.overflow > 0) {
      text += ' · 另有 ' + state.overflow + ' 张到期卡已顺延到明天';
    }
    el.banner.textContent = text;
    el.banner.classList.toggle('is-done', state.phase === 'done' && state.sessionMode !== 'extra');
  }

  /**
   * 朗读按钮：浏览器不支持语音合成时不渲染
   */
  function speakBtn(action, label) {
    if (!window.Speech || !Speech.supported()) return '';
    return '<button class="speak-btn" type="button" data-action="' + action + '">' + label + '</button>';
  }

  /**
   * 范围与模式 chips 的选中态
   */
  function renderChips(state, el) {
    el.rangeBar.querySelectorAll('[data-range]').forEach(function (chip) {
      chip.classList.toggle('is-active', chip.dataset.range === state.range);
    });
    el.modeBar.querySelectorAll('[data-mode]').forEach(function (chip) {
      chip.classList.toggle('is-active', chip.dataset.mode === state.viewMode);
    });
  }

  /**
   * 「继续上次」入口
   */
  function renderResume(state, el) {
    if (!state.resume) {
      el.resume.innerHTML = '';
      return;
    }
    const rangeName = { all: '全部', cet4: 'CET4', high: '高频', wrong: '错词' }[state.resume.range] || '全部';
    const modeName = state.resume.viewMode === 'spell' ? '拼写' : '认词';
    el.resume.innerHTML = '<button class="resume-btn" type="button" data-action="resume">' +
      '继续上次：第 ' + (state.resume.index + 1) + ' / ' + state.resume.total + ' 张（' +
      rangeName + ' · ' + modeName + '）</button>';
  }

  /**
   * 认词模式：正面单词 + 音标
   */
  function recognizeFront(card) {
    return '<span class="card-hint">点击卡片或「显示答案」翻面</span>' +
      '<span class="card-word">' + esc(card.word) + '</span>' +
      '<span class="card-phonetic">' + esc(card.phonetic || '') + '</span>' +
      '<span class="speak-row">' + speakBtn('speak-word', '朗读单词') + '</span>';
  }

  /**
   * 例句块：没有例句时整块隐藏，避免出现空标签
   */
  function exampleBlock(card) {
    if (!card.example) return '';
    return '<span class="card-label">例句</span>' +
      '<span class="card-example">' + esc(card.example) + '</span>' +
      '<span class="speak-row">' + speakBtn('speak-example', '朗读例句') + '</span>';
  }

  /**
   * 认词模式：背面释义 + 例句
   */
  function recognizeBack(card) {
    return '<span class="card-label">释义</span>' +
      '<span class="card-meaning">' + esc(card.meaning || '') + '</span>' +
      exampleBlock(card);
  }

  /**
   * 拼写模式：正面释义 + 首字母提示 + 输入框
   */
  function spellFront(card) {
    const word = String(card.word || '');
    return '<span class="card-label">释义</span>' +
      '<span class="card-meaning">' + esc(card.meaning || '') + '</span>' +
      '<span class="spell-hint">首字母 ' + esc(word.charAt(0).toUpperCase()) + ' · 共 ' + word.length + ' 个字母</span>' +
      '<input class="spell-input" id="spell-input" type="text" data-spell="answer" autocomplete="off" ' +
      'autocapitalize="off" spellcheck="false" placeholder="请输入完整单词" />';
  }

  /**
   * 拼写模式：背面判定结果 + 正确拼写 + 释义例句
   */
  function spellBack(state, card) {
    const result = state.spellResult || { correct: false, value: '' };
    const badge = '<span class="spell-result ' + (result.correct ? 'is-ok' : 'is-bad') + '">' +
      (result.correct ? '拼写正确' : '拼写错误') + '</span>';
    const your = result.correct ? '' :
      '<span class="spell-your">你的输入：' + esc(result.value) + '</span>';
    return badge +
      '<span class="card-label">正确拼写</span>' +
      '<span class="card-word card-word-sm">' + esc(card.word || '') + '</span>' +
      '<span class="speak-row">' + speakBtn('speak-word', '朗读单词') + '</span>' +
      your +
      '<span class="card-label">释义</span>' +
      '<span class="card-meaning">' + esc(card.meaning || '') + '</span>' +
      exampleBlock(card);
  }

  /**
   * 舞台：加载中 / 词卡 / 完成态
   */
  function renderStage(state, el) {
    el.stage.dataset.phase = state.phase;

    if (state.phase === 'quiz') {
      const card = state.cards[state.index];
      if (card) {
        if (state.viewMode === 'spell') {
          el.front.innerHTML = spellFront(card);
          el.back.innerHTML = spellBack(state, card);
        } else {
          el.front.innerHTML = recognizeFront(card);
          el.back.innerHTML = recognizeBack(card);
        }
      }
      el.inner.classList.toggle('is-flipped', state.flipped);
      return;
    }

    if (state.phase === 'done') {
      const isExtra = state.sessionMode === 'extra';
      el.done.innerHTML = `
        <div class="done-mark">✓</div>
        <h2 class="done-title">${isExtra ? '本轮新词已学完' : '今日已完成'}</h2>
        <p class="done-desc">${isExtra
          ? '这些词还没到复习时间，提前学习不会打乱原有排期。'
          : '当前范围内的到期卡片都复习完了，明天再来巩固一次吧。'}</p>
        ${isExtra
          ? '<button class="btn-primary" type="button" data-action="back-today">回到今日任务</button>'
          : '<button class="btn-primary" type="button" data-action="learn-new">学习新词</button>'}`;
    }
  }

  /**
   * 底部操作区：显示答案 / 四档评分 / 拼写提交
   */
  function renderActions(state, el) {
    if (state.phase !== 'quiz') {
      el.actions.innerHTML = '';
      return;
    }

    if (state.viewMode === 'spell') {
      if (!state.spellResult) {
        el.actions.innerHTML = '<button class="btn-primary" type="button" data-action="spell-submit">提交答案</button>' +
          '<p class="quiz-hint">输入后按回车也可提交</p>';
        return;
      }
      const label = state.spellResult.correct ? 'Good' : 'Again';
      el.actions.innerHTML = '<button class="btn-primary" type="button" data-action="spell-next">继续（' + label + '）</button>';
      return;
    }

    if (!state.flipped) {
      el.actions.innerHTML = '<button class="btn-primary" type="button" data-action="flip">显示答案</button>';
      return;
    }
    el.actions.innerHTML = `
      <div class="rate-row">
        <button class="rate-btn rate-again" type="button" data-action="rate" data-rating="1">
          <span class="rate-name">Again</span><span class="rate-desc">忘记了</span>
        </button>
        <button class="rate-btn rate-hard" type="button" data-action="rate" data-rating="2">
          <span class="rate-name">Hard</span><span class="rate-desc">有点难</span>
        </button>
        <button class="rate-btn rate-good" type="button" data-action="rate" data-rating="3">
          <span class="rate-name">Good</span><span class="rate-desc">还记得</span>
        </button>
        <button class="rate-btn rate-easy" type="button" data-action="rate" data-rating="4">
          <span class="rate-name">Easy</span><span class="rate-desc">很简单</span>
        </button>
      </div>`;
  }

  /**
   * 统一渲染入口
   */
  function render(state, el) {
    if (!el.stage) return;

    // 拼写输入保护：重绘前记录输入内容，同一张卡才恢复，切题不残留
    const previousInput = document.getElementById('spell-input');
    const pendingValue = previousInput ? previousInput.value : '';
    const pendingCardId = el.stage.dataset.cardId || '';
    const currentCard = state.cards[state.index];

    ensureSkeleton(el);
    renderHead(state, el);
    renderChips(state, el);
    renderResume(state, el);
    renderStage(state, el);
    renderActions(state, el);

    el.stage.dataset.cardId = currentCard ? String(currentCard.id) : '';

    if (state.phase === 'quiz' && state.viewMode === 'spell' && !state.flipped && !state.spellResult) {
      const input = document.getElementById('spell-input');
      if (input) {
        if (pendingCardId && pendingCardId === el.stage.dataset.cardId) input.value = pendingValue;
        input.focus();
        const end = input.value.length;
        if (typeof input.setSelectionRange === 'function') input.setSelectionRange(end, end);
      }
    }
  }

  return { render: render };
})();

// DONE: words-view.js
