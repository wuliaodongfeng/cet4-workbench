/**
 * quiz-core.js —— 刷题核心逻辑（判分、落盘、交卷统计）
 * 只处理数据，不操作 DOM；由 quiz.js 调用
 */
window.QuizCore = (function () {
  /**
   * 判断作答是否为空
   */
  function isEmpty(answer) {
    if (answer === undefined || answer === null) return true;
    return Array.isArray(answer) ? answer.length === 0 : String(answer).trim() === '';
  }

  /**
   * 判分：单选比字母，多选比排序后集合，填空支持 a|b 多答案
   */
  function judge(question, answer) {
    if (isEmpty(answer)) return false;
    const raw = Array.isArray(answer) ? answer.join('') : String(answer);
    const expected = String(question.answer === undefined || question.answer === null ? '' : question.answer);

    if (question.type === 'multiple') {
      const given = raw.toUpperCase().replace(/[^A-Z]/g, '').split('').sort().join('');
      const target = expected.toUpperCase().replace(/[^A-Z]/g, '').split('').sort().join('');
      return given === target;
    }
    if (question.type === 'blank') {
      const normalize = function (text) {
        return String(text).trim().toLowerCase().replace(/\s+/g, ' ');
      };
      const given = normalize(raw);
      return expected.split('|').some(function (item) {
        return normalize(item) === given;
      });
    }
    return raw.trim().toUpperCase() === expected.trim().toUpperCase();
  }

  /**
   * 从题目 id 反推所属 section：src-exam-cet4-mock-01-cloze-c1 → cloze
   */
  function sectionOf(question) {
    const paperId = String(question.paperId || '');
    const prefix = paperId + '-';
    if (!paperId || question.id.indexOf(prefix) !== 0) return '';
    return question.id.slice(prefix.length).split('-')[0];
  }

  /**
   * 断点快照键：整卷与专项练习各一份
   */
  function draftKey(paperId) {
    return 'quiz-' + paperId;
  }

  /**
   * 写入整卷快照：done=true 表示交卷作废
   */
  function writeDraft(state, done) {
    if (!state.paperId || state.retry) return;
    DB.putDraft({
      id: draftKey(state.paperId),
      kind: 'quiz',
      paperId: state.paperId,
      index: state.index,
      answers: state.answers,
      done: !!done,
      updatedAt: Date.now()
    }).catch(function (err) {
      window.toast('保存作答进度失败：' + err.message);
    });
  }

  /**
   * 作答即落盘：每题固定 id，改选会覆盖旧记录，进度统计不重复
   */
  async function recordAnswer(state, question) {
    if (state.retry || !question) return;
    const answer = state.answers[question.id];
    if (isEmpty(answer)) return;
    const correct = judge(question, answer);
    try {
      await DB.putAttempt({
        id: 'qa-' + question.id,
        refId: question.id,
        kind: 'question',
        correct: correct,
        rating: correct ? 3 : 1,
        timestamp: Date.now()
      });
    } catch (err) {
      window.toast('保存答题记录失败：' + err.message);
    }
  }

  /**
   * 交卷统计：返回得分与错题列表（错题只放内存，不单独建表）
   */
  function score(state) {
    let correct = 0;
    let unanswered = 0;
    const wrong = [];
    state.questions.forEach(function (question) {
      if (isEmpty(state.answers[question.id])) unanswered += 1;
      if (judge(question, state.answers[question.id])) correct += 1;
      else wrong.push(question);
    });
    return {
      score: { correct: correct, total: state.questions.length },
      wrong: wrong,
      unanswered: unanswered
    };
  }

  return {
    isEmpty: isEmpty,
    judge: judge,
    sectionOf: sectionOf,
    draftKey: draftKey,
    writeDraft: writeDraft,
    recordAnswer: recordAnswer,
    score: score
  };
})();

// DONE: quiz-core.js
