/**
 * app.js —— 应用外壳
 * 负责：全局工具（toast / HTML 转义）、数据层初始化、示例数据写入、Tab 路由
 */
(function () {
  /**
   * 全局轻提示
   */
  window.toast = function (message) {
    const box = document.getElementById('toast');
    if (!box) return;
    box.textContent = message;
    box.classList.add('is-visible');
    clearTimeout(window.toast.timer);
    window.toast.timer = setTimeout(function () {
      box.classList.remove('is-visible');
    }, 2400);
  };

  /**
   * HTML 转义，避免导入的外部数据破坏页面结构
   */
  window.esc = function (value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  /**
   * 兜底：没有任何内置内容时，写入 20 词 + 10 题的示例数据
   */
  async function seedIfEmpty() {
    try {
      const words = await DB.getWords();
      if (!words.length) {
        for (const word of SEED.words) {
          await DB.putWord(word);
        }
      }
      const questions = await DB.getQuestions();
      if (!questions.length) {
        for (const question of SEED.questions) {
          await DB.putQuestion(question);
        }
      }
    } catch (err) {
      window.toast('初始化示例数据失败：' + err.message);
    }
  }

  /**
   * 写入内置词库与题库：按内容版本执行一次，已有背词进度原样保留
   */
  async function seedContent() {
    const content = window.CONTENT;
    if (!content || !Array.isArray(content.words) || !content.words.length) {
      await seedIfEmpty();
      return;
    }
    let stored = 0;
    try {
      stored = Number(window.localStorage.getItem('cet4wb:contentVersion') || 0);
    } catch (err) {
      stored = 0;
    }
    if (stored >= content.version) return;

    const existing = await DB.getWords();
    const byId = {};
    const legacy = {};
    const removeIds = [];
    existing.forEach(function (word) {
      byId[word.id] = word;
      if (/^w\d+$/.test(word.id)) legacy[String(word.word).toLowerCase()] = word;
    });
    const today = FSRS.todayStr();
    const words = content.words.map(function (item) {
      const oldLegacy = legacy[String(item.word).toLowerCase()];
      const oldById = byId[item.id];
      const merged = Object.assign({}, item);
      // 已学进度优先取同 id 记录，其次取旧的示例 id 记录
      const oldFsrs = (oldById && oldById.fsrs) || (oldLegacy && oldLegacy.fsrs);
      merged.fsrs = oldFsrs || FSRS.createFSRS(today);
      // 统一使用词库的 slug id，旧示例 id 在同一事务里删除，避免来回摇摆
      if (oldLegacy && oldLegacy.id !== merged.id) removeIds.push(oldLegacy.id);
      return merged;
    });
    try {
      await DB.putWords(words, removeIds);
      await DB.putQuestions(content.questions || []);
      window.localStorage.setItem('cet4wb:contentVersion', String(content.version));
    } catch (err) {
      window.toast('写入内置内容失败：' + err.message);
    }
  }

  /**
   * 顶部存储模式徽标
   */
  function updateStorageBadge() {
    const badge = document.getElementById('storage-badge');
    if (!badge) return;
    const mode = DB.getMode();
    const text = { idb: 'IDB', ls: 'LS', memory: '内存' }[mode] || '内存';
    badge.dataset.mode = mode;
    badge.textContent = text;
  }

  /**
   * 切换标签页，并在切换时刷新对应页面数据
   */
  async function switchTab(name) {
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.classList.toggle('is-active', tab.dataset.tab === name);
    });
    document.querySelectorAll('.page').forEach(function (page) {
      page.classList.toggle('is-active', page.dataset.page === name);
    });
    updateStorageBadge();

    if (name === 'words') {
      Words.refresh();
      return;
    }
    if (name === 'quiz') {
      Quiz.refresh();
      return;
    }
    await Me.load();
  }

  /**
   * 绑定底部导航
   */
  function bindTabs() {
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        switchTab(tab.dataset.tab);
      });
    });
  }

  /**
   * 数据被导入后，三个页面整体重载
   */
  window.AppRefresh = async function () {
    updateStorageBadge();
    await Words.reload();
    await Quiz.loadPapers();
    await Me.load();
  };

  /**
   * 启动流程：初始化存储 → 写入示例数据 → 渲染三个页面 → 绑定路由
   */
  async function bootstrap() {
    try {
      await DB.initDB();
      updateStorageBadge();
      // 先注册 Service Worker，让离线缓存与首次写库并行
      if (window.PWA) PWA.start();
      await seedContent();
      bindTabs();
      await Words.init();
      await Quiz.init();
      await Me.init();
    } catch (err) {
      window.toast('工作台启动失败：' + err.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();

// DONE: app.js
