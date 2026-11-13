/**
 * word-spell.js —— 拼写判分工具
 * 负责：归一化、编辑距离、宽松/严格判错模式（设置写入 localStorage）
 */
window.Spell = (function () {
  const MODE_KEY = 'cet4wb:spellMode';

  /** 读取判错模式：loose（宽松，允许个别字母错）| strict（必须完全一致） */
  function mode() {
    try {
      return window.localStorage.getItem(MODE_KEY) === 'strict' ? 'strict' : 'loose';
    } catch (err) {
      return 'loose';
    }
  }

  /** 切换并保存判错模式，返回切换后的模式 */
  function toggle() {
    const next = mode() === 'strict' ? 'loose' : 'strict';
    try {
      window.localStorage.setItem(MODE_KEY, next);
    } catch (err) {
      // 存储不可用时只在本次会话生效
    }
    return next;
  }

  /** 归一化：转小写、只保留字母 */
  function normalize(text) {
    return String(text).toLowerCase().replace(/[^a-z]/g, '');
  }

  /** 编辑距离：超过上限立即返回上限 + 1，避免长词全量计算 */
  function distance(a, b, limit) {
    if (Math.abs(a.length - b.length) > limit) return limit + 1;
    let prev = [];
    for (let j = 0; j <= b.length; j += 1) prev.push(j);
    for (let i = 1; i <= a.length; i += 1) {
      const current = [i];
      let min = i;
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        current[j] = Math.min(prev[j] + 1, current[j - 1] + 1, prev[j - 1] + cost);
        min = Math.min(min, current[j]);
      }
      if (min > limit) return limit + 1;
      prev = current;
    }
    return prev[b.length];
  }

  /** 容错上限：宽松模式下长词允许 2 个字母错，短词 1 个；严格模式必须一致 */
  function allowance(word) {
    if (mode() === 'strict') return 0;
    return word.length >= 8 ? 2 : 1;
  }

  /** 相邻字母互换（如 recieve / receive）按 1 个错误计算 */
  function isAdjacentSwap(a, b) {
    if (a.length !== b.length) return false;
    let first = -1;
    for (let i = 0; i < a.length; i += 1) {
      if (a.charAt(i) === b.charAt(i)) continue;
      if (first < 0) {
        first = i;
        continue;
      }
      if (i !== first + 1) return false;
      return a.charAt(first) === b.charAt(i) && a.charAt(i) === b.charAt(first) &&
        a.slice(i + 1) === b.slice(i + 1);
    }
    return false;
  }

  /** 判断用户输入是否算拼写正确 */
  function judge(input, word) {
    const expected = normalize(word);
    const typed = normalize(input);
    if (!typed) return false;
    const limit = allowance(expected);
    if (distance(typed, expected, limit) <= limit) return true;
    return limit > 0 && isAdjacentSwap(typed, expected);
  }

  return {
    mode: mode,
    toggle: toggle,
    normalize: normalize,
    distance: distance,
    allowance: allowance,
    judge: judge
  };
})();
