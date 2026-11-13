/**
 * pwa.js —— 离线与安装能力
 * 负责：注册 Service Worker、安装引导、持久化存储申请、记录上次打开时间
 */
window.PWA = (function () {
  const LAST_OPEN_KEY = 'cet4wb:lastOpen';
  let installEvent = null;
  let gapHours = 0;

  /**
   * 判断是否为 iOS 设备（用于展示「添加到主屏幕」步骤）
   */
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  /**
   * 判断是否为 iOS 上的 Safari；iOS 第三方浏览器不支持添加到主屏幕
   */
  function isSafariIOS() {
    return isIOS() && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
  }

  /**
   * 记录本次打开时间，并算出距离上次打开的间隔小时数
   */
  function markOpen() {
    try {
      const prev = Number(window.localStorage.getItem(LAST_OPEN_KEY) || 0);
      if (prev > 0) gapHours = Math.max(0, (Date.now() - prev) / 3600000);
      window.localStorage.setItem(LAST_OPEN_KEY, String(Date.now()));
    } catch (err) {
      gapHours = 0;
    }
    return gapHours;
  }

  /**
   * 仅在 http(s) 下注入 manifest，避免 file:// 双击打开时产生 CORS 报错
   */
  function ensureManifest() {
    if (document.querySelector('link[rel="manifest"]')) return;
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = 'manifest.webmanifest';
    document.head.appendChild(link);
  }

  /**
   * 注册 Service Worker；file:// 或浏览器不支持时静默跳过
   */
  async function register() {
    if (!('serviceWorker' in navigator)) return false;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return false;
    ensureManifest();
    try {
      await navigator.serviceWorker.register('./sw.js');
      return true;
    } catch (err) {
      console.warn('[pwa] Service Worker 注册失败：' + err.message);
      return false;
    }
  }

  /**
   * 申请持久化存储，降低系统回收数据的概率
   */
  async function requestPersist() {
    if (!navigator.storage || typeof navigator.storage.persist !== 'function') return false;
    try {
      return await navigator.storage.persist();
    } catch (err) {
      return false;
    }
  }

  /**
   * 查询当前是否已获得持久化存储权限
   */
  async function isPersisted() {
    if (!navigator.storage || typeof navigator.storage.persisted !== 'function') return false;
    try {
      return await navigator.storage.persisted();
    } catch (err) {
      return false;
    }
  }

  /**
   * 监听可安装事件，供「我的」页按钮调用
   */
  function watchInstall() {
    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      installEvent = event;
      const button = document.querySelector('[data-action="install-app"]');
      if (button) button.removeAttribute('hidden');
    });
  }

  /**
   * 触发安装提示；不支持时返回 false，由界面展示手动步骤
   */
  async function install() {
    if (!installEvent) return false;
    installEvent.prompt();
    const choice = await installEvent.userChoice;
    installEvent = null;
    return choice && choice.outcome === 'accepted';
  }

  /**
   * 「安装到桌面」面板文案：iOS 与 Android 步骤不同
   */
  function installPanelHtml() {
    let steps = '在 Chrome 右上角菜单中选择「安装应用」或「添加到主屏幕」，之后可从桌面图标离线打开。';
    if (isSafariIOS()) {
      steps = '在 Safari 中点底部「分享」→「添加到主屏幕」，之后从桌面图标打开即可离线使用。';
    } else if (isIOS()) {
      steps = 'iPhone 上的第三方浏览器不支持添加主屏幕，请改用 Safari 打开本页，再点「分享」→「添加到主屏幕」。';
    }
    return [
      '<div class="panel">',
      '  <div class="panel-head"><h3>安装到桌面</h3></div>',
      '  <p class="panel-text">' + steps + '</p>',
      '  <p class="panel-text">首次安装需要联网一次；安装后断网也能背词和刷题。</p>',
      '  <div class="panel-actions">',
      '    <button class="btn-primary" type="button" data-action="install-app" hidden>立即安装</button>',
      '  </div>',
      '</div>'
    ].join('');
  }

  /**
   * 离线提醒：超过 20 小时未打开时提示一次
   */
  function offlineHint() {
    if (gapHours < 20) return '';
    const days = Math.floor(gapHours / 24);
    const ago = days >= 1 ? days + ' 天' : Math.round(gapHours) + ' 小时';
    return '距离上次打开已 ' + ago + '，建议保持每隔一两天打开一次，避免手机系统回收离线缓存。';
  }

  /**
   * 启动：记录打开时间并注册 Service Worker
   */
  async function start() {
    markOpen();
    watchInstall();
    await register();
  }

  return {
    start: start,
    install: install,
    requestPersist: requestPersist,
    isPersisted: isPersisted,
    installPanelHtml: installPanelHtml,
    offlineHint: offlineHint,
    isIOS: isIOS
  };
})();
