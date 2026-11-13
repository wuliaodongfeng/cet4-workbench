/**
 * wrongbook.js —— 错题本数据层
 * 不新增数据表：从 attempts 里聚合每道题的最新一次作答，筛出仍然答错的题
 */
window.WrongBook = (function () {
  /**
   * 取每道题的最新一条作答记录
   */
  function latestAttempts(attempts) {
    const map = {};
    (attempts || []).forEach(function (attempt) {
      if (!attempt || attempt.kind !== 'question') return;
      const prev = map[attempt.refId];
      if (!prev || Number(attempt.timestamp) >= Number(prev.timestamp)) map[attempt.refId] = attempt;
    });
    return map;
  }

  /**
   * 生成错题本条目：按最近答错时间倒序，附带题目对象
   * @returns {Array<{question: object, attempt: object}>}
   */
  function list(questions, attempts) {
    const latest = latestAttempts(attempts);
    const index = {};
    (questions || []).forEach(function (question) {
      index[question.id] = question;
    });

    return Object.keys(latest)
      .map(function (refId) {
        return { question: index[refId], attempt: latest[refId] };
      })
      .filter(function (item) {
        return item.question && item.attempt.correct === false;
      })
      .sort(function (a, b) {
        return Number(b.attempt.timestamp) - Number(a.attempt.timestamp);
      });
  }

  /**
   * 错题数量，用于试卷列表入口展示
   */
  function count(questions, attempts) {
    return list(questions, attempts).length;
  }

  return {
    list: list,
    count: count
  };
})();

// DONE: wrongbook.js
