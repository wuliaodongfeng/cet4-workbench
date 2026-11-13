/**
 * fsrs.js —— 简化版 FSRS 调度器（纯函数，不依赖 DOM）
 * 评分：Again=1 / Hard=2 / Good=3 / Easy=4
 * 核心三变量：stability（记忆稳定度，天）、difficulty（难度 1–10）、retrievability（当前可回忆概率）
 * 目标保持率：0.85 / 0.90，可在「我的」页切换，只影响之后的排期
 */
window.FSRS = (function () {
  const RATING = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 };
  const RETENTION_KEY = 'cet4wb:retention';
  const RETENTION_DEFAULT = 0.9;
  const RETENTION_OPTIONS = [0.85, 0.9];
  // 首次评分给的初始稳定度（天），Again 也至少留 1 天，避免当天反复出现
  const INITIAL_STABILITY = { 1: 0.8, 2: 1.6, 3: 2.8, 4: 4.5 };
  // 复习时稳定度的增长倍数：Again 属于遗忘，直接折损
  const GROWTH = { 1: 0.35, 2: 1.15, 3: 1.75, 4: 2.4 };
  const MAX_INTERVAL = 365;

  /**
   * 数字补零
   */
  function pad(value) {
    return value < 10 ? '0' + value : '' + value;
  }

  /**
   * 把 Date 转成本地日期字符串 YYYY-MM-DD
   */
  function toDateStr(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  /**
   * 今天的日期字符串，用于和 due 做字典序比较
   */
  function todayStr() {
    return toDateStr(new Date());
  }

  /**
   * 在日期字符串上增加天数，返回新的日期字符串
   */
  function addDays(dateStr, days) {
    const parts = String(dateStr).split('-').map(Number);
    const date = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    date.setDate(date.getDate() + days);
    return toDateStr(date);
  }

  /**
   * 两个日期字符串之间的天数差（b - a）
   */
  function diffDays(a, b) {
    const pa = String(a).split('-').map(Number);
    const pb = String(b).split('-').map(Number);
    const start = new Date(pa[0], (pa[1] || 1) - 1, pa[2] || 1).getTime();
    const end = new Date(pb[0], (pb[1] || 1) - 1, pb[2] || 1).getTime();
    return Math.round((end - start) / 86400000);
  }

  /**
   * 读取目标保持率（0.85 / 0.90），异常时回落到 0.9
   */
  function getRetention() {
    try {
      const value = Number(window.localStorage.getItem(RETENTION_KEY));
      return RETENTION_OPTIONS.indexOf(value) >= 0 ? value : RETENTION_DEFAULT;
    } catch (err) {
      return RETENTION_DEFAULT;
    }
  }

  /**
   * 保存目标保持率；非法值忽略，返回最终生效值
   */
  function setRetention(value) {
    const next = Number(value);
    if (RETENTION_OPTIONS.indexOf(next) < 0) return getRetention();
    try {
      window.localStorage.setItem(RETENTION_KEY, String(next));
    } catch (err) {
      return getRetention();
    }
    return next;
  }

  /**
   * 保持率换算成间隔倍数：0.9 → 1，0.85 → 1.62（容许遗忘更多，间隔更长）
   */
  function retentionFactor() {
    return Math.log(getRetention()) / Math.log(0.9);
  }

  /**
   * 生成初始 fsrs 字段（stability=0, difficulty=5）
   */
  function createFSRS(dueStr) {
    return {
      stability: 0,
      difficulty: 5,
      due: dueStr || todayStr(),
      reps: 0,
      lapses: 0,
      state: 'new',
      interval: 0,
      lastReview: ''
    };
  }

  /**
   * 到期判断：due <= today
   */
  function isDue(word) {
    if (!word || !word.fsrs) return true;
    // 已掌握的词不再进入任何复习队列
    if (word.fsrs.state === 'known') return false;
    if (!word.fsrs.due) return true;
    return String(word.fsrs.due) <= todayStr();
  }

  /**
   * 评分标签（供界面展示）
   */
  function ratingLabel(rating) {
    return { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' }[rating] || 'Good';
  }

  /**
   * 当前可回忆概率 R = 0.9^(已过天数 / 稳定度)，没有上次复习记录时视为刚复习过
   */
  function retrievability(fsrs) {
    const stability = Math.max(0.1, Number(fsrs.stability) || 0);
    const anchor = fsrs.lastReview || (fsrs.due ? addDays(fsrs.due, -(Number(fsrs.interval) || 0)) : todayStr());
    const elapsed = Math.max(0, diffDays(anchor, todayStr()));
    return Math.pow(0.9, elapsed / stability);
  }

  /**
   * 由稳定度与保持率算出间隔天数（1–365）
   */
  function intervalOf(stability) {
    const days = Math.round(Math.max(0.4, stability) * retentionFactor());
    return Math.min(MAX_INTERVAL, Math.max(1, days));
  }

  /**
   * 对一张词卡打分，返回更新后的 word 对象（不修改原对象）
   * 新卡：S0 由评分档位决定；复习卡：S' = S × 增长倍数 × 难度修正 × 可回忆概率修正
   * 难度 D' = clamp(D + (3 - rating) × 0.6, 1, 10)，评得越低难度越高
   */
  function rate(word, rating) {
    const safeRating = Math.min(4, Math.max(1, Math.round(Number(rating) || 3)));
    const prev = word && word.fsrs ? Object.assign(createFSRS(), word.fsrs) : createFSRS();
    const prevStability = Number(prev.stability) || 0;
    const prevDifficulty = Math.min(10, Math.max(1, Number(prev.difficulty) || 5));
    const nextDifficulty = Math.min(10, Math.max(1, prevDifficulty + (3 - safeRating) * 0.6));

    let nextStability;
    if (prevStability <= 0) {
      nextStability = INITIAL_STABILITY[safeRating];
    } else {
      const factor = GROWTH[safeRating];
      const difficultyFix = 1 + (10 - prevDifficulty) * 0.06;
      const recallFix = 0.7 + 0.3 * retrievability(prev);
      nextStability = Math.max(0.4, prevStability * factor * difficultyFix * recallFix);
    }

    const interval = intervalOf(nextStability);
    return Object.assign({}, word, {
      fsrs: {
        stability: Number(nextStability.toFixed(2)),
        difficulty: Number(nextDifficulty.toFixed(2)),
        due: addDays(todayStr(), interval),
        reps: (Number(prev.reps) || 0) + 1,
        lapses: (Number(prev.lapses) || 0) + (safeRating === 1 ? 1 : 0),
        state: 'review',
        interval: interval,
        lastReview: todayStr()
      }
    });
  }

  /**
   * 四个评分档对应的间隔预览（天），用于界面说明排期
   */
  function previewIntervals(word) {
    return [1, 2, 3, 4].map(function (rating) {
      return intervalOf(Number((rate(word, rating).fsrs || {}).stability) || 1);
    });
  }

  return {
    RATING: RATING,
    rate: rate,
    isDue: isDue,
    createFSRS: createFSRS,
    todayStr: todayStr,
    addDays: addDays,
    diffDays: diffDays,
    ratingLabel: ratingLabel,
    retrievability: retrievability,
    getRetention: getRetention,
    setRetention: setRetention,
    retentionOptions: RETENTION_OPTIONS,
    previewIntervals: previewIntervals
  };
})();

// DONE: fsrs.js
