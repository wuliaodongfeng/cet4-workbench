/**
 * me-backup.js —— 备份导出
 * iOS 优先走系统分享，桌面走下载，均不可用时提供可复制文本
 */
window.MeBackup = (function () {
  /**
   * 生成备份文本，优先走系统分享（iOS），否则下载或复制
   */
  async function exportData() {
    try {
      const data = await DB.exportAll();
      const text = JSON.stringify(data, null, 2);
      const fileName = '四级工作台备份-' + FSRS.todayStr().replace(/-/g, '') + '.json';
      const file = new File([text], fileName, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: '四级学习工作台备份' });
          window.toast('已打开系统分享面板');
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }
      if (window.PWA && PWA.isIOS()) {
        showCopy(text);
        return;
      }
      downloadText(text, fileName);
      window.toast('已导出备份文件');
    } catch (err) {
      window.toast('导出失败：' + err.message);
    }
  }

  /**
   * 桌面端用 a[download] 下载文本文件
   */
  function downloadText(text, fileName) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  /**
   * iOS 无分享能力时的兜底：弹出可复制的备份文本
   */
  function showCopy(text) {
    const box = document.createElement('div');
    box.className = 'copy-mask';
    box.innerHTML = [
      '<div class="copy-box">',
      '  <h3>复制备份内容</h3>',
      '  <p class="panel-text">长按下方文本全选复制，粘贴到「文件」App 或备忘录保存。</p>',
      '  <textarea class="copy-area" readonly></textarea>',
      '  <div class="panel-actions">',
      '    <button class="btn-primary" type="button" data-copy="confirm">复制</button>',
      '    <button class="btn-ghost" type="button" data-copy="close">关闭</button>',
      '  </div>',
      '</div>'
    ].join('');
    const area = box.querySelector('.copy-area');
    area.value = text;
    box.addEventListener('click', function (event) {
      const target = event.target.closest('[data-copy]');
      if (!target) return;
      if (target.dataset.copy === 'close') {
        document.body.removeChild(box);
        return;
      }
      area.select();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () {
          window.toast('已复制备份内容');
        });
      }
    });
    document.body.appendChild(box);
  }

  return { exportData: exportData };
})();
