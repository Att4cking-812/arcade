/* Общий локальный лидерборд аркады.
   Все игры на одном origin — рекорды видны везде. */
(function () {
  const KEY = 'arcade_scores_v1';
  const LIMIT = 10;

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

  window.lbSubmit = function (game, name, score) {
    if (!game || !score || score <= 0) return Promise.resolve(false);
    const data = load();
    if (!Array.isArray(data[game])) data[game] = [];
    data[game].push({
      n: String(name || 'игрок').slice(0, 16),
      s: Math.round(score),
      d: new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
    });
    data[game].sort(function (a, b) { return b.s - a.s; });
    data[game] = data[game].slice(0, LIMIT);
    save(data);
    try { window.dispatchEvent(new CustomEvent('lb:update', { detail: { game: game } })); } catch (e) {}
    return Promise.resolve(true);
  };

  window.lbTop = function (game, n) {
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
      el.innerHTML =
        '<div class="lb-title">' + title + '</div>' +
        (rows.length
          ? rows.map(function (r, i) {
              return '<div class="lb-row"><span class="lb-pos">' + (i + 1) + '</span>' +
                     '<span class="lb-name">' + escapeHtml(r.n) + '</span>' +
                     '<b class="lb-score">' + r.s + '</b></div>';
            }).join('')
          : '<div class="lb-empty">пока пусто</div>');
    };
    render();
    window.addEventListener('lb:update', render);
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
