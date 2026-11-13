/**
 * sw.js —— Service Worker
 * 预缓存全部应用外壳；离线时导航请求回退到缓存的 index.html
 */
const CACHE_NAME = 'cet4-v8';

// 必须列全：空预缓存会导致 iOS 清理缓存后离线白屏
const PRECACHE_URLS = [
  './',
  './index.html',
  './css/style.css',
  './data/seed.js',
  './data/content-words.js',
  './data/content-questions.js',
  './data/content-writing.js',
  './js/db.js',
  './js/data-guard.js',
  './js/fsrs.js',
  './js/stats.js',
  './js/speech.js',
  './js/word-spell.js',
  './js/words-source.js',
  './js/words-view.js',
  './js/words.js',
  './js/quiz-core.js',
  './js/quiz-exam.js',
  './js/wrongbook.js',
  './js/quiz-view.js',
  './js/quiz.js',
  './js/me-backup.js',
  './js/me-stats.js',
  './js/me.js',
  './js/pwa.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (key) {
        return key !== CACHE_NAME;
      }).map(function (key) {
        return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Chrome 仍会兜底请求 /favicon.ico，直接返回空响应，避免离线时控制台报错
  if (url.pathname.slice(-12) === '/favicon.ico') {
    event.respondWith(new Response(null, { status: 204 }));
    return;
  }

  // 导航请求走网络优先：升级后第一次打开即可拿到新外壳，断网时回退缓存
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(function (response) {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return response;
      }).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return response;
      }).catch(function () {
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return caches.match(request, { ignoreSearch: true });
      });
    })
  );
});
