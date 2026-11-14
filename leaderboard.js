/* Общий лидерборд аркады: локальный кэш + онлайн через Cloudflare Worker. */
(function () {
  const KEY = 'arcade_scores_v1';
  const ONLINE_URL = 'https://brickyard-leaderboard.brickyard-leaderboard.workers.dev';
  const LIMIT = 10;
  const onlineCache = {};
  const onlineRequests = {};

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const obj = raw ? JSON.parse(raw) : null;
      return obj && typeof obj === 'object' ? obj : {};
    } catch (e) { return {}; }
  }

  function save(obj) {
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) {}
  }

  function ensureOnline(game) {
    if (!ONLINE_URL || !game) return Promise.resolve(null);
    if (onlineRequests[game]) return onlineRequests[game];

    const request = fetch(ONLINE_URL + '/scores?game=' + encodeURIComponent(game), { cache: 'no-store' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (data && data.ok && Array.isArray(data.scores)) {
          onlineCache[game] = data.scores;
          try {
            window.dispatchEvent(new CustomEvent('lb:update', { detail: { game: game, online: true } }));
          } catch (e) {}
        }
        return data;
      })
      .catch(function () { return null; })
      .then(function (data) {
        onlineRequests[game] = null;
        return data;
      });

    onlineRequests[game] = request;
    return request;
  }

  window.lbFetchOnline = ensureOnline;

  window.lbOnlineTop = function (game, n) {
    return onlineCache[game] ? onlineCache[game].slice(0, n || 5) : null;
  };

  window.lbSubmit = function (game, name, score) {
    if (!game || !score || score <= 0) return Promise.resolve(false);

    const cleanName = String(name || 'игрок').trim().slice(0, 16) || 'игрок';
    const rounded = Math.round(score);

    // Онлайн отправляем всегда: сервер сам оставит только лучший результат.
    if (ONLINE_URL) {
      fetch(ONLINE_URL + '/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: game, name: cleanName, score: rounded })
      })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) {
          if (data && data.ok && Array.isArray(data.scores)) {
            onlineCache[game] = data.scores;
            try {
              window.dispatchEvent(new CustomEvent('lb:update', { detail: { game: game, online: true } }));
            } catch (e) {}
          }
        })
        .catch(function () {});
    }

    const data = load();
    if (!Array.isArray(data[game])) data[game] = [];
    const existing = data[game].find(function (row) {
      return String(row.n).toLowerCase() === cleanName.toLowerCase();
    });

    if (existing) {
      // Один ник — одна строка. Обновляем только если рекорд стал лучше.
      if (rounded <= existing.s) return Promise.resolve(false);
      existing.s = rounded;
      existing.d = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    } else {
      data[game].push({
        n: cleanName,
        s: rounded,
        d: new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
      });
    }

    data[game].sort(function (a, b) { return b.s - a.s; });
    data[game] = data[game].slice(0, LIMIT);
    save(data);
    try { window.dispatchEvent(new CustomEvent('lb:update', { detail: { game: game } })); } catch (e) {}
    return Promise.resolve(true);
  };

  window.lbTop = function (game, n) {
    const online = onlineCache[game];
    if (Array.isArray(online) && online.length) {
      return online.slice(0, n || 5);
    }
    const data = load();
    const list = Array.isArray(data[game]) ? data[game].slice() : [];
    return list.slice(0, n || 5);
  };

  window.lbAll = function () { return load(); };

  window.lbName = function () {
    let n = null;
    try { n = localStorage.getItem('player_name'); } catch (e) {}
    if (!n) {
      try {
        n = (prompt('Как тебя записать в рекорды?', 'игрок') || 'игрок').slice(0, 16);
        localStorage.setItem('player_name', n);
      } catch (e) { n = 'игрок'; }
    }
    return n;
  };

  /* Мини-виджет таблицы: <div data-lb="snake" data-lb-title="Змейка"></div> */
  window.lbMount = function (el) {
    const game = el.getAttribute('data-lb');
    const title = el.getAttribute('data-lb-title') || game;

    const render = function () {
      const rows = window.lbTop(game, 5);
      const online = Array.isArray(onlineCache[game]) && onlineCache[game].length > 0;
      el.innerHTML =
        '<div class="lb-title">' + title + (online ? ' · онлайн' : '') + '</div>' +
        (rows.length
          ? rows.map(function (r, i) {
              return '<div class="lb-row"><span class="lb-pos">' + (i + 1) + '</span>' +
                     '<span class="lb-name">' + escapeHtml(r.n) + '</span>' +
                     '<b class="lb-score">' + r.s + '</b></div>';
            }).join('')
          : '<div class="lb-empty">пока пусто</div>');
    };

    render();
    ensureOnline(game);

    window.addEventListener('lb:update', function (e) {
      if (!e.detail || !e.detail.game || e.detail.game === game) render();
    });
    window.addEventListener('storage', function (e) { if (e.key === KEY) render(); });
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-lb]').forEach(window.lbMount);
  });
})();
