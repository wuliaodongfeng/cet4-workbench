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
   * 挑选英文音色：优先 en-US，其次 en-GB，避免用中文音色读英文
   */
  function pickVoice() {
    if (!supported()) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    const find = function (lang) {
      return voices.filter(function (item) {
        return String(item.lang || '').toLowerCase().indexOf(lang) === 0;
      })[0];
    };
    return find('en-us') || find('en-gb') || find('en') || null;
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
      utterance.rate = rate || 0.92;
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
    return speak(word, 0.82);
  }

  /**
   * 朗读例句，正常语速
   */
  function speakExample(text) {
    return speak(text, 0.95);
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
