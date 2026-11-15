/**
 * speech.js —— 单词与例句发音
 * 使用浏览器内置 speechSynthesis，零依赖、无需音频文件，离线也可朗读
 */
window.Speech = (function () {
  let voice = null;

  /**
   * 是否支持语音合成
   */
  function supported() {
    return typeof window.speechSynthesis !== 'undefined' &&
      typeof window.SpeechSynthesisUtterance === 'function';
  }

  /**
   * 挑选英文音色：按自然度优先级匹配本地音源
   * 优先级：Google/Samsung 高质量英文语音 → Microsoft 自然语音 → 常见命名音色 → 任意 en 音色
   * 避免落到中文音色读英文（机器感强、发音失真）
   */
  function pickVoice() {
    if (!supported()) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    const isEnglish = function (item) {
      const lang = String(item.lang || '').toLowerCase();
      return lang.indexOf('en') === 0;
    };
    const PREFERRED = [
      'google us english', 'google uk english female', 'google uk english male',
      'samantha', 'karen', 'moira', 'tessa', 'fiona', 'allison', 'ava', 'susan', 'zira', 'aria',
      'microsoft aria', 'microsoft jenny', 'microsoft guy', 'microsoft michelle',
      'samsung tts', 'siri'
    ];
    const english = voices.filter(isEnglish);
    if (!english.length) return null;
    for (let i = 0; i < PREFERRED.length; i += 1) {
      const target = PREFERRED[i];
      const hit = english.filter(function (item) {
        const name = String(item.name || '').toLowerCase();
        return name.indexOf(target) >= 0;
      })[0];
      if (hit) return hit;
    }
    // 兜底：优先 local 音源（离线可用、延迟低），其次任意 en
    const local = english.filter(function (item) { return item.localService; })[0];
    return local || english[0];
  }

  /**
   * 通用朗读：先停掉上一段，避免连续点击时叠音
   */
  function speak(text, rate) {
    const content = String(text === undefined || text === null ? '' : text).trim();
    if (!content || !supported()) return false;
    try {
      window.speechSynthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(content);
      voice = voice || pickVoice();
      if (voice) utterance.voice = voice;
      utterance.lang = voice ? voice.lang : 'en-US';
      utterance.rate = rate || 0.85;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * 朗读单词，语速略慢便于跟读
   */
  function speakWord(word) {
    return speak(word, 0.8);
  }

  /**
   * 朗读例句，正常语速
   */
  function speakExample(text) {
    return speak(text, 0.88);
  }

  /**
   * 停止朗读（评分进入下一张时调用）
   */
  function stop() {
    if (!supported()) return;
    try {
      window.speechSynthesis.cancel();
    } catch (err) {
      console.warn('[speech] 停止朗读失败');
    }
  }

  /**
   * 浏览器音色列表异步加载完成后刷新缓存
   */
  if (supported() && typeof window.speechSynthesis.addEventListener === 'function') {
    window.speechSynthesis.addEventListener('voiceschanged', function () {
      voice = pickVoice();
    });
  }

  return {
    supported: supported,
    speak: speak,
    speakWord: speakWord,
    speakExample: speakExample,
    stop: stop
  };
})();

// DONE: speech.js
