/**
 * db.js —— 数据访问层
 * 存储优先级：IndexedDB → localStorage → 内存
 * 对外暴露 window.DB，所有方法均为异步
 */
window.DB = (function () {
  const DB_NAME = 'cet4-workbench';
  const DB_VERSION = 2;
  const STORES = ['words', 'questions', 'attempts', 'drafts'];
  const LS_PREFIX = 'cet4wb:';

  let mode = 'memory';
  let idb = null;
  // localStorage / 内存模式的运行时镜像，保证读写一致
  const memory = { words: [], questions: [], attempts: [], drafts: [] };

  /** 打开 IndexedDB；浏览器禁用（如 file://）或超时则 reject */
  function openIDB() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error('浏览器不支持 IndexedDB'));
        return;
      }
      let request = null;
      try {
        request = window.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (err) {
        reject(err);
        return;
      }
      let settled = false;
      const timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error('打开 IndexedDB 超时'));
      }, 5000);

      request.onupgradeneeded = function () {
        const database = request.result;
        STORES.forEach(function (name) {
          if (!database.objectStoreNames.contains(name)) {
            database.createObjectStore(name, { keyPath: 'id' });
          }
        });
      };

      request.onsuccess = function () {
        if (settled) {
          request.result.close();
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(request.result);
      };

      request.onerror = function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(request.error || new Error('打开 IndexedDB 失败'));
      };

      request.onblocked = function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error('IndexedDB 被其他标签页占用'));
      };
    });
  }

  /** 读取 IndexedDB 中某张表的全部记录 */
  function idbAll(name) {
    return new Promise(function (resolve, reject) {
      let transaction = null;
      try {
        transaction = idb.transaction(name, 'readonly');
      } catch (err) {
        reject(err);
        return;
      }
      const request = transaction.objectStore(name).getAll();
      request.onsuccess = function () {
        resolve(request.result || []);
      };
      request.onerror = function () {
        reject(request.error || new Error('读取数据失败'));
      };
    });
  }

  /** 写入（按 id 覆盖）IndexedDB 中的一条记录 */
  function idbPut(name, record) {
    return new Promise(function (resolve, reject) {
      const transaction = idb.transaction(name, 'readwrite');
      transaction.oncomplete = function () {
        resolve();
      };
      transaction.onerror = function () {
        reject(transaction.error || new Error('写入数据失败'));
      };
      transaction.objectStore(name).put(record);
    });
  }

  /** 覆盖写入多张表，使用单个事务保证原子性 */
  function idbReplaceAll(dataMap) {
    return new Promise(function (resolve, reject) {
      const transaction = idb.transaction(STORES, 'readwrite');
      transaction.oncomplete = function () {
        resolve();
      };
      transaction.onerror = function () {
        reject(transaction.error || new Error('写入数据失败'));
      };
      STORES.forEach(function (name) {
        const store = transaction.objectStore(name);
        store.clear();
        const list = Array.isArray(dataMap[name]) ? dataMap[name] : [];
        list.forEach(function (item) {
          if (item && item.id !== undefined) store.put(item);
        });
      });
    });
  }

  /** 读取 localStorage 中的整张表 */
  function lsRead(name) {
    try {
      const raw = window.localStorage.getItem(LS_PREFIX + name);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.warn('[db] 读取 localStorage 失败，改用内存数据');
      return [];
    }
  }

  /**
   * 把整张表写回 localStorage；失败则降级为内存模式
   */
  function persistLS(name, list) {
    try {
      window.localStorage.setItem(LS_PREFIX + name, JSON.stringify(list));
    } catch (err) {
      console.warn('[db] 写入 localStorage 失败，降级为内存存储');
      mode = 'memory';
    }
  }

  /** 初始化数据层，返回最终采用的存储模式 */
  async function initDB() {
    try {
      idb = await openIDB();
      mode = 'idb';
      return mode;
    } catch (err) {
      console.warn('[db] IndexedDB 不可用：' + err.message);
    }
    try {
      const probe = LS_PREFIX + '__probe';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      mode = 'ls';
      STORES.forEach(function (name) {
        memory[name] = lsRead(name);
      });
      return mode;
    } catch (err) {
      console.warn('[db] localStorage 不可用，使用内存存储');
      mode = 'memory';
      return mode;
    }
  }

  /** 读取整张表（自动适配当前存储模式） */
  async function readAll(name) {
    if (mode === 'idb') return idbAll(name);
    return memory[name].slice();
  }

  /** 写入一条记录（按 id 覆盖） */
  async function writeOne(name, record) {
    if (!record || record.id === undefined) {
      throw new Error('数据缺少 id 字段');
    }
    if (mode === 'idb') {
      await idbPut(name, record);
      return record;
    }
    const list = memory[name].filter(function (item) {
      return item.id !== record.id;
    });
    list.push(record);
    memory[name] = list;
    if (mode === 'ls') persistLS(name, list);
    return record;
  }

  /** 批量写入一张表，可在同一事务内删除指定 id */
  async function writeMany(name, list, removeIds) {
    const items = (Array.isArray(list) ? list : []).filter(function (item) {
      return item && item.id !== undefined;
    });
    if (!items.length) return;
    if (mode === 'idb') {
      return new Promise(function (resolve, reject) {
        const transaction = idb.transaction(name, 'readwrite');
        transaction.oncomplete = function () { resolve(); };
        transaction.onerror = function () { reject(transaction.error || new Error('批量写入失败')); };
        const store = transaction.objectStore(name);
        items.forEach(function (item) { store.put(item); });
        (removeIds || []).forEach(function (id) { store.delete(id); });
      });
    }
    const map = {};
    memory[name].forEach(function (item) { map[item.id] = item; });
    items.forEach(function (item) { map[item.id] = item; });
    (removeIds || []).forEach(function (id) { delete map[id]; });
    memory[name] = Object.keys(map).map(function (key) { return map[key]; });
    if (mode === 'ls') persistLS(name, memory[name]);
  }

  /** 导出全部数据（含存储模式、导出时间与未完成进度） */
  async function exportAll() {
    const words = await readAll('words');
    const questions = await readAll('questions');
    const attempts = await readAll('attempts');
    const drafts = await readAll('drafts');
    return {
      app: 'cet4-workbench',
      version: 1,
      exportedAt: new Date().toISOString(),
      mode: mode,
      words: words,
      questions: questions,
      attempts: attempts,
      drafts: drafts
    };
  }

  /**
   * 覆盖导入全部数据，返回各表条数
   */
  async function importAll(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('文件内容不是有效的 JSON 对象');
    }
    const words = Array.isArray(data.words) ? data.words : [];
    const questions = Array.isArray(data.questions) ? data.questions : [];
    const attempts = Array.isArray(data.attempts) ? data.attempts : [];
    const drafts = Array.isArray(data.drafts) ? data.drafts : [];
    if (!words.length && !questions.length && !attempts.length) {
      throw new Error('备份文件中没有可导入的数据');
    }

    if (mode === 'idb') {
      await idbReplaceAll({ words: words, questions: questions, attempts: attempts, drafts: drafts });
    } else {
      STORES.forEach(function (name) {
        const list = name === 'drafts' ? drafts : name === 'words' ? words : name === 'questions' ? questions : attempts;
        memory[name] = list.slice();
        if (mode === 'ls') persistLS(name, list);
      });
    }

    return { words: words.length, questions: questions.length, attempts: attempts.length, drafts: drafts.length };
  }

  /**
   * 读取一份未完成的断点快照（done 为 true 表示已作废）
   */
  async function getDraft(id) {
    const list = await readAll('drafts');
    const found = list.filter(function (item) {
      return item.id === id;
    })[0];
    return found && !found.done ? found : null;
  }

  return {
    initDB: initDB,
    getMode: function () { return mode; },
    getWords: function () { return readAll('words'); },
    getQuestions: function () { return readAll('questions'); },
    getAttempts: function () { return readAll('attempts'); },
    putWord: function (word) { return writeOne('words', word); },
    putQuestion: function (question) { return writeOne('questions', question); },
    putWords: function (list, removeIds) { return writeMany('words', list, removeIds); },
    putQuestions: function (list) { return writeMany('questions', list); },
    putAttempt: function (attempt) { return writeOne('attempts', attempt); },
    getDraft: getDraft,
    putDraft: function (draft) { return writeOne('drafts', draft); },
    exportAll: exportAll,
    importAll: importAll
  };
})();

// DONE: db.js
