/**
 * word-tip.js —— 点词翻译（纯前端，离线可用）
 * 渲染英文文本时按内置词典包词；点击弹出音标 / 释义 / 发音小浮层。
 * 词典来自 window.CONTENT.words（4540+ 词），零网络请求。
 */
window.WordTip = (function () {
  let dict = null;
  let tipEl = null;
  let tipWord = '';
  let lastTarget = null;

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 首次使用时建立 小写词 → 词条 的索引 */
  function ensureDict() {
    if (dict) return dict;
    dict = new Map();
    const words = (window.CONTENT && window.CONTENT.words) || [];
    words.forEach(function (item) {
      const key = String((item && item.word) || '').toLowerCase().trim();
      if (!key || !/^[a-z][a-z'’-]*$/.test(key)) return;
      if (!dict.has(key)) {
        dict.set(key, {
          word: String(item.word),
          phonetic: String(item.phonetic || ''),
          meaning: String(item.meaning || '')
        });
      }
    });
    return dict;
  }

  /** 功能词白名单：只查原形，绝不做后缀还原（避免 is→I、was→wa 这类误命中） */
  const STOP_STEMS = new Set([
    'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'has', 'have', 'had',
    'does', 'did', 'do', 'will', 'would', 'shall', 'should', 'can', 'could',
    'may', 'might', 'must', 'its', 'his', 'hers', 'this', 'that', 'these', 'those',
    'as', 'us', 'yes', 'no', 'nor', 'but', 'and', 'the', 'for', 'not', 'all', 'any'
  ]);

  /** 去掉所有格与常见屈折后缀再查词典（复数 / 时态 / 比较级） */
  function lookup(token) {
    const table = ensureDict();
    const raw = String(token || '').toLowerCase().replace(/['’]s$/, '');
    if (!raw || !/^[a-z][a-z'’-]*$/.test(raw)) return null;
    if (table.has(raw)) return table.get(raw);
    if (STOP_STEMS.has(raw)) return null;
    const forms = [];
    if (raw.endsWith('ies')) forms.push(raw.slice(0, -3) + 'y');
    if (raw.endsWith('ied')) forms.push(raw.slice(0, -3) + 'y');
    if (raw.endsWith('ves')) forms.push(raw.slice(0, -3) + 'f', raw.slice(0, -3) + 'fe');
    if (raw.endsWith('ed') || raw.endsWith('ing')) {
      const stem = raw.slice(0, -2);
      forms.push(stem, stem.slice(0, -1));
    }
    if (raw.endsWith('es')) forms.push(raw.slice(0, -2));
    if (raw.endsWith('ers')) forms.push(raw.slice(0, -3));
    if (raw.endsWith('s')) forms.push(raw.slice(0, -1));
    ['er', 'est', 'ly'].forEach(function (suffix) {
      if (raw.endsWith(suffix) && raw.length > suffix.length + 2) {
        forms.push(raw.slice(0, -suffix.length));
        // easier→easy / heavier→heavy 这类 y→i 变化
        if (raw.endsWith('ier') || raw.endsWith('iest')) forms.push(raw.slice(0, -3) + 'y');
      }
    });
    // -er/-or 施动者后缀还原（designer→design 不在词库时再试 design）
    if (raw.endsWith('er') && raw.length > 4) forms.push(raw.slice(0, -2));
    for (let i = 0; i < forms.length; i += 1) {
      const candidate = forms[i];
      // 还原出的词干太短（<3）多半是巧合（is→i），不接受
      if (!candidate || candidate.length < 3) continue;
      if (table.has(candidate)) return table.get(candidate);
    }
    return null;
  }

  /** 专有名词 / 句首大写词不做生词标注，减少噪音 */
  function isProperLike(token) {
    return /^[A-Z]/.test(token);
  }

  /**
   * 把英文文本转成可点词的 HTML（内部已完成转义）
   * 词典命中 → wt-word（可点查释义）；未收录的普通词 → wt-hard（生词提示）
   */
  function enrich(text) {
    const source = String(text === undefined || text === null ? '' : text);
    if (!source.trim()) return escapeHtml(source);
    ensureDict();
    let out = '';
    let last = 0;
    const re = /[A-Za-z][A-Za-z'’-]*/g;
    let match;
    while ((match = re.exec(source)) !== null) {
      out += escapeHtml(source.slice(last, match.index));
      const token = match[0];
      const entry = lookup(token);
      if (entry) {
        out += '<span class="wt-word" data-w="' + escapeHtml(entry.word) + '">' + escapeHtml(token) + '</span>';
      } else if (!isProperLike(token) && token.replace(/[^A-Za-z]/g, '').length >= 4) {
        out += '<span class="wt-hard">' + escapeHtml(token) + '</span>';
      } else {
        out += escapeHtml(token);
      }
      last = match.index + token.length;
    }
    out += escapeHtml(source.slice(last));
    return out;
  }

  function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement('div');
    tipEl.className = 'wt-tip';
    tipEl.setAttribute('role', 'status');
    document.body.appendChild(tipEl);
    return tipEl;
  }

  function hideTip() {
    if (!tipEl) return;
    tipEl.classList.remove('is-visible');
    tipWord = '';
    lastTarget = null;
  }

  function placeTip(rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(320, vw - 24);
    tipEl.style.maxWidth = width + 'px';
    const height = tipEl.offsetHeight || 90;
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(12, Math.min(vw - width - 12, left));
    let top = rect.top - height - 10;
    if (top < 8) top = Math.min(vh - height - 8, rect.bottom + 10);
    tipEl.style.left = left + 'px';
    tipEl.style.top = Math.max(8, top) + 'px';
  }

  function showTip(target) {
    if (lastTarget === target && tipEl && tipEl.classList.contains('is-visible')) {
      hideTip();
      return;
    }
    const word = target.dataset.w || target.textContent.trim();
    const entry = lookup(word);
    tipWord = entry ? entry.word : word;
    const phonetic = entry && entry.phonetic ? entry.phonetic : '';
    const meaning = entry && entry.meaning ? entry.meaning : '词库未收录，可能是专有名词或超纲词';
    const tip = ensureTip();
    const speakBtn = (window.Speech && window.Speech.supported && window.Speech.supported())
      ? '<button class="wt-tip-speak" type="button">发音</button>' : '';
    tip.innerHTML = '<div class="wt-tip-word"><span>' + escapeHtml(tipWord) + '</span>' +
      (phonetic ? '<span class="wt-tip-phon">' + escapeHtml(phonetic) + '</span>' : '') +
      speakBtn + '</div>' +
      '<div class="wt-tip-mean">' + escapeHtml(meaning) + '</div>';
    tip.classList.add('is-visible');
    placeTip(target.getBoundingClientRect());
    lastTarget = target;
  }

  /** 全局点击委托：点词显示浮层，点其他区域收起 */
  function init() {
    document.addEventListener('click', function (event) {
      const speak = event.target.closest('.wt-tip-speak');
      if (speak) {
        if (window.Speech && window.Speech.speakWord && tipWord) window.Speech.speakWord(tipWord);
        return;
      }
      const target = event.target.closest('.wt-word');
      if (target) {
        showTip(target);
      } else {
        hideTip();
      }
    });
    document.addEventListener('scroll', hideTip, { passive: true, capture: true });
    window.addEventListener('resize', hideTip);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return {
    enrich: enrich,
    lookup: lookup
  };
})();

// DONE: word-tip.js
