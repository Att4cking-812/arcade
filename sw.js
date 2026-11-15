const CACHE = 'arcade-v15';
const ASSETS = [
  './',
  'index.html',
  'snake.html',
  'minesweeper.html',
  '2048.html',
  'hangman.html',
  'tetris.html',
  'seabattle.html',
  'thanks.html',
  'memes.html',
  'wheel.html',
  'tournament.html',
  'quest.html',
  'leaderboard.js',
  'leaderboard.js?v=14',
  'profile.js',
  'profile.js?v=3',
  'profile.html',
  'leaderboard.html',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'preview.png',
  'memes/dog.jpg',
  'memes/lays.png',
  'memes/pudge.png',
  'memes/kamina.png',
  'memes/kamina_v2.png',
  'memes/kamina_v3.png',
  'memes/demon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const isPage = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  // Панель ведущего не кэшируем: она не должна оставаться в офлайне и в общем кэше.
  if (req.url.includes('wheel-studio')) {
    e.respondWith(fetch(req).catch(() => caches.match('index.html')));
    return;
  }

  if (isPage) {
    // сеть в приоритете, кэш — если офлайн
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
    );
    return;
  }

  // остальное — из кэша, иначе сеть
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }))
  );
});
