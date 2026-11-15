/* Общий лидерборд аркады: локальный кэш + онлайн через Cloudflare Worker. */
(function () {
  const KEY = 'arcade_scores_v1';
  const MIGRATED_KEY = 'lb_migrated_v1';
  const ONLINE_URL = 'https://brickyard-leaderboard.brickyard-leaderboard.workers.dev';
  const LIMIT = 10;
  const TOKEN_KEY = 'arcade_token';
  const onlineCache = {};
  const onlineRequests = {};

  /* Discord-вход: токен приходит в #arcade_token после OAuth-редиректа. */
  function readToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function setToken(value) {
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }

  (function captureToken() {
    try {
      const hash = location.hash || '';
      if (hash.indexOf('arcade_token=') === -1) return;
      const params = new URLSearchParams(hash.replace(/^#/, ''));
      const token = params.get('arcade_token');
      if (token) setToken(token);
      history.replaceState(null, '', location.pathname + location.search);
    } catch (e) {}
  })();

  function authHeaders(extra) {
    const headers = extra || {};
    const token = readToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  function normalizeList(list) {
    const map = new Map();
    (Array.isArray(list) ? list : []).forEach(function (row) {
      if (!row || !row.n) return;
      const name = String(row.n).trim().slice(0, 16);
      if (!name) return;
      const key = name.toLowerCase();
      const score = Math.round(Number(row.s));
      if (!Number.isFinite(score) || score <= 0) return;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, { n: name, s: score, d: row.d || '' });
      } else if (score > prev.s) {
        prev.s = score;
        if (row.d) prev.d = row.d;
      }
    });
    return Array.from(map.values())
      .sort(function (a, b) { return b.s - a.s; })
      .slice(0, LIMIT);
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const obj = raw ? JSON.parse(raw) : null;
      const data = obj && typeof obj === 'object' ? obj : {};
      let changed = false;
      Object.keys(data).forEach(function (game) {
        if (!Array.isArray(data[game])) return;
        const clean = normalizeList(data[game]);
        if (JSON.stringify(clean) !== JSON.stringify(data[game])) {
          data[game] = clean;
          changed = true;
        }
      });
      if (changed) save(data);
      return data;
    } catch (e) { return {}; }
  }

  function save(obj) {
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) {}
  }

  function getMigrated() {
    try {
      const raw = localStorage.getItem(MIGRATED_KEY);
      const obj = raw ? JSON.parse(raw) : null;
      return obj && typeof obj === 'object' ? obj : {};
    } catch (e) { return {}; }
  }

  function markMigrated(game) {
    try {
      const flags = getMigrated();
      flags[game] = 1;
      localStorage.setItem(MIGRATED_KEY, JSON.stringify(flags));
    } catch (e) {}
  }

  function postScore(game, name, score) {
    return fetch(ONLINE_URL + '/scores', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ game: game, name: name, score: score })
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; });
  }

  /* Один раз на устройство переносим локальные рекорды в онлайн:
     сервер сам оставит лучший результат по каждому нику. */
  function syncLocal(game, onlineRows) {
    if (!ONLINE_URL || !game) return;
    const flags = getMigrated();
    if (flags[game]) return;

    const localData = load();
    const localRows = Array.isArray(localData[game]) ? localData[game] : [];
    if (!localRows.length) { markMigrated(game); return; }

    const pending = localRows.filter(function (row) {
      const match = onlineRows.find(function (o) {
        return String(o.n).toLowerCase() === String(row.n).toLowerCase();
      });
      return !match || row.s > match.s;
    }).slice(0, 5);

    if (!pending.length) { markMigrated(game); return; }

    Promise.all(pending.map(function (row) {
      return postScore(game, row.n, row.s);
    })).then(function (results) {
      const ok = results.filter(function (r) { return r && r.ok && Array.isArray(r.scores); });
      if (!ok.length) return;
      onlineCache[game] = ok[ok.length - 1].scores;
      markMigrated(game);
      try {
        window.dispatchEvent(new CustomEvent('lb:update', { detail: { game: game, online: true } }));
      } catch (e) {}
    });
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
          syncLocal(game, data.scores);
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
      postScore(game, cleanName, rounded).then(function (data) {
        if (data && data.ok && Array.isArray(data.scores)) {
          onlineCache[game] = data.scores;
          try {
            window.dispatchEvent(new CustomEvent('lb:update', { detail: { game: game, online: true } }));
          } catch (e) {}
        }
      });
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
    const list = Array.isArray(data[game]) ? normalizeList(data[game]) : [];
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

  /* Discord-вход и профили. */
  window.lbAuth = {
    token: readToken,
    setToken: setToken,
    clear: function () { setToken(''); },
    loginUrl: function (returnTo) {
      const back = returnTo || (location.origin + location.pathname + location.search);
      return ONLINE_URL + '/auth/login?returnTo=' + encodeURIComponent(back);
    },
    me: function () {
      if (!readToken()) return Promise.resolve(null);
      return fetch(ONLINE_URL + '/auth/me', { headers: authHeaders(), cache: 'no-store' })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (data) { return data && data.ok ? data.user : null; })
        .catch(function () { return null; });
    },
    logout: function () {
      const token = readToken();
      setToken('');
      if (!token) return Promise.resolve();
      return fetch(ONLINE_URL + '/auth/logout', { method: 'POST', headers: authHeaders() })
        .catch(function () {});
    }
  };

  window.lbFetchProfile = function (uid) {
    return fetch(ONLINE_URL + '/profile?uid=' + encodeURIComponent(String(uid)), { cache: 'no-store' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; });
  };

  /* Мини-виджет таблицы: <div data-lb="snake" data-lb-title="Змейка" data-lb-limit="10"></div> */
  window.lbProfileUrl = function (name, uid) {
    if (uid) return 'profile.html?uid=' + encodeURIComponent(String(uid));
    return 'profile.html?name=' + encodeURIComponent(String(name || ''));
  };

  window.lbMount = function (el) {
    const game = el.getAttribute('data-lb');
    const title = el.getAttribute('data-lb-title') || game;
    const limit = Math.max(1, Math.min(50, Number(el.getAttribute('data-lb-limit')) || 5));

    const render = function () {
      const rows = window.lbTop(game, limit);
      const onlineRows = onlineCache[game];
      const online = Array.isArray(onlineRows) && onlineRows.length > 0;
      const localOnly = Array.isArray(onlineRows) && onlineRows.length === 0 && rows.length > 0;
      const suffix = online ? ' · онлайн' : (localOnly ? ' · локально' : '');
      el.innerHTML =
        '<div class="lb-title">' + title + suffix + '</div>' +
        (rows.length
          ? rows.map(function (r, i) {
              return '<div class="lb-row"><span class="lb-pos">' + (i + 1) + '</span>' +
                     '<a class="lb-name" href="' + window.lbProfileUrl(r.n, r.uid) + '" title="Открыть профиль">' + escapeHtml(r.n) + '</a>' +
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
