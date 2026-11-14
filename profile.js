/* Профиль игрока и достижения аркады.
   Работает поверх leaderboard.js: считает заходы в игры, лучшие результаты
   и открывает значки. Всё хранится локально, ничего не ломает. */
(function () {
  const STORE = 'arcade_profile_v1';
  const GAMES = {
    snake: { name: 'Змейка', icon: '🐍', page: 'snake.html' },
    mines: { name: 'Сапёр', icon: '💣', page: 'minesweeper.html' },
    g2048: { name: '2048', icon: '🔢', page: '2048.html' },
    hangman: { name: 'Виселица', icon: '🪢', page: 'hangman.html' },
    tetris: { name: 'Тетрис', icon: '🧱', page: 'tetris.html' },
    seabattle: { name: 'Морской бой', icon: '🚢', page: 'seabattle.html' }
  };
  const GAME_KEYS = Object.keys(GAMES);
  const PAGE_MAP = {};
  GAME_KEYS.forEach(function (g) { PAGE_MAP[GAMES[g].page] = g; });

  const LEVELS = [
    { min: 0, name: 'Новичок' },
    { min: 5, name: 'Гость аркады' },
    { min: 15, name: 'Постоянный' },
    { min: 35, name: 'Ветеран' },
    { min: 70, name: 'Легенда' },
    { min: 120, name: 'Хранитель рекордов' }
  ];

  const ACHIEVEMENTS = [
    { id: 'first', icon: '🎮', title: 'Первый шаг', desc: 'Запусти первую игру аркады.', test: function (s) { return totalPlays(s) >= 1; } },
    { id: 'all6', icon: '🎲', title: 'Шесть из шести', desc: 'Зайди в каждую из шести игр.', test: function (s) { return GAME_KEYS.every(function (g) { return (s.plays[g] || 0) > 0; }); } },
    { id: 'plays10', icon: '🔥', title: 'Разогрев', desc: 'Проведи 10 игровых сессий.', test: function (s) { return totalPlays(s) >= 10; } },
    { id: 'plays50', icon: '🎟', title: 'Завсегдатай', desc: 'Проведи 50 игровых сессий.', test: function (s) { return totalPlays(s) >= 50; } },
    { id: 'plays150', icon: '🕹', title: 'Аркадный ветеран', desc: 'Проведи 150 игровых сессий.', test: function (s) { return totalPlays(s) >= 150; } },
    { id: 'streak3', icon: '📅', title: 'Три дня подряд', desc: 'Заходи в аркаду три дня подряд.', test: function (s) { return streakDays(s) >= 3; } },
    { id: 'night', icon: '🌙', title: 'Ночная смена', desc: 'Сыграй между 00:00 и 05:00.', test: function (s) { return !!s.night; } },
    { id: 'snake15', icon: '🐍', title: 'Змейка: 15 яблок', desc: 'Набери 15 очков в змейке.', test: function (s) { return bestOf(s, 'snake') >= 15; } },
    { id: 'snake30', icon: '🐍', title: 'Змейка: 30 яблок', desc: 'Набери 30 очков в змейке.', test: function (s) { return bestOf(s, 'snake') >= 30; } },
    { id: 'g2048', icon: '🔢', title: 'Дошёл до 2048', desc: 'Собери плитку 2048.', test: function (s) { return bestOf(s, 'g2048') >= 2048; } },
    { id: 'mines500', icon: '💣', title: 'Сапёр: 500', desc: 'Набери 500 очков в сапёре.', test: function (s) { return bestOf(s, 'mines') >= 500; } },
    { id: 'hangman100', icon: '🪢', title: 'Виселица: 100', desc: 'Угадай слово и получи 100 очков.', test: function (s) { return bestOf(s, 'hangman') >= 100; } },
    { id: 'tetris3000', icon: '🧱', title: 'Тетрис: 3000', desc: 'Набери 3000 очков в тетрисе.', test: function (s) { return bestOf(s, 'tetris') >= 3000; } },
    { id: 'sea800', icon: '🚢', title: 'Морской бой: 800', desc: 'Победи ИИ, потратив мало выстрелов.', test: function (s) { return bestOf(s, 'seabattle') >= 800; } },
    { id: 'allbest', icon: '🏅', title: 'Полный комплект', desc: 'Оставь рекорд во всех шести играх.', test: function (s) { return GAME_KEYS.every(function (g) { return bestOf(s, g) > 0; }); } },
    { id: 'online', icon: '🌐', title: 'В сети', desc: 'Твой рекорд попал в онлайн-таблицу.', test: function () { return false; } },
    { id: 'top1', icon: '👑', title: 'Лучший на сервере', desc: 'Займи первое место в любой онлайн-таблице.', test: function () { return false; } }
  ];

  function load() {
    try {
      const raw = localStorage.getItem(STORE);
      const obj = raw ? JSON.parse(raw) : null;
      const state = obj && typeof obj === 'object' ? obj : {};
      state.plays = state.plays && typeof state.plays === 'object' ? state.plays : {};
      state.best = state.best && typeof state.best === 'object' ? state.best : {};
      state.days = state.days && typeof state.days === 'object' ? state.days : {};
      state.unlocked = state.unlocked && typeof state.unlocked === 'object' ? state.unlocked : {};
      // Подхватываем старые локальные рекорды, чтобы достижения не терялись.
      [['snake', 'snake_best'], ['g2048', 'g2048_best'], ['seabattle', 'seabattle_best']].forEach(function (pair) {
        if (Number(state.best[pair[0]]) > 0) return;
        try {
          const legacy = Number(localStorage.getItem(pair[1]));
          if (legacy > 0) state.best[pair[0]] = legacy;
        } catch (e) {}
      });
      return state;
    } catch (e) {
      return { plays: {}, best: {}, days: {}, unlocked: {} };
    }
  }

  function save(state) {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {}
  }

  function totalPlays(state) {
    return GAME_KEYS.reduce(function (sum, g) { return sum + (Number(state.plays[g]) || 0); }, 0);
  }

  function bestOf(state, game) {
    return Number(state.best[game]) || 0;
  }

  function dateKey(d) {
    const x = d || new Date();
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }

  function streakDays(state) {
    let streak = 0;
    const d = new Date();
    if (!state.days[dateKey(d)]) d.setDate(d.getDate() - 1);
    while (state.days[dateKey(d)]) {
      streak++;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  function levelInfo(state) {
    const total = totalPlays(state);
    let idx = 0;
    for (let i = 0; i < LEVELS.length; i++) if (total >= LEVELS[i].min) idx = i;
    const current = LEVELS[idx];
    const next = LEVELS[idx + 1] || null;
    const base = current.min;
    const span = next ? next.min - base : 1;
    const progress = next ? Math.min(1, (total - base) / span) : 1;
    return { total: total, index: idx + 1, name: current.name, next: next, progress: progress };
  }

  function playerName() {
    try { return (localStorage.getItem('player_name') || '').trim(); } catch (e) { return ''; }
  }

  function setPlayerName(name) {
    const clean = String(name || '').trim().slice(0, 16);
    if (!clean) return false;
    try { localStorage.setItem('player_name', clean); } catch (e) { return false; }
    window.dispatchEvent(new CustomEvent('arcade:profile'));
    return true;
  }

  function currentGame() {
    const file = (location.pathname.split('/').pop() || '').toLowerCase();
    return PAGE_MAP[file] || null;
  }

  function recordVisit() {
    const game = currentGame();
    if (!game) return;
    const state = load();
    const now = new Date();
    const key = dateKey(now);
    let dirty = false;

    state.plays[game] = (Number(state.plays[game]) || 0) + 1;
    if (!state.days[key]) { state.days[key] = 1; dirty = true; }
    if (!state.night && now.getHours() >= 0 && now.getHours() < 5) { state.night = 1; dirty = true; }

    save(state);
    checkAchievements();
  }

  function recordScore(game, name, score) {
    const state = load();
    const value = Math.round(Number(score));
    if (Number.isFinite(value) && value > bestOf(state, game)) {
      state.best[game] = value;
      save(state);
    }
    if (!playerName() && name) {
      try { localStorage.setItem('player_name', String(name).trim().slice(0, 16)); } catch (e) {}
    }
    checkAchievements();
  }

  const toastQueue = [];
  let toastBusy = false;
  let toastRoot = null;

  function ensureToastRoot() {
    if (toastRoot && document.body.contains(toastRoot)) return toastRoot;
    toastRoot = document.getElementById('arcadeToasts');
    if (!toastRoot) {
      toastRoot = document.createElement('div');
      toastRoot.id = 'arcadeToasts';
      (document.body || document.documentElement).appendChild(toastRoot);
    }
    return toastRoot;
  }

  function showToast(badge) {
    toastQueue.push(badge);
    if (!toastBusy) drainToasts();
  }

  function drainToasts() {
    const badge = toastQueue.shift();
    if (!badge) { toastBusy = false; return; }
    toastBusy = true;
    const root = ensureToastRoot();
    const el = document.createElement('div');
    el.className = 'arcade-toast';
    el.innerHTML = '<div class="arcade-toast-icon">' + badge.icon + '</div><div><div class="arcade-toast-kicker">Достижение открыто</div><div class="arcade-toast-title">' + escapeHtml(badge.title) + '</div><div class="arcade-toast-desc">' + escapeHtml(badge.desc) + '</div></div>';
    root.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); drainToasts(); }, 320);
    }, 4200);
  }

  function checkAchievements(announce) {
    const state = load();
    let changed = false;
    const opened = [];
    ACHIEVEMENTS.forEach(function (badge) {
      if (state.unlocked[badge.id]) return;
      let ok = false;
      try { ok = badge.test(state); } catch (e) { ok = false; }
      if (ok) {
        state.unlocked[badge.id] = Date.now();
        changed = true;
        opened.push(badge);
      }
    });
    if (changed) {
      save(state);
      window.dispatchEvent(new CustomEvent('arcade:profile'));
      if (announce !== false) opened.forEach(showToast);
    }
    return opened;
  }

  /* Онлайн-достижения: проверяем по данным воркера. */
  let onlineChecked = false;
  function checkOnline() {
    if (onlineChecked || typeof window.lbFetchOnline !== 'function') return Promise.resolve();
    onlineChecked = true;
    const name = playerName();
    if (!name) return Promise.resolve();
    const needle = name.toLowerCase();

    return Promise.all(GAME_KEYS.map(function (g) {
      return window.lbFetchOnline(g).then(function (data) {
        return { game: g, rows: data && data.ok && Array.isArray(data.scores) ? data.scores : [] };
      }).catch(function () { return { game: g, rows: [] }; });
    })).then(function (results) {
      const state = load();
      let changed = false;
      let inTable = false;
      let first = false;

      results.forEach(function (r) {
        const idx = r.rows.findIndex(function (row) { return String(row.n || '').toLowerCase() === needle; });
        if (idx >= 0) inTable = true;
        if (idx === 0) first = true;
      });

      if (inTable && !state.unlocked.online) { state.unlocked.online = Date.now(); changed = true; showToast(findBadge('online')); }
      if (first && !state.unlocked.top1) { state.unlocked.top1 = Date.now(); changed = true; showToast(findBadge('top1')); }
      if (changed) { save(state); window.dispatchEvent(new CustomEvent('arcade:profile')); }
    });
  }

  function findBadge(id) {
    return ACHIEVEMENTS.filter(function (b) { return b.id === id; })[0] || { icon: '🏆', title: 'Достижение', desc: '' };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function progressHtml(state) {
    const info = levelInfo(state);
    const pct = Math.round(info.progress * 100);
    return '<div class="arcade-level"><div class="arcade-level-row"><span class="arcade-level-name">' + escapeHtml(info.name) + '</span>' +
      '<span class="arcade-level-num">ур. ' + info.index + '</span></div>' +
      '<div class="arcade-level-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="arcade-level-next">' + (info.next ? ('до «' + escapeHtml(info.next.name) + '»: ' + (info.next.min - info.total) + ' сессий') : 'максимальный уровень') + '</div></div>';
  }

  function renderCard() {
    const el = document.getElementById('profileCard');
    if (!el) return;
    const state = load();
    const name = playerName() || 'Безымянный игрок';
    const info = levelInfo(state);
    const unlocked = ACHIEVEMENTS.filter(function (b) { return state.unlocked[b.id]; });
    const latest = unlocked.slice(-3).reverse();

    el.innerHTML =
      '<div class="arcade-card-head">' +
        '<div class="arcade-avatar">' + escapeHtml(name.charAt(0).toUpperCase() || '?') + '</div>' +
        '<div class="arcade-card-id"><div class="arcade-card-name">' + escapeHtml(name) + '</div>' +
        '<div class="arcade-card-sub">' + info.total + ' сессий · ' + unlocked.length + ' из ' + ACHIEVEMENTS.length + ' достижений</div></div>' +
        '<a class="arcade-card-link" href="profile.html">Профиль →</a>' +
      '</div>' +
      progressHtml(state) +
      '<div class="arcade-mini-badges">' +
        (latest.length
          ? latest.map(function (b) { return '<span class="arcade-mini-badge" title="' + escapeHtml(b.desc) + '">' + b.icon + ' ' + escapeHtml(b.title) + '</span>'; }).join('')
          : '<span class="arcade-mini-empty">Пока пусто — сыграй первую игру и получи значок.</span>') +
      '</div>';
  }

  function renderProfilePage() {
    const root = document.getElementById('profileRoot');
    if (!root) return;
    const state = load();
    const info = levelInfo(state);
    const name = playerName();
    const unlockedCount = ACHIEVEMENTS.filter(function (b) { return state.unlocked[b.id]; }).length;

    const bestRows = GAME_KEYS.map(function (g) {
      const value = bestOf(state, g);
      return '<div class="profile-best"><span class="profile-best-icon">' + GAMES[g].icon + '</span>' +
        '<span class="profile-best-name">' + GAMES[g].name + '</span>' +
        '<b>' + (value > 0 ? value : '—') + '</b></div>';
    }).join('');

    const badges = ACHIEVEMENTS.map(function (b) {
      const open = !!state.unlocked[b.id];
      return '<div class="profile-badge' + (open ? ' open' : '') + '">' +
        '<div class="profile-badge-icon">' + (open ? b.icon : '🔒') + '</div>' +
        '<div><div class="profile-badge-title">' + escapeHtml(b.title) + '</div>' +
        '<div class="profile-badge-desc">' + escapeHtml(b.desc) + '</div></div></div>';
    }).join('');

    root.innerHTML =
      '<div class="profile-hero">' +
        '<div class="profile-avatar">' + escapeHtml((name || '?').charAt(0).toUpperCase()) + '</div>' +
        '<div class="profile-id">' +
          '<div class="profile-name-row"><h1>' + escapeHtml(name || 'Безымянный игрок') + '</h1>' +
          '<button id="renameBtn" class="profile-rename">Сменить ник</button></div>' +
          '<div class="profile-sub">' + info.name + ' · уровень ' + info.index + ' · ' + info.total + ' сессий</div>' +
          '<div id="renameBox" class="profile-rename-box" hidden>' +
            '<input id="renameInput" maxlength="16" placeholder="Новый ник" value="' + escapeHtml(name) + '">' +
            '<button id="renameSave">Сохранить</button>' +
          '</div>' +
        '</div>' +
        '<div class="profile-score"><b>' + unlockedCount + '</b><span>из ' + ACHIEVEMENTS.length + '</span></div>' +
      '</div>' +
      progressHtml(state) +
      '<div class="profile-section"><h2>Рекорды по играм</h2><div class="profile-bests">' + bestRows + '</div></div>' +
      '<div class="profile-section"><h2>Достижения</h2><div class="profile-badges">' + badges + '</div></div>';

    const renameBtn = document.getElementById('renameBtn');
    const renameBox = document.getElementById('renameBox');
    if (renameBtn) renameBtn.addEventListener('click', function () {
      renameBox.hidden = !renameBox.hidden;
      if (!renameBox.hidden) document.getElementById('renameInput').focus();
    });
    const renameSave = document.getElementById('renameSave');
    if (renameSave) renameSave.addEventListener('click', function () {
      if (setPlayerName(document.getElementById('renameInput').value)) renderProfilePage();
    });
    const renameInput = document.getElementById('renameInput');
    if (renameInput) renameInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') renameSave.click();
    });

    checkOnline();
  }

  function installToastStyles() {
    if (document.getElementById('arcadeToastStyles')) return;
    const style = document.createElement('style');
    style.id = 'arcadeToastStyles';
    style.textContent = [
      '#arcadeToasts{position:fixed; right:18px; bottom:18px; z-index:99999; display:flex; flex-direction:column; gap:10px; max-width:min(360px, calc(100vw - 36px)); pointer-events:none}',
      '.arcade-toast{display:flex; gap:12px; align-items:flex-start; padding:14px 16px; border-radius:16px;',
      'background:linear-gradient(160deg, rgba(24,36,48,.98), rgba(10,14,20,.98)); border:1px solid rgba(57,255,136,.45);',
      'box-shadow:0 18px 50px rgba(0,0,0,.55), 0 0 30px rgba(57,255,136,.12); color:#e8f1f8;',
      'opacity:0; transform:translateY(14px) scale(.98); transition:opacity .3s ease, transform .3s ease; font-family:"Segoe UI",system-ui,sans-serif}',
      '.arcade-toast.show{opacity:1; transform:translateY(0) scale(1)}',
      '.arcade-toast-icon{font-size:26px; line-height:1; filter:drop-shadow(0 0 10px rgba(57,255,136,.4))}',
      '.arcade-toast-kicker{font-size:10px; letter-spacing:1.6px; text-transform:uppercase; color:#39ff88; margin-bottom:3px}',
      '.arcade-toast-title{font-size:15px; font-weight:800; margin-bottom:2px}',
      '.arcade-toast-desc{font-size:12px; color:#8fa0b0; line-height:1.45}',
      /* карточка на хабе */
      '.arcade-profile{background:linear-gradient(160deg, rgba(25,36,48,.9), rgba(11,16,22,.95)); border:1px solid #1e2b38; border-radius:20px; padding:22px 24px; margin-bottom:34px}',
      '.arcade-card-head{display:flex; align-items:center; gap:14px; flex-wrap:wrap}',
      '.arcade-avatar{width:52px; height:52px; border-radius:16px; display:grid; place-items:center; font-size:22px; font-weight:800; color:#0a0d12; background:linear-gradient(145deg,#39ff88,#00d4ff); box-shadow:0 0 26px rgba(57,255,136,.25)}',
      '.arcade-card-id{flex:1; min-width:160px}',
      '.arcade-card-name{font-size:18px; font-weight:800}',
      '.arcade-card-sub{font-size:12px; color:#7c8b9a; margin-top:3px}',
      '.arcade-card-link{color:#39ff88; text-decoration:none; font-size:13px; font-weight:700; border:1px solid rgba(57,255,136,.3); padding:8px 14px; border-radius:10px}',
      '.arcade-card-link:hover{background:rgba(57,255,136,.08)}',
      '.arcade-level{margin-top:16px}',
      '.arcade-level-row{display:flex; justify-content:space-between; font-size:13px; margin-bottom:7px}',
      '.arcade-level-name{font-weight:700}',
      '.arcade-level-num{color:#7c8b9a}',
      '.arcade-level-bar{height:8px; border-radius:99px; background:rgba(255,255,255,.06); overflow:hidden}',
      '.arcade-level-bar i{display:block; height:100%; border-radius:99px; background:linear-gradient(90deg,#39ff88,#00d4ff); box-shadow:0 0 14px rgba(57,255,136,.4)}',
      '.arcade-level-next{font-size:12px; color:#7c8b9a; margin-top:6px}',
      '.arcade-mini-badges{display:flex; gap:8px; flex-wrap:wrap; margin-top:14px}',
      '.arcade-mini-badge{font-size:12px; color:#cdd9e5; border:1px solid #1e2b38; border-radius:99px; padding:6px 12px; background:rgba(255,255,255,.02)}',
      '.arcade-mini-empty{font-size:12px; color:#7c8b9a; font-style:italic}',
      '@media (max-width:560px){.arcade-toast{max-width:100%}.arcade-profile{padding:18px}.arcade-card-link{width:100%; text-align:center}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function init() {
    installToastStyles();
    recordVisit();
    checkAchievements();
    renderCard();
    renderProfilePage();
    if (document.getElementById('profileCard') || document.getElementById('profileRoot')) checkOnline();

    if (typeof window.lbSubmit === 'function' && !window.lbSubmit.__arcadeWrapped) {
      const original = window.lbSubmit;
      const wrapped = function (game, name, score) {
        try { recordScore(game, name, score); } catch (e) {}
        return original.apply(this, arguments);
      };
      wrapped.__arcadeWrapped = true;
      window.lbSubmit = wrapped;
    }

    window.addEventListener('arcade:profile', function () {
      renderCard();
      renderProfilePage();
    });
  }

  window.arcadeProfile = {
    state: load,
    achievements: ACHIEVEMENTS,
    games: GAMES,
    level: function () { return levelInfo(load()); },
    name: playerName,
    setName: setPlayerName,
    check: checkAchievements,
    checkOnline: checkOnline
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
