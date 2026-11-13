/**
 * quiz.js —— 刷题页逻辑
 * 流程：试卷列表 / 错题本 / 专项练习 → 单题作答（每答一题立即落盘）→ 交卷判分 → 错题列表 → 错题重练
 * 渲染见 quiz-view.js，判分见 quiz-core.js，模考计时见 quiz-exam.js
 */
window.Quiz = (function () {
  const SECTIONS = ['cloze', 'matching', 'reading'];

  const state = {
    view: 'papers', // papers | quiz | result | wrongbook
    papers: [],
    paperId: '',
    questions: [],
    answers: {},
    index: 0,
    wrong: [],
    score: { correct: 0, total: 0 },
    retry: false,
    openMode: 'practice', // practice | exam
    mode: 'practice',
    examEndAt: 0,
    elapsed: 0,
    wrongBook: [],
    wrongCount: 0
  };

  const el = {};
  let inputTimer = null;

  /** 初始化：绑定委托事件并加载试卷列表 */
  async function init() {
    el.view = document.getElementById('quiz-view');
    el.view.addEventListener('click', handleClick);
    el.view.addEventListener('input', handleInput);
    await loadPapers();
  }

  /** 试卷列表：按 paperId 去重，统计已答进度、未完成快照与错题数 */
  async function loadPapers() {
    QuizExam.stop();
    state.view = 'papers';
    state.retry = false;
    state.questions = [];
    state.answers = {};
    render();
    try {
      const questions = await DB.getQuestions();
      const attempts = await DB.getAttempts();
      const answeredIds = {};
      attempts.forEach(function (attempt) {
        if (attempt.kind === 'question') answeredIds[attempt.refId] = true;
      });

      const map = {};
      const order = [];
      const hasContent = !!(window.CONTENT && window.CONTENT.version >= 2);
      questions.forEach(function (question) {
        if (hasContent && /^demo-/.test(question.paperId)) return;
        if (!map[question.paperId]) {
          map[question.paperId] = { paperId: question.paperId, total: 0, answered: 0 };
          order.push(question.paperId);
        }
        const paper = map[question.paperId];
        paper.total += 1;
        if (answeredIds[question.id]) paper.answered += 1;
      });

      const drafts = await Promise.all(order.map(function (paperId) {
        return DB.getDraft(QuizCore.draftKey(paperId));
      }));
      state.papers = order.map(function (paperId, position) {
        const paper = map[paperId];
        const draft = drafts[position];
        paper.resumed = !!draft && Object.keys(draft.answers || {}).length > 0;
        paper.draftIndex = draft ? draft.index || 0 : 0;
        return paper;
      });
      state.wrongCount = WrongBook.count(questions, attempts);
      render();
    } catch (err) {
      window.toast('读取试卷失败：' + err.message);
    }
  }

  /** 进入一套试卷；模考模式不复用旧答案，从第一题开始计时 */
  async function startQuiz(paperId) {
    try {
      const questions = await DB.getQuestions();
      const list = questions.filter(function (question) {
        return question.paperId === paperId;
      });
      if (!list.length) {
        window.toast('这套试卷还没有题目');
        return;
      }
      const exam = state.openMode === 'exam';
      const draft = exam ? null : await DB.getDraft(QuizCore.draftKey(paperId));
      begin(list, paperId, exam, draft);
      if (draft) window.toast('已恢复上次作答进度');
    } catch (err) {
      window.toast('打开试卷失败：' + err.message);
    }
  }

  /** 专项练习：把全部试卷里同一 section 的题目聚合成一组 */
  async function startSection(section) {
    if (SECTIONS.indexOf(section) < 0) return;
    try {
      const questions = await DB.getQuestions();
      const list = questions.filter(function (question) {
        return QuizCore.sectionOf(question) === section;
      });
      if (!list.length) {
        window.toast('这个专项暂时没有题目');
        return;
      }
      const paperId = 'section-' + section;
      const draft = await DB.getDraft(QuizCore.draftKey(paperId));
      begin(list, paperId, false, draft);
      if (draft) window.toast('已恢复该专项的上次进度');
    } catch (err) {
      window.toast('打开专项练习失败：' + err.message);
    }
  }

  /** 打开错题本：从 attempts 聚合仍然答错的题 */
  async function openWrongBook() {
    QuizExam.stop();
    try {
      const questions = await DB.getQuestions();
      const attempts = await DB.getAttempts();
      state.wrongBook = WrongBook.list(questions, attempts);
      state.wrongCount = state.wrongBook.length;
      state.view = 'wrongbook';
      render();
    } catch (err) {
      window.toast('读取错题本失败：' + err.message);
    }
  }

  /** 进入作答：统一设置现场；模考开始计时 */
  function begin(list, paperId, exam, draft) {
    QuizExam.stop();
    state.view = 'quiz';
    state.paperId = paperId;
    state.questions = list;
    state.answers = exam || !draft || !draft.answers ? {} : draft.answers;
    state.index = !exam && draft ? Math.min(draft.index || 0, list.length - 1) : 0;
    state.wrong = [];
    state.retry = false;
    state.mode = exam ? 'exam' : 'practice';
    state.elapsed = 0;
    if (exam) {
      QuizExam.start(state, function () {
        submit(true);
      });
    }
    render();
  }

  /** 错题重练入口：只重练错题本里的题，重新判分，不写回存储 */
  function practiceWrongBook() {
    if (!state.wrongBook.length) return;
    QuizExam.stop();
    state.questions = state.wrongBook.map(function (item) {
      return item.question;
    });
    state.paperId = 'wrongbook';
    state.answers = {};
    state.index = 0;
    state.wrong = [];
    state.retry = true;
    state.mode = 'practice';
    state.view = 'quiz';
    render();
  }

  /** 事件委托：模式 / 试卷 / 专项 / 错题本 / 选项 / 下一题 / 重练 / 返回 */
  function handleClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'open-mode') {
      state.openMode = target.dataset.mode === 'exam' ? 'exam' : 'practice';
      render();
    } else if (action === 'open-paper') startQuiz(target.dataset.paper);
    else if (action === 'open-section') startSection(target.dataset.section);
    else if (action === 'open-wrongbook') openWrongBook();
    else if (action === 'practice-wrongbook') practiceWrongBook();
    else if (action === 'option') chooseOption(target.dataset.letter);
    else if (action === 'next') next();
    else if (action === 'retry-wrong') retryWrong();
    else if (action === 'back-papers') loadPapers();
  }

  /** 填空题输入：停止输入 300ms 后落盘草稿与答题记录 */
  function handleInput(event) {
    const input = event.target.closest('[data-input="answer"]');
    if (!input) return;
    const question = state.questions[state.index];
    if (!question) return;
    state.answers[question.id] = input.value;
    clearTimeout(inputTimer);
    inputTimer = setTimeout(function () {
      QuizCore.writeDraft(state, false);
      QuizCore.recordAnswer(state, question);
    }, 300);
  }

  /** 记录当前题作答并立即写入：多选为数组，单选为字母 */
  function chooseOption(letter) {
    const question = state.questions[state.index];
    if (!question) return;

    if (question.type === 'multiple') {
      const current = Array.isArray(state.answers[question.id]) ? state.answers[question.id].slice() : [];
      const position = current.indexOf(letter);
      if (position >= 0) current.splice(position, 1);
      else current.push(letter);
      state.answers[question.id] = current;
    } else {
      state.answers[question.id] = letter;
    }

    render();
    QuizCore.writeDraft(state, false);
    QuizCore.recordAnswer(state, question);
  }

  /** 下一题：本题作答已即时落盘，这里只推进题序并保存快照 */
  function next() {
    const question = state.questions[state.index];
    if (!question) return;
    if (QuizCore.isEmpty(state.answers[question.id])) {
      window.toast('请先作答本题');
      return;
    }
    QuizCore.recordAnswer(state, question);

    if (state.index >= state.questions.length - 1) {
      submit(false);
      return;
    }
    state.index += 1;
    QuizCore.writeDraft(state, false);
    render();
  }

  /** 交卷：统计得分并在内存中生成错题列表；auto=true 为超时自动交卷 */
  function submit(auto) {
    const result = QuizCore.score(state);
    if (auto !== true && result.unanswered > 0 &&
      !window.confirm('还有 ' + result.unanswered + ' 题未作答，交卷后会按答错计算，确定交卷吗？')) {
      return;
    }
    QuizExam.stop();
    state.elapsed = state.mode === 'exam' ? QuizExam.elapsed(state) : 0;
    state.score = result.score;
    state.wrong = result.wrong;
    state.view = 'result';
    QuizCore.writeDraft(state, true);
    render();
  }

  /** 错题重练：只重练本轮错题，重新判分，不写回任何存储 */
  function retryWrong() {
    if (!state.wrong.length) return;
    QuizExam.stop();
    state.questions = state.wrong.slice();
    state.answers = {};
    state.index = 0;
    state.wrong = [];
    state.retry = true;
    state.mode = 'practice';
    state.view = 'quiz';
    render();
  }

  /** 统一渲染入口（委托给渲染层） */
  function render() {
    QuizView.render(state, el);
  }

  /** 标签页切回时：列表重新统计进度，作答中保持现场 */
  function refresh() {
    if (state.view === 'papers') return loadPapers();
    render();
    return Promise.resolve();
  }

  return {
    init: init,
    render: render,
    refresh: refresh,
    loadPapers: loadPapers
  };
})();

// DONE: quiz.js
