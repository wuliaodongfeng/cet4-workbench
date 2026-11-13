/**
 * quiz-view.js —— 刷题页渲染层
 * 只负责把 state 渲染成 DOM，全部 DOM 操作集中在 render()
 */
window.QuizView = (function () {
  const TYPE_LABEL = { single: '单选题', multiple: '多选题', blank: '填空题' };
  const SECTION_LABEL = { cloze: '选词填空', matching: '长篇匹配', reading: '仔细阅读' };
  const SECTION_LIST = [
    { id: 'cloze', name: '选词填空', desc: '10 题 / 套' },
    { id: 'matching', name: '长篇匹配', desc: '5 题 / 套' },
    { id: 'reading', name: '仔细阅读', desc: '7 题 / 套' }
  ];

  /**
   * 试卷编号转成中文名称：优先取内置题库里的标题，其次处理专项与错题本
   */
  function paperLabel(paperId) {
    const id = paperId || '';
    if (id === 'wrongbook') return '错题本重练';
    if (id.indexOf('section-') === 0) {
      return '专项练习 · ' + (SECTION_LABEL[id.slice(8)] || '未知题型');
    }
    const papers = (window.CONTENT && window.CONTENT.papers) || [];
    const found = papers.filter(function (paper) { return paper.id === id; })[0];
    if (found) return found.title;
    const mock = /^src-exam-cet4-mock-(\d+)$/.exec(id);
    if (mock) return '四级模拟卷 ' + mock[1];
    const real = /^src-exam-cet4-real-(\d{4})-(\d{2})$/.exec(id);
    if (real) return '四级真题风格卷 ' + real[1] + ' 年 ' + real[2] + ' 月';
    const demo = /^demo-(\d+)$/.exec(id);
    return demo ? '示例试卷 ' + demo[1] : id || '未命名试卷';
  }

  /**
   * 把作答内容格式化为可读文本
   */
  function formatAnswer(answer) {
    if (answer === undefined || answer === null) return '未作答';
    if (Array.isArray(answer)) return answer.length ? answer.slice().sort().join('') : '未作答';
    return String(answer).trim() || '未作答';
  }

  /**
   * 渲染试卷列表：模式切换、错题本入口、专项练习、试卷进度
   */
  function renderPapers(state, el) {
    const exam = state.openMode === 'exam';
    const cards = state.papers.map(function (paper) {
      const percent = paper.total ? Math.round((paper.answered / paper.total) * 100) : 0;
      const enter = exam
        ? '开始模考（40 分钟）'
        : (paper.resumed ? '继续作答（第 ' + (paper.draftIndex + 1) + ' 题）' : '进入作答');
      return `
        <button class="paper-card" type="button" data-action="open-paper" data-paper="${esc(paper.paperId)}">
          <div class="paper-head">
            <span class="paper-name">${esc(paperLabel(paper.paperId))}</span>
            <span class="paper-meta">${paper.total} 题</span>
          </div>
          <div class="paper-bar"><span style="width:${percent}%"></span></div>
          <div class="paper-foot">
            <span>已答 ${paper.answered} / ${paper.total}</span>
            <span class="paper-enter">${enter}</span>
          </div>
        </button>`;
    }).join('');

    const sections = SECTION_LIST.map(function (item) {
      return `<button class="section-card" type="button" data-action="open-section" data-section="${item.id}">
        <span class="section-name">${item.name}</span><span class="section-desc">${item.desc}</span></button>`;
    }).join('');

    const body = state.papers.length
      ? `<div class="paper-list">${cards}</div>`
      : '<div class="empty-box">题库为空，请到「我的」页导入题库后再来刷题。</div>';

    el.view.innerHTML = `
      <div class="section-head">
        <h2>${exam ? '模拟考试' : '试卷列表'}</h2>
        <p>共 ${state.papers.length} 套试卷${exam ? '，40 分钟倒计时，到点自动交卷' : '，交卷后自动判分并生成错题'}</p>
      </div>
      <div class="chip-row" id="quiz-mode">
        <span class="chip-label">模式</span>
        <button class="chip${exam ? '' : ' is-active'}" type="button" data-action="open-mode" data-mode="practice">练习</button>
        <button class="chip${exam ? ' is-active' : ''}" type="button" data-action="open-mode" data-mode="exam">模考</button>
      </div>
      <button class="wrong-entry" type="button" data-action="open-wrongbook">
        <span class="wrong-entry-title">错题本</span>
        <span class="wrong-entry-meta">${state.wrongCount ? state.wrongCount + ' 道题待重练' : '暂无错题'}</span>
      </button>
      <div class="section-practice">
        <p class="panel-note">专项练习：把 16 套卷的同题型聚在一起，适合集中突破</p>
        <div class="section-grid">${sections}</div>
      </div>
      ${body}`;
  }

  /**
   * 按 paperId 读取内置试卷（含词库与原文）
   */
  function findPaper(paperId) {
    const papers = (window.CONTENT && window.CONTENT.papers) || [];
    return papers.filter(function (paper) { return paper.id === paperId; })[0] || null;
  }

  /**
   * 选词填空的候选词库面板（A–O）
   */
  function renderWordbank(question) {
    const paper = findPaper(question.paperId);
    const bank = paper && Array.isArray(paper.wordbank) ? paper.wordbank : [];
    if (QuizCore.sectionOf(question) !== 'cloze' || !bank.length) return '';
    return '<div class="wordbank">' +
      '<div class="wordbank-title">词库（选择一个填入空格，填原词即可）</div>' +
      '<div class="wordbank-list">' + bank.map(function (word, index) {
        return '<span class="wordbank-item"><b>' + String.fromCharCode(65 + index) + '</b>' + esc(word) + '</span>';
      }).join('') + '</div></div>';
  }

  /**
   * 阅读材料：matching 展示 A–F 段原文，reading 按题干 (Passage N) 取对应原文
   */
  function renderMaterial(question) {
    const paper = findPaper(question.paperId);
    const materials = paper && paper.materials ? paper.materials : null;
    if (!materials) return '';
    const section = QuizCore.sectionOf(question);

    if (section === 'matching' && Array.isArray(materials.matching) && materials.matching.length) {
      const body = materials.matching.map(function (item) {
        return '<p class="material-para"><b>' + esc(item.key) + '</b>' + esc(item.text) + '</p>';
      }).join('');
      return materialBox('阅读原文（A–F 段）', body);
    }

    if (section === 'reading' && Array.isArray(materials.reading) && materials.reading.length) {
      const matched = /\(Passage\s+(\d+)\)/.exec(question.stem || '');
      const number = matched ? matched[1] : '';
      const passage = materials.reading.filter(function (item) {
        return String(item.key) === number;
      })[0];
      if (!passage) return '';
      return materialBox('阅读原文 Passage ' + esc(number),
        '<p class="material-para">' + esc(passage.text) + '</p>');
    }
    return '';
  }

  /**
   * 可折叠的原文容器，默认展开，长文限高滚动
   */
  function materialBox(title, body) {
    return '<details class="material" open><summary>' + title + '（点击折叠）</summary>' +
      '<div class="material-box">' + body + '</div></details>';
  }

  /**
   * 渲染选项区（含填空题输入框）
   */
  function renderOptions(state, question) {
    if (question.type === 'blank') {
      const value = state.answers[question.id] || '';
      const paper = findPaper(question.paperId);
      const hasBank = QuizCore.sectionOf(question) === 'cloze' && paper &&
        Array.isArray(paper.wordbank) && paper.wordbank.length > 0;
      const placeholder = hasBank ? '从上方词库中选择单词填写' : '请输入答案，多个答案任填其一';
      return `<input class="blank-input" type="text" data-input="answer" autocomplete="off"
        placeholder="${placeholder}" value="${esc(value)}" />`;
    }
    const answer = state.answers[question.id];
    const picked = Array.isArray(answer) ? answer : answer ? [answer] : [];
    const options = Array.isArray(question.options) ? question.options : [];
    return '<div class="option-list">' + options.map(function (text, index) {
      const letter = String.fromCharCode(65 + index);
      const selected = picked.indexOf(letter) >= 0 ? ' is-selected' : '';
      return `<button class="option${selected}" type="button" data-action="option" data-letter="${letter}">
        <span class="option-letter">${letter}</span>
        <span class="option-text">${esc(text)}</span>
      </button>`;
    }).join('') + '</div>';
  }

  /**
   * 渲染单题作答界面（模考模式顶部显示倒计时）
   */
  function renderQuestion(state, el) {
    const question = state.questions[state.index];
    if (!question) {
      renderPapers(state, el);
      return;
    }
    const isLast = state.index >= state.questions.length - 1;
    const exam = state.mode === 'exam';
    const remain = QuizExam.remaining(state);
    const timer = exam
      ? '<span class="quiz-timer' + (remain <= 300 ? ' is-urgent' : '') + '" id="quiz-timer">' + QuizExam.formatClock(remain) + '</span>'
      : '';
    el.view.innerHTML = `
      <div class="quiz-top">
        <span class="quiz-index">第 ${state.index + 1} / ${state.questions.length} 题</span>
        <span class="quiz-tags">
          ${timer}
          ${state.retry ? '<span class="quiz-retry-tag">错题重练</span>' : ''}
          <span class="quiz-type">${TYPE_LABEL[question.type] || '单选题'}</span>
        </span>
      </div>
      <p class="quiz-paper">${esc(paperLabel(state.paperId))}</p>
      <div class="quiz-stem">${esc(question.stem)}</div>
      ${renderMaterial(question)}
      ${renderWordbank(question)}
      ${renderOptions(state, question)}
      <div class="quiz-bottom">
        <button class="btn-primary" type="button" data-action="next">${isLast ? '交卷' : '下一题'}</button>
      </div>
      <p class="quiz-hint">${question.type === 'multiple' ? '多选题：可选择多个选项' : '答完本题后点击按钮继续'}</p>`;
  }

  /**
   * 错题本：列出仍然答错的题，展示正确答案与解析，可一键重练
   */
  function renderWrongBook(state, el) {
    const items = state.wrongBook.map(function (item, index) {
      return `
        <div class="wrong-item">
          <p class="wrong-stem">${index + 1}. ${esc(item.question.stem)}</p>
          <p class="wrong-line">来源：${esc(paperLabel(item.question.paperId))}</p>
          <p class="wrong-line">正确答案：<em class="is-right">${esc(formatAnswer(item.question.answer))}</em></p>
          <p class="wrong-exp">解析：${esc(item.question.explanation || '暂无解析')}</p>
        </div>`;
    }).join('');

    el.view.innerHTML = `
      <div class="section-head">
        <h2>错题本</h2>
        <p>来自历史作答记录，答对后会自动移出，共 ${state.wrongBook.length} 题</p>
      </div>
      <div class="result-actions">
        ${state.wrongBook.length
          ? '<button class="btn-primary" type="button" data-action="practice-wrongbook">重练错题（' + state.wrongBook.length + '）</button>'
          : ''}
        <button class="btn-ghost" type="button" data-action="back-papers">返回试卷列表</button>
      </div>
      ${state.wrongBook.length ? '<div class="wrong-list">' + items + '</div>'
        : '<div class="empty-box">还没有错题。做完一套卷子后，答错的题会留在这里。</div>'}`;
  }

  /**
   * 渲染交卷结果与错题列表（模考显示用时）
   */
  function renderResult(state, el) {
    const total = state.score.total;
    const percent = total ? Math.round((state.score.correct / total) * 100) : 0;
    const used = state.elapsed ? '<em>用时 ' + QuizExam.formatClock(state.elapsed) + '</em>' : '';
    const wrongHtml = state.wrong.length
      ? '<div class="wrong-list">' + state.wrong.map(function (question, index) {
        return `
          <div class="wrong-item">
            <p class="wrong-stem">${index + 1}. ${esc(question.stem)}</p>
            <p class="wrong-line">你的答案：<em class="is-wrong">${esc(formatAnswer(state.answers[question.id]))}</em></p>
            <p class="wrong-line">正确答案：<em class="is-right">${esc(question.answer)}</em></p>
            <p class="wrong-exp">解析：${esc(question.explanation || '暂无解析')}</p>
          </div>`;
      }).join('') + '</div>'
      : '<p class="result-perfect">这套题全部答对，状态不错。</p>';

    el.view.innerHTML = `
      <div class="result-hero">
        <span class="result-score">${percent}</span><span class="result-unit">分</span>
        <p class="result-sub">答对 ${state.score.correct} / ${total} 题${state.retry ? ' · 错题重练' : ''}${used ? ' · ' + used : ''}</p>
      </div>
      <div class="result-actions">
        ${state.wrong.length
          ? `<button class="btn-primary" type="button" data-action="retry-wrong">重练错题（${state.wrong.length}）</button>
             <button class="btn-ghost" type="button" data-action="back-papers">返回试卷列表</button>`
          : '<button class="btn-primary" type="button" data-action="back-papers">返回试卷列表</button>'}
      </div>
      <h3 class="section-title">错题列表</h3>
      ${wrongHtml}`;
  }

  /**
   * 统一渲染入口
   */
  function render(state, el) {
    if (!el.view) return;
    if (state.view === 'papers') renderPapers(state, el);
    else if (state.view === 'wrongbook') renderWrongBook(state, el);
    else if (state.view === 'quiz') renderQuestion(state, el);
    else renderResult(state, el);
  }

  return { render: render };
})();

// DONE: quiz-view.js
