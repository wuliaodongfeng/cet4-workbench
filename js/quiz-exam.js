/**
 * quiz-exam.js —— 模考计时器
 * 40 分钟倒计时，每秒只更新计时文本，归零后回调自动交卷
 */
window.QuizExam = (function () {
  const EXAM_SECONDS = 40 * 60;
  let timer = null;

  /**
   * 开始计时：onTimeout 为倒计时归零时的回调（自动交卷）
   */
  function start(state, onTimeout) {
    stop();
    state.examEndAt = Date.now() + EXAM_SECONDS * 1000;
    timer = setInterval(function () {
      tick(state, onTimeout);
    }, 1000);
  }

  /**
   * 每秒刷新剩余时间；最后 5 分钟变红，归零时停止并交卷
   */
  function tick(state, onTimeout) {
    const remain = remaining(state);
    const box = document.getElementById('quiz-timer');
    if (box) {
      box.textContent = formatClock(remain);
      box.classList.toggle('is-urgent', remain <= 300);
    }
    if (remain <= 0) {
      stop();
      window.toast('考试时间到，已自动交卷');
      if (typeof onTimeout === 'function') onTimeout();
    }
  }

  /**
   * 剩余秒数（不小于 0）
   */
  function remaining(state) {
    return Math.max(0, Math.ceil((state.examEndAt - Date.now()) / 1000));
  }

  /**
   * 已经用掉的秒数（1 秒 – 40 分钟），用于交卷后展示用时
   */
  function elapsed(state) {
    if (!state.examEndAt) return 0;
    const used = Math.round((EXAM_SECONDS * 1000 - Math.max(0, state.examEndAt - Date.now())) / 1000);
    return Math.min(EXAM_SECONDS, Math.max(1, used));
  }

  /**
   * 停止计时
   */
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  /**
   * 秒数格式化为 mm:ss
   */
  function formatClock(seconds) {
    const safe = Math.max(0, Math.floor(seconds));
    const minute = Math.floor(safe / 60);
    const second = safe % 60;
    return (minute < 10 ? '0' + minute : minute) + ':' + (second < 10 ? '0' + second : second);
  }

  return {
    EXAM_SECONDS: EXAM_SECONDS,
    start: start,
    stop: stop,
    remaining: remaining,
    elapsed: elapsed,
    formatClock: formatClock
  };
})();

// DONE: quiz-exam.js
