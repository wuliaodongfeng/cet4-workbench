/**
 * stats.js —— 学习统计计算（纯函数，不操作 DOM）
 * 数据来源只有词卡与答题记录，不新增存储表
 */
window.Stats = (function () {
  const WEEK = 7;

  /**
   * 时间戳转本地日期键 YYYY-MM-DD
   */
  function dayKey(timestamp) {
    const date = new Date(Number(timestamp) || 0);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return date.getFullYear() + '-' + (month < 10 ? '0' + month : month) + '-' + (day < 10 ? '0' + day : day);
  }

  /**
   * 汇总有学习记录的日期集合（背词与做题都算打卡）
   */
  function activeDaySet(attempts) {
    const set = {};
    (attempts || []).forEach(function (attempt) {
      const key = dayKey(attempt.timestamp);
      if (key !== '1970-01-01') set[key] = true;
    });
    return set;
  }

  /**
   * 连续打卡天数：从今天（或昨天）往前数，遇到空档即停止
   */
  function streak(attempts) {
    const set = activeDaySet(attempts);
    const today = FSRS.todayStr();
    let cursor = set[today] ? today : FSRS.addDays(today, -1);
    if (!set[cursor]) return 0;
    let days = 0;
    while (set[cursor]) {
      days += 1;
      cursor = FSRS.addDays(cursor, -1);
    }
    return days;
  }

  /**
   * 已学词数（reps > 0）与词汇覆盖率
   */
  function coverage(words) {
    const total = (words || []).length;
    const learned = (words || []).filter(function (word) {
      return word.fsrs && Number(word.fsrs.reps) > 0;
    }).length;
    return {
      learned: learned,
      total: total,
      percent: total ? Math.round((learned / total) * 100) : 0
    };
  }

  /**
   * 近 7 天逐日正确率（只统计选择题与填空题的作答记录）
   * 返回按日期正序的 [{ date, label, total, correct, percent }]
   */
  function last7(attempts) {
    const map = {};
    (attempts || []).forEach(function (attempt) {
      if (attempt.kind !== 'question') return;
      const key = dayKey(attempt.timestamp);
      if (!map[key]) map[key] = { date: key, total: 0, correct: 0 };
      map[key].total += 1;
      if (attempt.correct) map[key].correct += 1;
    });

    const list = [];
    const today = FSRS.todayStr();
    for (let offset = WEEK - 1; offset >= 0; offset -= 1) {
      const date = FSRS.addDays(today, -offset);
      const item = map[date] || { date: date, total: 0, correct: 0 };
      list.push({
        date: date,
        label: date.slice(5),
        total: item.total,
        correct: item.correct,
        percent: item.total ? Math.round((item.correct / item.total) * 100) : 0
      });
    }
    return list;
  }

  /**
   * 近 7 天总正确率
   */
  function weekAccuracy(days) {
    let total = 0;
    let correct = 0;
    (days || []).forEach(function (day) {
      total += day.total;
      correct += day.correct;
    });
    return { total: total, correct: correct, percent: total ? Math.round((correct / total) * 100) : 0 };
  }

  /**
   * 今日已完成的答题数（背词与做题合计），用于首页强提示
   */
  function todayDone(attempts) {
    const today = FSRS.todayStr();
    return (attempts || []).filter(function (attempt) {
      return dayKey(attempt.timestamp) === today;
    }).length;
  }

  /**
   * 统一汇总，供「我的」页与首页共用
   */
  function summary(words, attempts) {
    const days = last7(attempts);
    return {
      coverage: coverage(words),
      streak: streak(attempts),
      days: days,
      week: weekAccuracy(days),
      todayDone: todayDone(attempts)
    };
  }

  return {
    dayKey: dayKey,
    streak: streak,
    coverage: coverage,
    last7: last7,
    weekAccuracy: weekAccuracy,
    todayDone: todayDone,
    summary: summary
  };
})();

// DONE: stats.js
