/**
 * me.js —— 我的页
 * 负责：学习统计、数据导出 / 导入、存储模式诊断
 */
window.Me = (function () {
  const DIAG = {
    idb: { label: 'IndexedDB', desc: '浏览器数据库可用，数据长期保存在本机，刷新和关闭页面都不会丢失。' },
    ls: { label: 'localStorage', desc: 'IndexedDB 不可用（常见于直接双击打开的 file:// 页面），已自动降级到 localStorage，数据依然可以长期保存。' },
    memory: { label: '内存', desc: '浏览器存储均不可用，数据只保留在当前页面，关闭后会丢失，请及时导出备份。' }
  };

  const state = { words: [], questions: [], attempts: [], persisted: false, guard: null };
  const el = {};

  /**
   * 页面初始化：绑定事件并加载统计
   */
  async function init() {
    el.view = document.getElementById('me-view');
    el.view.addEventListener('click', handleClick);
    el.view.addEventListener('change', handleChange);
    await load();
  }

  /**
   * 读取全部数据并重绘
   */
  async function load() {
    try {
      const words = await DB.getWords();
      const questions = await DB.getQuestions();
      const attempts = await DB.getAttempts();
      state.words = words;
      state.questions = questions;
      state.attempts = attempts;
      if (window.PWA) state.persisted = await PWA.isPersisted();
      if (window.DataGuard) state.guard = await DataGuard.status();
      render();
    } catch (err) {
      window.toast('读取统计数据失败：' + err.message);
    }
  }

  /**
   * 计算累计背词数、累计做题数、做题正确率
   */
  function computeStats() {
    const learned = state.words.filter(function (word) {
      return word.fsrs && Number(word.fsrs.reps) > 0;
    }).length;
    const questionAttempts = state.attempts.filter(function (attempt) {
      return attempt.kind === 'question';
    });
    const answered = questionAttempts.length;
    const correct = questionAttempts.filter(function (attempt) {
      return attempt.correct;
    }).length;
    return {
      learned: learned,
      answered: answered,
      correct: correct,
      accuracy: answered ? Math.round((correct / answered) * 100) : 0,
      wordTotal: state.words.length,
      questionTotal: state.questions.length
    };
  }

  /**
   * 渲染统计数字
   */
  function renderStats(stats) {
    const cards = [
      { value: stats.learned, name: '累计背词数' },
      { value: stats.answered, name: '累计做题数' },
      { value: stats.accuracy + '%', name: '做题正确率' }
    ];
    return '<div class="stat-grid">' + cards.map(function (card) {
      return '<div class="stat-card"><span class="stat-value">' + card.value +
        '</span><span class="stat-name">' + card.name + '</span></div>';
    }).join('') + '</div>';
  }

  /**
   * 渲染存储诊断面板：模式、持久化状态、离线提示
   */
  function renderDiag(stats) {
    const mode = DB.getMode();
    const diag = DIAG[mode] || DIAG.memory;
    const persisted = state.persisted ? '已授予' : '未授予';
    const hint = window.PWA ? PWA.offlineHint() : '';
    return [
      '<div class="panel">',
      '  <div class="panel-head">',
      '    <h3>存储诊断</h3>',
      '    <span class="mode-tag" data-mode="' + mode + '">' + diag.label + '</span>',
      '  </div>',
      '  <p class="panel-text">' + diag.desc + '</p>',
      '  <p class="panel-text">词库 ' + stats.wordTotal + ' 词 · 题库 ' + stats.questionTotal + ' 题</p>',
      '  <p class="panel-text">持久化存储：' + persisted + '，授权后系统更不容易清理数据。</p>',
      hint ? '  <p class="panel-warn">' + hint + '</p>' : '',
      mode === 'idb' ? '  <div class="panel-actions"><button class="btn-ghost" type="button" data-action="persist">申请持久化存储</button></div>' : '',
      '</div>'
    ].join('');
  }

  /**
   * 渲染内置内容来源面板，便于核对三个项目的导入结果
   */
  function renderSource() {
    const content = window.CONTENT || {};
    const stats = content.wordStats || {};
    const papers = content.papers || [];
    if (!stats.wordrush) return '';
    const expectedWords = Array.isArray(content.words) ? content.words.length : 0;
    const expectedQuestions = Array.isArray(content.questions) ? content.questions.length : 0;
    const actualWords = state.words.length;
    const actualQuestions = state.questions.length;
    const wordGap = expectedWords > 0 && Math.abs(actualWords - expectedWords) / expectedWords > 0.01;
    const questionGap = expectedQuestions > 0 && actualQuestions !== expectedQuestions;
    return [
      '<div class="panel">',
      '  <div class="panel-head"><h3>内置内容来源</h3></div>',
      '  <p class="panel-text">词库：WordRush ' + stats.wordrush + ' 词（高频 ' + stats.high + '），本机 ' + actualWords + ' 词</p>',
      '  <p class="panel-text">例句：TypeWords 补充 ' + stats.example + ' 条</p>',
      '  <p class="panel-text">题库：exam-practice ' + papers.length + ' 套 / ' + expectedQuestions + ' 题，本机 ' + actualQuestions + ' 题</p>',
      wordGap || questionGap
        ? '  <p class="panel-warn">内置内容写入不完整（应为 ' + expectedWords + ' 词 / ' + expectedQuestions + ' 题），可在下方导入备份恢复。</p>'
        : '',
      '  <p class="panel-note">WordRush 与 exam-practice 为 MIT 许可，TypeWords 为 GPL-3.0，仅取事实性词条字段。</p>',
      '</div>'
    ].join('');
  }

  /**
   * 统一渲染入口
   */
  function render() {
    if (!el.view) return;
    const stats = computeStats();
    const summary = Stats.summary(state.words, state.attempts);
    el.view.innerHTML = [
      '<div class="section-head">',
      '  <h2>我的</h2>',
      '  <p>学习数据概览与本地备份</p>',
      '</div>',
      renderStats(stats),
      MeStats.renderOverview(summary),
      MeStats.renderRetention(),
      MeStats.renderStudyKit(),
      renderDiag(stats),
      renderSource(),
      MeBackup.renderPanel(state.guard),
      window.PWA ? PWA.installPanelHtml() : ''
    ].join('');
  }

  /**
   * 解析所选 JSON 文件，确认后覆盖写入数据层
   */
  async function importData(file) {
    if (!file) return;
    let data = null;
    try {
      const text = await file.text();
      data = JSON.parse(text);
    } catch (err) {
      window.toast('导入失败：文件不是合法的 JSON');
      return;
    }
    if (!window.confirm('导入会覆盖当前全部数据（含未完成的背词与答题进度），确定继续吗？')) return;
    try {
      // 覆盖前留一份强制快照，导入错了还能从快照恢复
      if (window.DataGuard) await DataGuard.snapshot('导入前', true);
      const result = await DB.importAll(data);
      await load();
      if (window.AppRefresh) await window.AppRefresh();
      window.toast('导入完成：' + result.words + ' 个单词，' + result.questions + ' 道题目');
    } catch (err) {
      window.toast('导入失败：' + err.message);
    }
  }

  /**
   * 事件委托：导出 / 触发文件选择
   */
  function handleClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    if (target.dataset.action === 'export') {
      MeBackup.exportData();
      return;
    }
    if (target.dataset.action === 'import') {
      const input = document.getElementById('import-file');
      if (input) input.click();
      return;
    }
    if (target.dataset.action === 'persist') {
      requestPersist();
      return;
    }
    if (target.dataset.action === 'restore-snapshot') {
      MeBackup.restore();
      return;
    }
    if (target.dataset.action === 'retention') {
      const value = FSRS.setRetention(Number(target.dataset.value));
      render();
      window.toast('目标保持率已设为 ' + Math.round(value * 100) + '%，影响之后的复习排期');
      return;
    }
    if (target.dataset.action === 'install-app') {
      installApp();
    }
  }

  /**
   * 申请持久化存储并刷新诊断结果
   */
  async function requestPersist() {
    if (!window.PWA) return;
    const granted = await PWA.requestPersist();
    state.persisted = granted;
    render();
    window.toast(granted ? '已获得持久化存储权限' : '未能获得权限，可继续使用导出备份');
  }

  /**
   * 触发浏览器安装提示；不支持时提示手动添加步骤
   */
  async function installApp() {
    if (!window.PWA) return;
    const accepted = await PWA.install();
    window.toast(accepted ? '已开始安装，请按系统提示完成' : '请按上方文字步骤手动添加到主屏幕');
  }

  /**
   * 文件选择变化时执行导入，并清空 value 以支持重复选择同一文件
   */
  async function handleChange(event) {
    if (event.target.id !== 'import-file') return;
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    await importData(file);
  }

  return {
    init: init,
    load: load,
    render: render
  };
})();

// DONE: me.js
