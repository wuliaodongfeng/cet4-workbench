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
          recordExport();
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
      recordExport();
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
          recordExport();
          window.toast('已复制备份内容');
        });
      }
    });
    document.body.appendChild(box);
  }

  /**
   * 记录导出时间，供提醒与「上次导出」展示
   */
  function recordExport() {
    if (window.DataGuard) DataGuard.markExported();
  }

  /**
   * 把日期格式化为「2026-11-13 14:05」，空值显示「从未」
   */
  function formatDate(date) {
    if (!date) return '从未';
    const pad = function (value) { return value < 10 ? '0' + value : String(value); };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
      ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  /**
   * 渲染备份面板：风险说明、上次导出、最近快照与三个操作按钮
   */
  function renderPanel(info) {
    const guard = info || {};
    const snapshot = guard.snapshot;
    const days = typeof guard.lastExportDays === 'number' ? guard.lastExportDays : -1;
    const exportText = guard.lastExportAt
      ? formatDate(guard.lastExportAt) + (days >= 0 ? '（' + days + ' 天前）' : '')
      : '从未导出';
    const warn = !guard.lastExportAt || days >= 7
      ? '  <p class="panel-warn">建议现在就导出一次：清理浏览器数据、换手机都会让记录无法找回。</p>'
      : '';
    const snapshotText = snapshot
      ? formatDate(snapshot.createdAt) + ' · ' + snapshot.counts.words + ' 词 / ' +
        snapshot.counts.attempts + ' 条记录'
      : '暂无（打开页面后自动生成）';
    return [
      '<div class="panel">',
      '  <div class="panel-head"><h3>数据备份</h3><span class="panel-tag">建议每周一次</span></div>',
      '  <p class="panel-text">学习记录只保存在这台设备的浏览器里。导出的 JSON 是唯一能跨设备恢复的副本，包含词库、题库与全部答题记录。</p>',
      '  <p class="panel-text">上次导出：' + esc(exportText) + '</p>',
      '  <p class="panel-text">自动快照：' + esc(snapshotText) + '</p>',
      '  <p class="panel-note">自动快照保存在本机数据库，只能撤销误导入等操作；清除网站数据时会与学习记录一起被删除。</p>',
      warn,
      '  <div class="panel-actions">',
      '    <button class="btn-primary" type="button" data-action="export">导出全部数据</button>',
      '    <button class="btn-ghost" type="button" data-action="import">从 JSON 文件导入</button>',
      snapshot ? '    <button class="btn-ghost" type="button" data-action="restore-snapshot">从自动快照恢复</button>' : '',
      '  </div>',
      '  <input id="import-file" type="file" accept=".json,application/json" hidden />',
      '</div>'
    ].join('');
  }

  /**
   * 用最近一次自动快照覆盖当前数据，恢复后整体刷新三个页面
   */
  async function restore() {
    if (!window.DataGuard) return;
    if (!window.confirm('将用最近一次自动快照覆盖当前数据，确定继续吗？')) return;
    try {
      const record = await DataGuard.restoreLatest();
      if (window.AppRefresh) await window.AppRefresh();
      window.toast('已恢复到 ' + formatDate(new Date(record.createdAt)) + ' 的快照');
    } catch (err) {
      window.toast('恢复失败：' + err.message);
    }
  }

  return { exportData: exportData, renderPanel: renderPanel, restore: restore };
})();
