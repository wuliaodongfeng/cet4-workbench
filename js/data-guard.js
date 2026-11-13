/**
 * data-guard.js —— 本地数据保护
 * 职责：申请持久化存储、每日自动快照（保留 3 份）、记录导出时间与提醒
 * 边界：快照存在独立的 IndexedDB 中，清理站点数据时会与主库一起被删，
 *       因此它只能防误操作与写坏数据，跨设备与清缓存仍必须靠用户导出
 */
window.DataGuard = (function () {
  const BACKUP_DB = 'cet4wb-backups';
  const STORE = 'snapshots';
  const KEEP = 3;
  const DAY = 24 * 60 * 60 * 1000;
  const LAST_EXPORT = 'cet4wb:lastExportAt';
  const LAST_REMIND = 'cet4wb:lastRemindAt';
  const SNAPSHOT_GAP = DAY;

  let backupDb = null;
  let unsupported = false;

  /** 读取 localStorage 中的时间戳，异常或缺失返回 0 */
  function readTime(key) {
    try {
      return Number(window.localStorage.getItem(key) || 0);
    } catch (err) {
      return 0;
    }
  }

  /** 写入时间戳，隐私模式下失败时静默忽略 */
  function writeTime(key, value) {
    try {
      window.localStorage.setItem(key, String(value));
    } catch (err) {
      console.warn('[guard] 时间戳写入失败，提醒节奏可能重复');
    }
  }

  /** 打开快照库；失败时标记不可用，不阻断主流程 */
  function openBackupDB() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error('不支持 IndexedDB'));
        return;
      }
      const request = window.indexedDB.open(BACKUP_DB, 1);
      request.onupgradeneeded = function () {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE)) {
          database.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error || new Error('打开快照库失败'));
      };
    });
  }

  /** 获取快照库连接，失败后不再重试，避免每次渲染都报错 */
  async function getDB() {
    if (backupDb) return backupDb;
    if (unsupported) return null;
    try {
      backupDb = await openBackupDB();
      return backupDb;
    } catch (err) {
      unsupported = true;
      console.warn('[guard] 自动快照不可用：' + err.message);
      return null;
    }
  }

  /** 用游标按时间倒序读取快照，只取最新若干条 */
  function readSnapshots(limit) {
    return new Promise(function (resolve, reject) {
      const transaction = backupDb.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).openCursor(null, 'prev');
      const list = [];
      request.onsuccess = function () {
        const cursor = request.result;
        if (!cursor || list.length >= limit) {
          resolve(list);
          return;
        }
        list.push(cursor.value);
        cursor.continue();
      };
      request.onerror = function () {
        reject(request.error || new Error('读取快照失败'));
      };
    });
  }

  /** 写入一条快照，并删除超出保留份数的旧快照 */
  async function writeSnapshot(record) {
    return new Promise(function (resolve, reject) {
      const transaction = backupDb.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      transaction.oncomplete = function () {
        resolve();
      };
      transaction.onerror = function () {
        reject(transaction.error || new Error('写入快照失败'));
      };
      store.put(record);
      const cursorRequest = store.openCursor(null, 'prev');
      let index = 0;
      cursorRequest.onsuccess = function () {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        index += 1;
        if (index > KEEP) store.delete(cursor.value.id);
        cursor.continue();
      };
    });
  }

  /** 首次启动申请持久化存储，避免浏览器在空间紧张时清理数据 */
  async function requestPersist() {
    if (!navigator.storage || !navigator.storage.persist) return false;
    try {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch (err) {
      return false;
    }
  }

  /** 统计各表条数，用于快照摘要 */
  function countOf(data) {
    return {
      words: (data.words || []).length,
      questions: (data.questions || []).length,
      attempts: (data.attempts || []).length,
      drafts: (data.drafts || []).length
    };
  }

  /**
   * 生成自动快照；同一天内默认跳过，force 为真时强制写入
   */
  async function snapshot(reason, force) {
    const database = await getDB();
    if (!database) return null;
    try {
      const list = await readSnapshots(1);
      const newest = list[0];
      if (!force && newest && Date.now() - new Date(newest.createdAt).getTime() < SNAPSHOT_GAP) {
        return newest;
      }
      const data = await DB.exportAll();
      const record = {
        id: 'snap-' + Date.now(),
        createdAt: new Date().toISOString(),
        reason: reason || '每日快照',
        counts: countOf(data),
        data: data
      };
      await writeSnapshot(record);
      return record;
    } catch (err) {
      console.warn('[guard] 生成快照失败：' + err.message);
      return null;
    }
  }

  /** 读取最近一次快照，没有则返回 null */
  async function latest() {
    const database = await getDB();
    if (!database) return null;
    try {
      const list = await readSnapshots(1);
      return list[0] || null;
    } catch (err) {
      return null;
    }
  }

  /** 用最近一次快照覆盖当前数据，返回快照摘要 */
  async function restoreLatest() {
    const record = await latest();
    if (!record) throw new Error('没有可用的自动快照');
    await DB.importAll(record.data);
    return record;
  }

  /** 记录最近一次成功导出的时间 */
  function markExported() {
    writeTime(LAST_EXPORT, Date.now());
  }

  /** 汇总导出与快照状态，供「我的」页展示 */
  async function status() {
    const record = await latest();
    const lastExport = readTime(LAST_EXPORT);
    return {
      lastExportAt: lastExport ? new Date(lastExport) : null,
      lastExportDays: lastExport ? Math.floor((Date.now() - lastExport) / DAY) : -1,
      snapshot: record
        ? { createdAt: new Date(record.createdAt), counts: record.counts }
        : null
    };
  }

  /** 有学习记录且超过 7 天未导出时认为需要提醒 */
  async function shouldRemind() {
    if (DB.getMode() === 'memory') return true;
    const attempts = await DB.getAttempts();
    if (!attempts.length) return false;
    const lastExport = readTime(LAST_EXPORT);
    return !lastExport || Date.now() - lastExport > 7 * DAY;
  }

  /** 启动时的轻提示，最多每 3 天出现一次 */
  async function remindOnce() {
    if (!(await shouldRemind())) return;
    const last = readTime(LAST_REMIND);
    if (last && Date.now() - last < 3 * DAY) return;
    writeTime(LAST_REMIND, Date.now());
    window.toast('学习记录只存在本机，建议到「我的」页导出备份');
  }

  /** 启动入口：申请持久化存储并生成当日快照 */
  async function init() {
    requestPersist();
    await snapshot('每日快照', false);
  }

  return {
    init: init,
    snapshot: snapshot,
    latest: latest,
    restoreLatest: restoreLatest,
    markExported: markExported,
    status: status,
    shouldRemind: shouldRemind,
    remindOnce: remindOnce
  };
})();
