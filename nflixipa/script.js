/* ===========================================================
   Nflix - iCodeWin / iOS app
   Paste index.html + styles.css + this script.js into
   https://icodewin.vercel.app/ then build your IPA.

   iCodeWin push API (when injected by the runtime):
     push(seconds, "message")
   Schedules a notification if the app is not currently open.
   =========================================================== */

(function () {
  'use strict';

  // -- Config -----------------------------------------------
  const CONFIG = {
    brand: 'Nflix',
    playerColor: 'e50914',
    tmdbToken:
      'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlMmVkNGM4YjU5NjM1YzBhNGMwZWVkNWI0MmU0ZDY1ZiIsIm5iZiI6MTc4NjQ2ODY3MS41NzIsInN1YiI6IjZhN2I1OTNmYTRiNWU3OTk0ZjRjMWQ1NiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.vW6UjKn9Jw9MVd0izakQI6563F7FdANOoJwjvpbWuhA',
    tmdbBase: 'https://api.themoviedb.org/3',
    imageBase: 'https://image.tmdb.org/t/p',
    embedBase: 'https://nflixmovies.app/embed',
    pushWelcomeDelay: 7,
    pushWelcomeMessage: 'Greetings from Nflix — your next binge is waiting.',
    pushReminderDelay: 60 * 30,
    pushReminderMessage: 'Still deciding? Open Nflix for trending movies and shows.',
  };

  const KEYS = {
    watchLater: 'nflix.ios.watchLater.v1',
    favorites: 'nflix.ios.favorites.v1',
    continueWatching: 'nflix.ios.continue.v1',
    pushBootstrapped: 'nflix.ios.push.boot.v1',
  };

  // -- Icons (inline SVG, no emoji) -------------------------
  const ICONS = {
    search:
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    home: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z"/></svg>',
    film: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
    tv: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="13" rx="2"/><path d="M8 21h8M12 18v3"/></svg>',
    spark: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6.2 6.2l2.1 2.1M15.7 15.7l2.1 2.1M17.8 6.2l-2.1 2.1M8.3 15.7l-2.1 2.1"/><circle cx="12" cy="12" r="2.5"/></svg>',
    list: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    play: '<svg class="icon filled" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5L8 5.5z"/></svg>',
    expand:
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6"/></svg>',
    compress:
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 9H3V3M15 9h6V3M9 15H3v6M15 15h6v6"/></svg>',
    pip: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="12" width="7" height="5" rx="1"/></svg>',
    close:
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    back: '<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    check:
      '<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l5 5L19 7"/></svg>',
    heart:
      '<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-9.2A4.2 4.2 0 0 1 12 7.5a4.2 4.2 0 0 1 7 3.3C19 15.6 12 20 12 20z"/></svg>',
    plus: '<svg class="icon icon-sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  };

  // -- State / router ---------------------------------------
  /** @type {{ name: string, params?: Record<string, any> }} */
  let route = { name: 'home' };
  let searchOpen = false;

  /** Persistent player state so media survives navigation (mini player). */
  const player = {
    mode: 'hidden', // hidden | inline | fullscreen | pip
    meta: null, // { type, id, season, episode, title, embed, posterPath, ... }
    chromeTimer: null,
    hintTimer: null,
    loadTimer: null,
    pipPos: null, // { x, y } optional custom drag position
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const view = () => $('#view');

  function sameWatch(a, b) {
    if (!a || !b) return false;
    if (a.type !== b.type || Number(a.id) !== Number(b.id)) return false;
    if (a.type === 'tv') {
      return Number(a.season) === Number(b.season) && Number(a.episode) === Number(b.episode);
    }
    return true;
  }

  function navigate(name, params = {}) {
    // If leaving watch while playing, auto mini-player so video keeps going
    if (
      route.name === 'watch' &&
      name !== 'watch' &&
      player.mode !== 'hidden' &&
      player.meta
    ) {
      setPlayerMode('pip');
    }

    route = { name, params };
    searchOpen = false;
    const sheet = $('#search-sheet');
    if (sheet) sheet.hidden = true;
    window.scrollTo(0, 0);
    render();
    syncTabs();
  }

  function syncTabs() {
    const map = {
      home: 'home',
      movies: 'movies',
      tv: 'tv',
      surprise: 'surprise',
      list: 'list',
      details: null,
      watch: null,
      search: null,
    };
    const active = map[route.name];
    $$('.tab').forEach((t) => {
      t.classList.toggle('is-active', t.dataset.nav === active);
    });
  }

  // -- Storage helpers --------------------------------------
  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // -- Library ----------------------------------------------
  function libraryHas(storeKey, type, id) {
    return readJson(storeKey, []).some((i) => i.mediaType === type && i.tmdbId === id);
  }

  function libraryToggle(storeKey, item) {
    const list = readJson(storeKey, []);
    const idx = list.findIndex((i) => i.mediaType === item.mediaType && i.tmdbId === item.tmdbId);
    if (idx >= 0) {
      list.splice(idx, 1);
      writeJson(storeKey, list);
      return false;
    }
    list.unshift({ ...item, addedAt: new Date().toISOString() });
    writeJson(storeKey, list.slice(0, 200));
    return true;
  }

  function cwKey(e) {
    return e.mediaType === 'tv'
      ? `tv:${e.contentId}:${e.season || 1}:${e.episode || 1}`
      : `movie:${e.contentId}`;
  }

  function recordWatch(entry) {
    const all = readJson(KEYS.continueWatching, []);
    const key = cwKey(entry);
    const existing = all.find((e) => cwKey(e) === key);
    const next = {
      contentId: entry.contentId,
      mediaType: entry.mediaType,
      season: entry.mediaType === 'tv' ? entry.season : undefined,
      episode: entry.mediaType === 'tv' ? entry.episode : undefined,
      progress: entry.progress ?? existing?.progress ?? 0,
      duration: entry.duration ?? existing?.duration ?? null,
      lastWatched: new Date().toISOString(),
      completed: entry.completed ?? existing?.completed ?? false,
      title: entry.title,
      posterPath: entry.posterPath ?? existing?.posterPath ?? null,
      backdropPath: entry.backdropPath ?? existing?.backdropPath ?? null,
    };
    const filtered = all.filter((e) => cwKey(e) !== key);
    filtered.unshift(next);
    writeJson(KEYS.continueWatching, filtered.slice(0, 40));
    return next;
  }

  function getProgress(type, id, season, episode) {
    const key = cwKey({
      mediaType: type,
      contentId: id,
      season,
      episode,
    });
    return readJson(KEYS.continueWatching, []).find((e) => cwKey(e) === key) || null;
  }

  // -- TMDB -------------------------------------------------
  async function tmdb(path, params = {}) {
    const url = new URL(CONFIG.tmdbBase + path);
    url.searchParams.set('language', 'en-US');
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${CONFIG.tmdbToken}`,
      },
    });
    if (!res.ok) throw new Error(`TMDB ${res.status}`);
    return res.json();
  }

  function img(path, size = 'w342') {
    if (!path) return null;
    return `${CONFIG.imageBase}/${size}${path}`;
  }

  function mapItem(r, type) {
    const isMovie = type === 'movie';
    return {
      id: r.id,
      tmdbId: r.id,
      mediaType: type,
      title: (isMovie ? r.title : r.name) || r.title || r.name || 'Untitled',
      overview: r.overview || '',
      posterPath: r.poster_path || null,
      backdropPath: r.backdrop_path || null,
      releaseDate: (isMovie ? r.release_date : r.first_air_date) || null,
      voteAverage: r.vote_average || 0,
    };
  }

  function yearOf(d) {
    return d ? String(d).slice(0, 4) : null;
  }

  async function fetchList(path, type, params) {
    const data = await tmdb(path, params);
    return (data.results || []).map((r) => {
      if (type === 'auto') {
        const t = r.media_type === 'tv' ? 'tv' : 'movie';
        return mapItem(r, t);
      }
      return mapItem(r, type);
    });
  }

  // -- Embed URLs & Multi-Source Servers -------------------
  const SOURCES = [
    {
      id: 'pro1',
      name: 'Pro 1 (Default)',
      movie: (id) => `https://embed.vidrift.in/embed/movie/${id}`,
      tv: (id, s, e) => `https://embed.vidrift.in/embed/tv/${id}/${s}/${e}`,
    },
    {
      id: 'pro2',
      name: 'Pro 2',
      movie: (id) => `https://cinesrc.st/embed/movie/${id}`,
      tv: (id, s, e) => `https://cinesrc.st/embed/tv/${id}?s=${s}&e=${e}`,
    },
    {
      id: 'pro3',
      name: 'Pro 3',
      movie: (id) => `https://bingr.one/watch/movie/${id}`,
      tv: (id, s, e) => `https://bingr.one/watch/tv/${id}/${s}/${e}`,
    },
    {
      id: 'main',
      name: 'Nflix Main',
      movie: (id) => `https://nflixmovies.app/embed/movie/${id}`,
      tv: (id, s, e) => `https://nflixmovies.app/embed/tv/${id}/${s}/${e}`,
    },
    {
      id: 'vares',
      name: 'Vares',
      movie: (id) => `https://vares.top/movie/${id}`,
      tv: (id, s, e) => `https://vares.top/tv/${id}/${s}/${e}`,
    },
    {
      id: 'november',
      name: 'November',
      movie: (id) => `https://vidfast.me/movie/${id}?autoPlay=false&theme=E50914`,
      tv: (id, s, e) => `https://vidfast.me/tv/${id}/${s}/${e}?autoPlay=false&nextButton=true&autoNext=true&theme=E50914`,
    },
  ];

  let activeSourceId = localStorage.getItem('nflix_source_id') || 'pro1';

  function getActiveSource() {
    return SOURCES.find((s) => s.id === activeSourceId) || SOURCES[0];
  }

  function setSourceId(id) {
    activeSourceId = id;
    try { localStorage.setItem('nflix_source_id', id); } catch(e) {}
  }

  function movieEmbedUrl(tmdbId, progress) {
    const src = getActiveSource();
    return src.movie(tmdbId);
  }

  function tvEmbedUrl(tmdbId, season, episode, progress) {
    const src = getActiveSource();
    return src.tv(tmdbId, season, episode);
  }

  // -- Push -------------------------------------------------
  function schedulePush(seconds, message) {
    try {
      if (typeof push === 'function') {
        push(seconds, message);
        return true;
      }
      if (typeof window.push === 'function') {
        window.push(seconds, message);
        return true;
      }
    } catch (err) {
      console.warn('push() failed', err);
    }

    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        setTimeout(() => {
          if (document.visibilityState === 'hidden') {
            new Notification(CONFIG.brand, { body: message });
          }
        }, Math.max(0, seconds) * 1000);
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  function bootstrapNotifications() {
    if (!localStorage.getItem(KEYS.pushBootstrapped)) {
      schedulePush(CONFIG.pushWelcomeDelay, CONFIG.pushWelcomeMessage);
      localStorage.setItem(KEYS.pushBootstrapped, '1');
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        schedulePush(90, 'Come back to Nflix — new trending titles are waiting.');
      }
    });

    schedulePush(CONFIG.pushReminderDelay, CONFIG.pushReminderMessage);
  }

  // -- UI helpers -------------------------------------------
  function toast(msg) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.hidden = true;
    }, 2200);
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ratingText(avg) {
    if (!avg || avg <= 0) return null;
    return avg.toFixed(1);
  }

  function cardHtml(item, extraSub) {
    const poster = img(item.posterPath, 'w342');
    const year = yearOf(item.releaseDate);
    const sub =
      extraSub ||
      [year, ratingText(item.voteAverage)].filter(Boolean).join(' · ');
    return `
      <button type="button" class="card" data-open-details="${item.mediaType}:${item.tmdbId}">
        <div class="card-poster">
          ${
            poster
              ? `<img src="${esc(poster)}" alt="" loading="lazy" decoding="async" />`
              : `<div class="card-ph">${esc(item.title.slice(0, 1))}</div>`
          }
          <span class="card-badge">${item.mediaType === 'movie' ? 'Movie' : 'TV'}</span>
        </div>
        <p class="card-title">${esc(item.title)}</p>
        <p class="card-sub">${esc(sub)}</p>
      </button>`;
  }

  function rowHtml(title, items) {
    if (!items || !items.length) return '';
    return `
      <section class="row">
        <h2 class="row-title">${esc(title)}</h2>
        <div class="row-scroller">
          ${items.map((i) => cardHtml(i)).join('')}
        </div>
      </section>`;
  }

  function continueRowHtml(entries) {
    if (!entries.length) return '';
    return `
      <section class="row">
        <h2 class="row-title">Continue Watching</h2>
        <div class="row-scroller">
          ${entries
            .map((e) => {
              const poster = img(e.posterPath, 'w342');
              const sub =
                e.mediaType === 'tv' ? `S${e.season} · E${e.episode}` : 'Continue';
              const pct =
                e.duration && e.duration > 0
                  ? Math.min(100, (e.progress / e.duration) * 100)
                  : e.progress > 0
                    ? 8
                    : 0;
              const open =
                e.mediaType === 'tv'
                  ? `tv:${e.contentId}:${e.season}:${e.episode}`
                  : `movie:${e.contentId}`;
              return `
              <button type="button" class="card" data-open-watch="${open}">
                <div class="card-poster">
                  ${
                    poster
                      ? `<img src="${esc(poster)}" alt="" loading="lazy" decoding="async" />`
                      : `<div class="card-ph">${esc((e.title || '?').slice(0, 1))}</div>`
                  }
                  ${
                    pct
                      ? `<div class="card-progress"><span style="width:${pct}%"></span></div>`
                      : ''
                  }
                  <span class="card-badge">${e.mediaType === 'movie' ? 'Movie' : 'TV'}</span>
                </div>
                <p class="card-title">${esc(e.title)}</p>
                <p class="card-sub">${esc(sub)}</p>
              </button>`;
            })
            .join('')}
        </div>
      </section>`;
  }

  function heroHtml(item) {
    if (!item) return '';
    const bg = img(item.backdropPath, 'w1280') || img(item.posterPath, 'w780');
    const year = yearOf(item.releaseDate);
    return `
      <section class="hero">
        ${bg ? `<div class="hero-bg" style="background-image:url('${esc(bg)}')"></div>` : ''}
        <div class="hero-grad"></div>
        <div class="hero-body">
          <p class="hero-eyebrow">${item.mediaType === 'movie' ? 'Featured Movie' : 'Featured Series'}</p>
          <h1>${esc(item.title)}</h1>
          <p class="hero-meta">${esc(
            [year, ratingText(item.voteAverage)].filter(Boolean).join('  ·  '),
          )}</p>
          <p class="hero-overview">${esc(item.overview)}</p>
          <div class="hero-actions">
            <button type="button" class="btn primary lg" data-open-watch="${item.mediaType}:${item.tmdbId}">
              ${ICONS.play}<span>Watch</span>
            </button>
            <button type="button" class="btn ghost lg" data-open-details="${item.mediaType}:${item.tmdbId}">More Info</button>
          </div>
        </div>
      </section>`;
  }

  // =========================================================
  // Player layer — fullscreen + mini player
  // =========================================================
  function playerLayer() {
    return $('#player-layer');
  }

  function ensurePlayerDom() {
    let layer = playerLayer();
    if (layer) return layer;

    layer = document.createElement('div');
    layer.id = 'player-layer';
    layer.className = 'player-layer mode-hidden';
    layer.hidden = true;
    layer.innerHTML = `
      <div class="player-shell" id="player-shell">
        <div class="player-frame-host" id="player-frame-host">
          <div class="player-skeleton" id="player-skel">
            <div>
              <div class="spin"></div>
              <div style="font-weight:700;margin-bottom:.25rem" id="player-skel-title">Loading</div>
              <div style="color:var(--muted);font-size:.85rem">Starting player…</div>
            </div>
          </div>
        </div>
        <div class="player-tap-zone" id="player-tap-zone" aria-hidden="true"></div>
        <div class="player-gesture-bottom" id="player-gesture-bottom" aria-hidden="true"></div>
        <button type="button" class="player-expand-fab" id="player-expand-fab" aria-label="Fullscreen">
          ${ICONS.expand}
        </button>
        <div class="player-chrome player-chrome-top" id="player-chrome-top">
          <button type="button" class="player-ctrl" id="player-btn-back" aria-label="Back">${ICONS.back}</button>
          <div class="player-title" id="player-title-label"></div>
          <button type="button" class="player-ctrl" id="player-btn-pip" aria-label="Mini player">${ICONS.pip}</button>
          <button type="button" class="player-ctrl" id="player-btn-close" aria-label="Close">${ICONS.close}</button>
        </div>
        <div class="player-chrome player-chrome-bottom" id="player-chrome-bottom">
          <button type="button" class="player-ctrl" id="player-btn-fs" aria-label="Fullscreen">${ICONS.expand}</button>
        </div>
        <div class="player-hint" id="player-hint">Swipe up for mini player</div>
      </div>
    `;
    document.body.appendChild(layer);
    bindPlayerChrome(layer);
    return layer;
  }

  function updateChromeLabels() {
    const title = $('#player-title-label');
    const skelTitle = $('#player-skel-title');
    const label = player.meta?.title || 'Now playing';
    if (title) title.textContent = label;
    if (skelTitle) skelTitle.textContent = label;

    const fsBtn = $('#player-btn-fs');
    if (fsBtn) {
      fsBtn.innerHTML = player.mode === 'fullscreen' ? ICONS.compress : ICONS.expand;
      fsBtn.setAttribute(
        'aria-label',
        player.mode === 'fullscreen' ? 'Exit fullscreen' : 'Fullscreen',
      );
    }

    const pipBtn = $('#player-btn-pip');
    if (pipBtn) {
      pipBtn.hidden = player.mode === 'pip';
    }

    const backBtn = $('#player-btn-back');
    if (backBtn) {
      // In fullscreen, back exits to inline/pip; in pip back expands
      backBtn.setAttribute(
        'aria-label',
        player.mode === 'pip' ? 'Expand' : player.mode === 'fullscreen' ? 'Minimize' : 'Back',
      );
    }
  }

  function showChrome(briefly) {
    const layer = playerLayer();
    if (!layer || player.mode === 'hidden') return;
    layer.classList.add('show-chrome');
    clearTimeout(player.chromeTimer);
    if (briefly && player.mode === 'fullscreen') {
      player.chromeTimer = setTimeout(() => {
        layer.classList.remove('show-chrome');
      }, 2800);
    }
  }

  function showFullscreenHint() {
    const layer = playerLayer();
    if (!layer || player.mode !== 'fullscreen') return;
    layer.classList.add('show-hint');
    clearTimeout(player.hintTimer);
    player.hintTimer = setTimeout(() => {
      layer.classList.remove('show-hint');
    }, 2600);
  }

  function placePlayerInSlot() {
    const layer = playerLayer();
    const slot = $('#player-slot');
    if (!layer) return;
    if (slot) {
      slot.appendChild(layer);
      slot.classList.remove('is-empty');
    } else {
      document.body.appendChild(layer);
    }
  }

  function setPlayerMode(mode) {
    const layer = ensurePlayerDom();
    player.mode = mode;

    layer.classList.remove('mode-hidden', 'mode-inline', 'mode-fullscreen', 'mode-pip');
    layer.hidden = mode === 'hidden';

    document.body.classList.toggle('player-fs-lock', mode === 'fullscreen');
    document.body.classList.toggle('has-pip', mode === 'pip');
    const v = view();
    if (v) v.classList.toggle('has-pip', mode === 'pip');

    if (mode === 'hidden') {
      layer.classList.add('mode-hidden');
      // Keep DOM but stop loading if closed
      const host = $('#player-frame-host');
      if (host) {
        const frame = host.querySelector('iframe');
        if (frame) frame.remove();
        const err = host.querySelector('.player-error');
        if (err) err.remove();
      }
      player.meta = null;
      player.pipPos = null;
      updateChromeLabels();
      return;
    }

    layer.classList.add(`mode-${mode}`);

    if (mode === 'inline') {
      placePlayerInSlot();
      layer.style.left = '';
      layer.style.top = '';
      layer.style.right = '';
      layer.style.bottom = '';
      layer.style.width = '';
      layer.style.height = '';
      layer.classList.add('show-chrome');
    } else if (mode === 'fullscreen') {
      document.body.appendChild(layer);
      layer.style.left = '';
      layer.style.top = '';
      layer.style.right = '';
      layer.style.bottom = '';
      layer.style.width = '';
      layer.style.height = '';
      showChrome(true);
      showFullscreenHint();
    } else if (mode === 'pip') {
      document.body.appendChild(layer);
      applyPipPosition();
      layer.classList.add('show-chrome');
    }

    updateChromeLabels();
  }

  function applyPipPosition() {
    const layer = playerLayer();
    if (!layer || player.mode !== 'pip') return;

    if (player.pipPos) {
      const maxX = window.innerWidth - layer.offsetWidth - 8;
      const maxY = window.innerHeight - layer.offsetHeight - 8;
      const x = Math.max(8, Math.min(player.pipPos.x, maxX));
      const y = Math.max(8, Math.min(player.pipPos.y, maxY));
      layer.style.left = `${x}px`;
      layer.style.top = `${y}px`;
      layer.style.right = 'auto';
      layer.style.bottom = 'auto';
    } else {
      layer.style.left = '';
      layer.style.top = '';
      layer.style.right = '';
      layer.style.bottom = '';
    }
  }

  function openPlayer(meta, { autoFullscreen = false } = {}) {
    ensurePlayerDom();
    const host = $('#player-frame-host');
    const needReload = !sameWatch(player.meta, meta) || !host.querySelector('iframe');

    player.meta = { ...meta };

    if (needReload) {
      // Clear previous frame
      const old = host.querySelector('iframe');
      if (old) old.remove();
      const oldErr = host.querySelector('.player-error');
      if (oldErr) oldErr.remove();

      let skel = $('#player-skel');
      if (!skel) {
        skel = document.createElement('div');
        skel.className = 'player-skeleton';
        skel.id = 'player-skel';
        skel.innerHTML = `
          <div>
            <div class="spin"></div>
            <div style="font-weight:700;margin-bottom:.25rem" id="player-skel-title"></div>
            <div style="color:var(--muted);font-size:.85rem">Starting player…</div>
          </div>`;
        host.appendChild(skel);
      }
      skel.hidden = false;
      skel.style.opacity = '1';

      const frame = document.createElement('iframe');
      frame.id = 'player-frame';
      frame.src = meta.embed;
      frame.title = `Watch ${meta.title || ''}`;
      frame.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
      frame.setAttribute('allowfullscreen', 'true');
      frame.setAttribute('webkitallowfullscreen', 'true');
      frame.setAttribute('playsinline', 'true');
      frame.setAttribute('webkit-playsinline', 'true');
      frame.setAttribute('referrerpolicy', 'no-referrer');
      host.appendChild(frame);

      clearTimeout(player.loadTimer);
      player.loadTimer = setTimeout(() => showPlayerError(), 45000);

      frame.addEventListener('load', () => {
        clearTimeout(player.loadTimer);
        const s = $('#player-skel');
        if (s) {
          s.style.opacity = '0';
          s.style.transition = 'opacity .35s ease';
          setTimeout(() => {
            if (s.parentNode) s.remove();
          }, 360);
        }
      });
      frame.addEventListener('error', () => {
        clearTimeout(player.loadTimer);
        showPlayerError();
      });
    }

    updateChromeLabels();

    if (autoFullscreen) setPlayerMode('fullscreen');
    else if (player.mode === 'pip' && route.name === 'watch' && sameWatch(player.meta, meta)) {
      setPlayerMode('inline');
    } else if (route.name === 'watch') {
      setPlayerMode('inline');
    } else {
      setPlayerMode(player.mode === 'hidden' ? 'inline' : player.mode);
    }
  }

  function showPlayerError() {
    const host = $('#player-frame-host');
    if (!host || host.querySelector('.player-error')) return;
    const skel = $('#player-skel');
    if (skel) skel.remove();
    const err = document.createElement('div');
    err.className = 'player-error';
    err.innerHTML = `
      <h3>Playback unavailable</h3>
      <p>The player could not be loaded right now.</p>
      <div class="btn-row" style="justify-content:center">
        <button type="button" class="btn primary" id="player-try-again">Try Again</button>
      </div>`;
    host.appendChild(err);
    const btn = err.querySelector('#player-try-again');
    if (btn) {
      btn.onclick = () => {
        if (!player.meta) return;
        const m = { ...player.meta };
        player.meta = null;
        openPlayer(m);
        setPlayerMode(player.mode === 'hidden' ? 'inline' : player.mode);
      };
    }
  }

  function closePlayer() {
    clearTimeout(player.loadTimer);
    clearTimeout(player.chromeTimer);
    clearTimeout(player.hintTimer);
    setPlayerMode('hidden');
    // If on watch page, go back to details
    if (route.name === 'watch' && route.params?.type && route.params?.id) {
      navigate('details', { type: route.params.type, id: route.params.id });
    }
  }

  function expandFromPip() {
    if (!player.meta) return;
    const m = player.meta;
    if (route.name === 'watch' && sameWatch(m, {
      type: route.params.type,
      id: route.params.id,
      season: route.params.season,
      episode: route.params.episode,
    })) {
      setPlayerMode('fullscreen');
      return;
    }
    // Navigate to watch — openPlayer will attach inline, then go fullscreen
    const params = {
      type: m.type,
      id: m.id,
      season: m.season || 1,
      episode: m.episode || 1,
      _fs: true,
    };
    navigate('watch', params);
  }

  function bindPlayerChrome(layer) {
    const tap = $('#player-tap-zone', layer);
    const gestureBottom = $('#player-gesture-bottom', layer);
    const btnFs = $('#player-btn-fs', layer);
    const btnPip = $('#player-btn-pip', layer);
    const btnClose = $('#player-btn-close', layer);
    const btnBack = $('#player-btn-back', layer);
    const expandFab = $('#player-expand-fab', layer);

    let tapInfo = null;

    const onTouchStart = (e) => {
      const t = e.touches ? e.touches[0] : e;
      tapInfo = {
        x: t.clientX,
        y: t.clientY,
        t: Date.now(),
        moved: false,
      };
      if (player.mode === 'pip') {
        const rect = layer.getBoundingClientRect();
        tapInfo.ox = t.clientX - rect.left;
        tapInfo.oy = t.clientY - rect.top;
        tapInfo.dragging = true;
      }
      if (player.mode === 'fullscreen') {
        showChrome(true);
      }
    };

    const onTouchMove = (e) => {
      if (!tapInfo) return;
      const t = e.touches ? e.touches[0] : e;
      const dx = t.clientX - tapInfo.x;
      const dy = t.clientY - tapInfo.y;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) tapInfo.moved = true;

      // Fullscreen: swipe up → mini player; swipe down → exit fullscreen
      if (player.mode === 'fullscreen' && e.touches) {
        if (dy < -70 && Math.abs(dy) > Math.abs(dx) * 1.2) {
          tapInfo = null;
          setPlayerMode('pip');
          toast('Mini player');
          return;
        }
        if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.2) {
          tapInfo = null;
          setPlayerMode('inline');
          if (route.name !== 'watch' && player.meta) {
            navigate('watch', {
              type: player.meta.type,
              id: player.meta.id,
              season: player.meta.season || 1,
              episode: player.meta.episode || 1,
            });
          }
          return;
        }
      }

      if (player.mode === 'pip' && tapInfo.dragging) {
        e.preventDefault();
        const x = t.clientX - tapInfo.ox;
        const y = t.clientY - tapInfo.oy;
        player.pipPos = { x, y };
        applyPipPosition();
      }
    };

    const onTouchEnd = () => {
      if (!tapInfo) return;
      const info = tapInfo;
      tapInfo = null;

      const wasTap = !info.moved && Date.now() - info.t < 450;
      if (!wasTap) {
        if (player.mode === 'pip' && info.dragging && info.moved) {
          snapPipToCorner();
        }
        return;
      }

      // Tap top strip (inline) or FAB → fullscreen
      if (player.mode === 'inline') {
        setPlayerMode('fullscreen');
      } else if (player.mode === 'fullscreen') {
        showChrome(true);
      } else if (player.mode === 'pip') {
        expandFromPip();
      }
    };

    const bindGestureTarget = (el) => {
      if (!el) return;
      el.addEventListener('touchstart', onTouchStart, { passive: true });
      el.addEventListener('touchmove', onTouchMove, { passive: false });
      el.addEventListener('touchend', onTouchEnd, { passive: true });
      el.addEventListener('mousedown', onTouchStart);
    };

    bindGestureTarget(tap);
    bindGestureTarget(gestureBottom);
    bindGestureTarget($('#player-chrome-top', layer));

    window.addEventListener('mousemove', onTouchMove);
    window.addEventListener('mouseup', onTouchEnd);

    const goFullscreen = (e) => {
      if (e) e.stopPropagation();
      setPlayerMode('fullscreen');
    };

    if (expandFab) expandFab.onclick = goFullscreen;

    if (btnFs) {
      btnFs.onclick = (e) => {
        e.stopPropagation();
        if (player.mode === 'fullscreen') {
          setPlayerMode(route.name === 'watch' ? 'inline' : 'pip');
        } else {
          setPlayerMode('fullscreen');
        }
      };
    }

    if (btnPip) {
      btnPip.onclick = (e) => {
        e.stopPropagation();
        setPlayerMode('pip');
        toast('Mini player — browse while watching');
      };
    }

    if (btnClose) {
      btnClose.onclick = (e) => {
        e.stopPropagation();
        closePlayer();
      };
    }

    if (btnBack) {
      btnBack.onclick = (e) => {
        e.stopPropagation();
        if (player.mode === 'fullscreen') {
          setPlayerMode('pip');
          toast('Mini player');
        } else if (player.mode === 'pip') {
          expandFromPip();
        } else if (player.mode === 'inline' && player.meta) {
          navigate('details', { type: player.meta.type, id: player.meta.id });
        }
      };
    }

    window.addEventListener('resize', () => {
      if (player.mode === 'pip') {
        if (player.pipPos) applyPipPosition();
        else snapPipToCorner();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (player.mode === 'fullscreen') setPlayerMode(route.name === 'watch' ? 'inline' : 'pip');
        else if (player.mode === 'pip') closePlayer();
      }
    });
  }

  function snapPipToCorner() {
    const layer = playerLayer();
    if (!layer || player.mode !== 'pip') return;
    const rect = layer.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const midX = window.innerWidth / 2;
    const midY = window.innerHeight / 2;
    const margin = 12;
    const tabClear = 54 + (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-bot')) || 0);

    let x = cx < midX ? margin : window.innerWidth - rect.width - margin;
    let y =
      cy < midY
        ? margin + (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0)
        : window.innerHeight - rect.height - margin - tabClear;

    player.pipPos = { x, y };
    applyPipPosition();
  }

  // After watch page renders, attach player into slot
  function attachPlayerToWatchPage(meta, preferFs) {
    ensurePlayerDom();
    openPlayer(meta, { autoFullscreen: !!preferFs });
    // Ensure inline placement after open
    if (!preferFs) {
      setPlayerMode('inline');
    } else {
      setPlayerMode('fullscreen');
    }
  }

  // -- Pages ------------------------------------------------
  async function renderHome() {
    view().innerHTML = `<div class="loading">Loading Nflix…</div>`;
    try {
      const [day, week, movies, tv, popM, popT, now, air] = await Promise.all([
        fetchList('/trending/all/day', 'auto'),
        fetchList('/trending/all/week', 'auto'),
        fetchList('/trending/movie/week', 'movie'),
        fetchList('/trending/tv/week', 'tv'),
        fetchList('/movie/popular', 'movie'),
        fetchList('/tv/popular', 'tv'),
        fetchList('/movie/now_playing', 'movie'),
        fetchList('/tv/airing_today', 'tv'),
      ]);
      const cw = readJson(KEYS.continueWatching, []);
      const hero = day[0] || week[0] || popM[0];

      view().innerHTML = `
        ${heroHtml(hero)}
        <div class="pills">
          <button type="button" class="pill accent" data-nav="movies">Movies</button>
          <button type="button" class="pill accent" data-nav="tv">TV Shows</button>
          <button type="button" class="pill accent" data-nav="surprise">Surprise</button>
          <button type="button" class="pill" id="instant-play">Instant play</button>
        </div>
        ${continueRowHtml(cw)}
        ${rowHtml('Trending Today', day)}
        ${rowHtml('Trending This Week', week)}
        ${rowHtml('Trending Movies', movies)}
        ${rowHtml('Trending TV Shows', tv)}
        ${rowHtml('Popular Movies', popM)}
        ${rowHtml('Popular TV Shows', popT)}
        ${rowHtml('Now Playing', now)}
        ${rowHtml('Airing Today', air)}
        <p class="view-pad player-attr" style="margin-top:1rem">
          Streaming provided by <a href="https://nflixmovies.app/embed" target="_blank" rel="noopener">NflixMovies</a>
          · Data by <a href="https://www.themoviedb.org/" target="_blank" rel="noopener">TMDB</a>
        </p>
      `;

      const instant = $('#instant-play');
      if (instant) {
        instant.onclick = async () => {
          toast('Picking something great…');
          const pool = day.length ? day : week;
          const pick = pool[Math.floor(Math.random() * pool.length)];
          if (pick) navigate('watch', { type: pick.mediaType, id: pick.tmdbId });
        };
      }
    } catch (err) {
      view().innerHTML = `<div class="error-box">Could not load catalog.<br/>${esc(err.message)}</div>`;
    }
  }

  async function renderCatalog(type) {
    const isMovie = type === 'movie';
    view().innerHTML = `<div class="loading">Loading ${isMovie ? 'movies' : 'TV shows'}…</div>`;
    try {
      const [trend, day, popular, top, fresh, genres] = await Promise.all([
        fetchList(`/trending/${type}/week`, type),
        fetchList(`/trending/${type}/day`, type),
        fetchList(isMovie ? '/movie/popular' : '/tv/popular', type),
        fetchList(isMovie ? '/movie/top_rated' : '/tv/top_rated', type),
        isMovie
          ? Promise.all([
              fetchList('/movie/now_playing', 'movie'),
              fetchList('/movie/upcoming', 'movie'),
            ]).then((a) => a.flat())
          : Promise.all([
              fetchList('/tv/airing_today', 'tv'),
              fetchList('/tv/on_the_air', 'tv'),
            ]).then((a) => a.flat()),
        tmdb(isMovie ? '/genre/movie/list' : '/genre/tv/list'),
      ]);

      const genreList = (genres.genres || []).slice(0, 4);
      const genreRows = await Promise.all(
        genreList.map(async (g) => {
          const items = await fetchList(
            isMovie ? '/discover/movie' : '/discover/tv',
            type,
            { with_genres: g.id, sort_by: 'popularity.desc' },
          );
          return { name: g.name, items };
        }),
      );

      view().innerHTML = `
        ${heroHtml(trend[0] || popular[0])}
        <div class="view-pad">
          <p class="hero-eyebrow" style="margin:0 0 .25rem">${isMovie ? 'Film' : 'Series'}</p>
          <h1 class="page-title">${isMovie ? 'Movies' : 'TV Shows'}</h1>
          <p class="page-lead">${
            isMovie
              ? 'Blockbusters, classics, and everything in between'
              : 'Binge-worthy series and new episodes'
          }</p>
        </div>
        ${rowHtml('Trending Today', day)}
        ${rowHtml('Trending This Week', trend)}
        ${rowHtml(isMovie ? 'Now Playing & Upcoming' : 'Airing & On The Air', fresh)}
        ${rowHtml('Popular', popular)}
        ${rowHtml('Top Rated', top)}
        ${genreRows.map((r) => rowHtml(r.name, r.items)).join('')}
        <div class="view-pad">
          <h2 class="section-title">Browse all</h2>
          <div class="grid">${popular.map((i) => cardHtml(i)).join('')}</div>
        </div>
      `;
    } catch (err) {
      view().innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
    }
  }

  async function renderSurprise() {
    const filter = route.params.filter || 'all';
    view().innerHTML = `
      <div class="view-pad">
        <p class="hero-eyebrow">Feeling lucky?</p>
        <h1 class="page-title">Surprise Me</h1>
        <p class="page-lead">A random title when you can’t decide.</p>
        <div class="pills" style="padding:0 0 1rem">
          <button type="button" class="pill ${filter === 'all' ? 'is-active' : ''}" data-surprise-filter="all">Anything</button>
          <button type="button" class="pill ${filter === 'movie' ? 'is-active' : ''}" data-surprise-filter="movie">Movies</button>
          <button type="button" class="pill ${filter === 'tv' ? 'is-active' : ''}" data-surprise-filter="tv">TV</button>
        </div>
      </div>
      <div class="loading" id="surprise-loading">Finding something great…</div>
      <div id="surprise-stage"></div>
      <div class="view-pad" style="text-align:center">
        <button type="button" class="btn primary lg" id="surprise-roll">Roll again</button>
      </div>
    `;

    $$('[data-surprise-filter]').forEach((b) => {
      b.onclick = () => navigate('surprise', { filter: b.dataset.surpriseFilter });
    });

    async function roll() {
      $('#surprise-loading').hidden = false;
      $('#surprise-stage').innerHTML = '';
      try {
        let pool;
        if (filter === 'all') pool = await fetchList('/trending/all/week', 'auto');
        else if (filter === 'movie')
          pool = await fetchList('/discover/movie', 'movie', {
            sort_by: 'popularity.desc',
            page: 1 + Math.floor(Math.random() * 5),
          });
        else
          pool = await fetchList('/discover/tv', 'tv', {
            sort_by: 'popularity.desc',
            page: 1 + Math.floor(Math.random() * 5),
          });

        const pick = pool[Math.floor(Math.random() * pool.length)];
        if (!pick) throw new Error('No titles found');

        const bg = img(pick.backdropPath, 'w1280') || img(pick.posterPath, 'w780');
        const poster = img(pick.posterPath, 'w500');
        const year = yearOf(pick.releaseDate);

        $('#surprise-loading').hidden = true;
        $('#surprise-stage').innerHTML = `
          <div class="surprise-card">
            ${bg ? `<div class="hero-bg" style="background-image:url('${esc(bg)}');filter:blur(16px);transform:scale(1.15);opacity:.45"></div>` : ''}
            <div class="hero-grad"></div>
            <div class="surprise-inner">
              ${poster ? `<img class="surprise-poster" src="${esc(poster)}" alt="" />` : ''}
              <div>
                <p class="hero-eyebrow">${pick.mediaType === 'movie' ? 'Movie' : 'TV Show'}</p>
                <h2 style="margin:0 0 .35rem;font-size:1.45rem;font-weight:800">${esc(pick.title)}</h2>
                <p class="hero-meta">${esc(
                  [year, ratingText(pick.voteAverage)].filter(Boolean).join(' · '),
                )}</p>
                <p class="hero-overview">${esc(pick.overview)}</p>
                <div class="hero-actions">
                  <button type="button" class="btn primary lg" data-open-watch="${pick.mediaType}:${pick.tmdbId}">
                    ${ICONS.play}<span>Watch now</span>
                  </button>
                  <button type="button" class="btn ghost lg" data-open-details="${pick.mediaType}:${pick.tmdbId}">Details</button>
                </div>
              </div>
            </div>
          </div>
        `;
        bindOpenButtons($('#surprise-stage'));
      } catch (err) {
        $('#surprise-loading').hidden = true;
        $('#surprise-stage').innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
      }
    }

    $('#surprise-roll').onclick = () => roll();
    roll();
  }

  function renderList() {
    const later = readJson(KEYS.watchLater, []);
    const favs = readJson(KEYS.favorites, []);
    const cw = readJson(KEYS.continueWatching, []);

    view().innerHTML = `
      <div class="view-pad">
        <h1 class="page-title">My List</h1>
        <p class="page-lead">Watch Later, favorites, and continue watching — saved on this device.</p>
      </div>
      ${continueRowHtml(cw)}
      <div class="view-pad">
        <h2 class="section-title">Watch Later</h2>
        ${
          later.length
            ? `<div class="grid">${later.map((i) => cardHtml(i)).join('')}</div>`
            : `<p class="empty">Nothing saved yet.</p>`
        }
        <h2 class="section-title">Favorites</h2>
        ${
          favs.length
            ? `<div class="grid">${favs.map((i) => cardHtml(i)).join('')}</div>`
            : `<p class="empty">No favorites yet.</p>`
        }
      </div>
    `;
  }

  async function renderDetails() {
    const { type, id } = route.params;
    view().innerHTML = `<div class="loading">Loading…</div>`;
    try {
      const raw = await tmdb(`/${type}/${id}`);
      const item = mapItem(raw, type);
      const bg = img(item.backdropPath, 'w1280') || img(item.posterPath, 'w780');
      const poster = img(item.posterPath, 'w500');
      const genres = (raw.genres || []).map((g) => g.name).join(', ');
      const year = yearOf(item.releaseDate);
      const runtime =
        type === 'movie' && raw.runtime
          ? raw.runtime >= 60
            ? `${Math.floor(raw.runtime / 60)}h ${raw.runtime % 60}m`
            : `${raw.runtime}m`
          : null;
      const inLater = libraryHas(KEYS.watchLater, type, id);
      const inFav = libraryHas(KEYS.favorites, type, id);

      const [similar, rec] = await Promise.all([
        fetchList(`/${type}/${id}/similar`, type),
        fetchList(`/${type}/${id}/recommendations`, type),
      ]);

      view().innerHTML = `
        <div class="detail-hero">
          ${bg ? `<div class="hero-bg" style="background-image:url('${esc(bg)}')"></div>` : ''}
          <div class="hero-grad"></div>
          <div class="detail-content">
            ${poster ? `<img class="detail-poster" src="${esc(poster)}" alt="" />` : ''}
            <div class="detail-info">
              <button type="button" class="back-link" data-nav="home">${ICONS.back} Back</button>
              <p class="hero-eyebrow">${type === 'movie' ? 'Movie' : 'TV Series'}</p>
              <h1>${esc(item.title)}</h1>
              <p class="detail-meta">${esc(
                [genres, year, ratingText(item.voteAverage), runtime].filter(Boolean).join(' · '),
              )}</p>
              <p class="detail-overview">${esc(item.overview)}</p>
              <div class="btn-row">
                <button type="button" class="btn primary lg" data-open-watch="${type}:${id}">
                  ${ICONS.play}<span>Watch</span>
                </button>
              </div>
              <div class="btn-row">
                <button type="button" class="btn ghost ${inLater ? 'is-on' : ''}" id="btn-later">
                  ${inLater ? ICONS.check : ICONS.plus}<span>${inLater ? 'Watch Later' : 'Watch Later'}</span>
                </button>
                <button type="button" class="btn ghost ${inFav ? 'is-on' : ''}" id="btn-fav">
                  ${ICONS.heart}<span>${inFav ? 'Favorited' : 'Favorite'}</span>
                </button>
                <button type="button" class="btn ghost" id="btn-share">Share</button>
              </div>
            </div>
          </div>
        </div>
        ${rowHtml('Similar', similar)}
        ${rowHtml('Recommended', rec)}
      `;

      $('#btn-later').onclick = () => {
        const on = libraryToggle(KEYS.watchLater, item);
        toast(on ? 'Added to Watch Later' : 'Removed from Watch Later');
        renderDetails();
      };
      $('#btn-fav').onclick = () => {
        const on = libraryToggle(KEYS.favorites, item);
        toast(on ? 'Added to Favorites' : 'Removed from Favorites');
        renderDetails();
      };
      $('#btn-share').onclick = async () => {
        const text = `${item.title} on Nflix`;
        try {
          if (navigator.share) await navigator.share({ title: item.title, text });
          else {
            await navigator.clipboard.writeText(text);
            toast('Copied');
          }
        } catch {
          /* cancelled */
        }
      };
    } catch (err) {
      view().innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
    }
  }

  async function renderWatch() {
    const type = route.params.type;
    let id = Number(route.params.id);
    let season = Number(route.params.season) || 1;
    let episode = Number(route.params.episode) || 1;
    const preferFs = !!route.params._fs;
    // clear one-shot flag
    if (route.params._fs) delete route.params._fs;

    view().innerHTML = `<div class="loading">Loading player…</div>`;

    try {
      let title = 'Watch';
      let overview = '';
      let posterPath = null;
      let backdropPath = null;
      let genres = '';
      let year = null;
      let rating = null;
      let runtime = null;
      let seasons = [];
      let episodes = [];
      let currentEp = null;
      let summary = null;

      if (type === 'movie') {
        const raw = await tmdb(`/movie/${id}`);
        summary = mapItem(raw, 'movie');
        title = summary.title;
        overview = summary.overview;
        posterPath = summary.posterPath;
        backdropPath = summary.backdropPath;
        genres = (raw.genres || []).map((g) => g.name).join(', ');
        year = yearOf(summary.releaseDate);
        rating = ratingText(summary.voteAverage);
        runtime = raw.runtime
          ? raw.runtime >= 60
            ? `${Math.floor(raw.runtime / 60)}h ${raw.runtime % 60}m`
            : `${raw.runtime}m`
          : null;
      } else {
        const raw = await tmdb(`/tv/${id}`);
        summary = mapItem(raw, 'tv');
        title = summary.title;
        posterPath = summary.posterPath;
        backdropPath = summary.backdropPath;
        genres = (raw.genres || []).map((g) => g.name).join(', ');
        year = yearOf(summary.releaseDate);
        rating = ratingText(summary.voteAverage);
        seasons = (raw.seasons || []).filter((s) => s.season_number > 0);
        const seasonData = await tmdb(`/tv/${id}/season/${season}`);
        episodes = seasonData.episodes || [];
        currentEp = episodes.find((e) => e.episode_number === episode) || episodes[0];
        if (currentEp) {
          episode = currentEp.episode_number;
          overview = currentEp.overview || summary.overview;
          runtime = currentEp.runtime ? `${currentEp.runtime}m` : null;
        } else {
          overview = summary.overview;
        }
      }

      const saved = getProgress(type, id, season, episode);
      const progress = saved?.progress || 0;

      recordWatch({
        contentId: id,
        mediaType: type,
        season: type === 'tv' ? season : undefined,
        episode: type === 'tv' ? episode : undefined,
        progress,
        title,
        posterPath,
        backdropPath,
      });

      const embed =
        type === 'movie'
          ? movieEmbedUrl(id, progress)
          : tvEmbedUrl(id, season, episode, progress);

      const inLater = libraryHas(KEYS.watchLater, type, id);
      const inFav = libraryHas(KEYS.favorites, type, id);
      const epIdx = episodes.findIndex((e) => e.episode_number === episode);
      const hasPrev = type === 'tv' && (epIdx > 0 || seasons.some((s) => s.season_number === season - 1));
      const hasNext =
        type === 'tv' &&
        ((epIdx >= 0 && epIdx < episodes.length - 1) ||
          seasons.some((s) => s.season_number === season + 1));

      const [similar, rec] = await Promise.all([
        fetchList(`/${type}/${id}/similar`, type).catch(() => []),
        fetchList(`/${type}/${id}/recommendations`, type).catch(() => []),
      ]);
      const cw = readJson(KEYS.continueWatching, []);

      const meta = {
        type,
        id,
        season: type === 'tv' ? season : undefined,
        episode: type === 'tv' ? episode : undefined,
        title:
          type === 'tv' && currentEp
            ? `${title} · S${season}E${episode}`
            : title,
        embed,
        posterPath,
        backdropPath,
      };

      view().innerHTML = `
        <div class="view-pad">
          <div class="player-slot" id="player-slot"></div>
          <div class="server-picker" style="display:flex;align-items:center;gap:0.4rem;margin:0.6rem 0;overflow-x:auto;padding-bottom:0.25rem;-webkit-overflow-scrolling:touch;">
            <span style="font-size:0.75rem;color:var(--muted);font-weight:700;white-space:nowrap;margin-right:0.2rem;">Server:</span>
            ${SOURCES.map(s => `
              <button type="button" class="btn-source-chip ${s.id === activeSourceId ? 'active' : ''}" data-source-id="${s.id}" style="padding:0.3rem 0.65rem;font-size:0.75rem;font-weight:600;border-radius:18px;background:${s.id === activeSourceId ? 'var(--accent)' : 'var(--elevated)'};color:#fff;border:1px solid ${s.id === activeSourceId ? 'var(--accent)' : 'var(--line)'};white-space:nowrap;cursor:pointer;">
                ${esc(s.name)}
              </button>
            `).join('')}
          </div>
          <p class="player-attr">
            Tap player for controls · Switch servers above if playback fails
          </p>

          <button type="button" class="back-link" data-open-details="${type}:${id}">${ICONS.back} Back</button>
          <h1 class="page-title">${esc(title)}</h1>
          ${
            type === 'tv' && currentEp
              ? `<p class="page-lead" style="margin-top:-.35rem">S${season} E${episode} · ${esc(currentEp.name)}</p>`
              : ''
          }

          <div class="btn-row">
            <button type="button" class="btn ghost" id="w-fs">${ICONS.expand}<span>Fullscreen</span></button>
            <button type="button" class="btn ghost" id="w-pip">${ICONS.pip}<span>Mini player</span></button>
            <button type="button" class="btn ghost ${inLater ? 'is-on' : ''}" id="w-later">
              ${inLater ? ICONS.check : ICONS.plus}<span>Watch Later</span>
            </button>
            <button type="button" class="btn ghost ${inFav ? 'is-on' : ''}" id="w-fav">
              ${ICONS.heart}<span>${inFav ? 'Favorited' : 'Favorite'}</span>
            </button>
            <button type="button" class="btn ghost" id="w-share">Share</button>
          </div>

          <p class="detail-overview">${esc(overview)}</p>
          <p class="detail-meta">${esc(
            [genres, year, rating, runtime].filter(Boolean).join(' · '),
          )}</p>

          ${
            type === 'tv'
              ? `
            <div class="ep-nav">
              <button type="button" class="btn ghost" id="ep-prev" ${hasPrev ? '' : 'disabled'}>${ICONS.back} Previous</button>
              <button type="button" class="btn ghost" id="ep-next" ${hasNext ? '' : 'disabled'}>Next</button>
            </div>
            <div class="season-select">
              <label for="season-sel">Season</label>
              <select id="season-sel">
                ${seasons
                  .map(
                    (s) =>
                      `<option value="${s.season_number}" ${s.season_number === season ? 'selected' : ''}>${esc(
                        s.name || `Season ${s.season_number}`,
                      )}</option>`,
                  )
                  .join('')}
              </select>
            </div>
            <h2 class="section-title">Episodes</h2>
            <div class="ep-list">
              ${episodes
                .map(
                  (e) => `
                <button type="button" class="ep-item ${e.episode_number === episode ? 'is-active' : ''}" data-ep="${e.episode_number}">
                  <span class="ep-num">${String(e.episode_number).padStart(2, '0')}</span>
                  <span class="ep-body">
                    <span class="ep-name">${esc(e.name || `Episode ${e.episode_number}`)}</span>
                    ${e.overview ? `<div class="ep-overview">${esc(e.overview)}</div>` : ''}
                  </span>
                </button>`,
                )
                .join('')}
            </div>`
              : ''
          }
        </div>
        ${continueRowHtml(cw)}
        ${rowHtml('Similar', similar)}
        ${rowHtml('Recommended', rec)}
      `;

      // Mount / reuse player
      attachPlayerToWatchPage(meta, preferFs);

      const wFs = $('#w-fs');
      const wPip = $('#w-pip');
      if (wFs) wFs.onclick = () => setPlayerMode('fullscreen');
      if (wPip) {
        wPip.onclick = () => {
          setPlayerMode('pip');
          toast('Mini player — keep browsing');
        };
      }

      if (summary) {
        $('#w-later').onclick = () => {
          const on = libraryToggle(KEYS.watchLater, summary);
          toast(on ? 'Added to Watch Later' : 'Removed');
          renderWatch();
        };
        $('#w-fav').onclick = () => {
          const on = libraryToggle(KEYS.favorites, summary);
          toast(on ? 'Favorited' : 'Removed');
          renderWatch();
        };
      }
      $('#w-share').onclick = async () => {
        try {
          if (navigator.share) await navigator.share({ title });
          else toast('Sharing is not available here');
        } catch {
          /* cancelled */
        }
      };

      if (type === 'tv') {
        const goEp = (s, e) => navigate('watch', { type: 'tv', id, season: s, episode: e });

        $('#season-sel').onchange = (ev) => goEp(Number(ev.target.value), 1);

        $$('[data-ep]').forEach((btn) => {
          btn.onclick = () => goEp(season, Number(btn.dataset.ep));
        });

        const prev = $('#ep-prev');
        const next = $('#ep-next');
        if (prev) {
          prev.onclick = () => {
            if (epIdx > 0) goEp(season, episodes[epIdx - 1].episode_number);
            else if (seasons.some((s) => s.season_number === season - 1)) {
              const prevS = seasons.find((s) => s.season_number === season - 1);
              goEp(season - 1, prevS.episode_count || 1);
            }
          };
        }
        if (next) {
          next.onclick = () => {
            if (epIdx >= 0 && epIdx < episodes.length - 1) {
              goEp(season, episodes[epIdx + 1].episode_number);
            } else if (seasons.some((s) => s.season_number === season + 1)) {
              goEp(season + 1, 1);
            }
          };
        }
      }
    } catch (err) {
      view().innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
    }
  }

  async function renderSearch(q) {
    if (!q) {
      view().innerHTML = `<div class="empty">Type a title to search.</div>`;
      return;
    }
    view().innerHTML = `<div class="loading">Searching…</div>`;
    try {
      const data = await tmdb('/search/multi', { query: q, include_adult: 'false' });
      const items = (data.results || [])
        .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
        .map((r) => mapItem(r, r.media_type === 'tv' ? 'tv' : 'movie'));
      view().innerHTML = `
        <div class="view-pad">
          <h1 class="page-title">Results for “${esc(q)}”</h1>
          ${
            items.length
              ? `<div class="grid">${items.map((i) => cardHtml(i)).join('')}</div>`
              : `<p class="empty">No results.</p>`
          }
        </div>`;
    } catch (err) {
      view().innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
    }
  }

  // -- Router render ----------------------------------------
  async function render() {
    const v = view();
    v.classList.remove('fade-in');
    void v.offsetWidth;
    v.classList.add('fade-in');
    v.classList.toggle('has-pip', player.mode === 'pip');

    // If not on watch and player is inline, promote to pip so it stays visible
    if (route.name !== 'watch' && player.mode === 'inline' && player.meta) {
      setPlayerMode('pip');
    }

    switch (route.name) {
      case 'home':
        await renderHome();
        break;
      case 'movies':
        await renderCatalog('movie');
        break;
      case 'tv':
        await renderCatalog('tv');
        break;
      case 'surprise':
        await renderSurprise();
        break;
      case 'list':
        renderList();
        break;
      case 'details':
        await renderDetails();
        break;
      case 'watch':
        await renderWatch();
        break;
      case 'search':
        await renderSearch(route.params.q || '');
        break;
      default:
        await renderHome();
    }
    bindOpenButtons(v);

    // Re-assert pip body class after re-render
    document.body.classList.toggle('has-pip', player.mode === 'pip');
    v.classList.toggle('has-pip', player.mode === 'pip');
  }

  function bindOpenButtons(root) {
    $$('[data-open-details]', root).forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation();
        const [type, id] = el.dataset.openDetails.split(':');
        navigate('details', { type, id: Number(id) });
      };
    });
    $$('[data-open-watch]', root).forEach((el) => {
      el.onclick = (e) => {
        e.stopPropagation();
        const parts = el.dataset.openWatch.split(':');
        if (parts[0] === 'tv' && parts.length >= 4) {
          navigate('watch', {
            type: 'tv',
            id: Number(parts[1]),
            season: Number(parts[2]),
            episode: Number(parts[3]),
          });
        } else {
          navigate('watch', { type: parts[0], id: Number(parts[1]), season: 1, episode: 1 });
        }
      };
    });
    $$('[data-nav]', root).forEach((el) => {
      if (el.classList.contains('tab') || el.classList.contains('brand')) return;
      el.onclick = () => navigate(el.dataset.nav);
    });
  }

  // -- Global UI events -------------------------------------
  function bindChrome() {
    $$('.tab, .brand').forEach((el) => {
      el.addEventListener('click', () => {
        const nav = el.dataset.nav;
        if (nav) navigate(nav);
      });
    });

    $('#btn-search').onclick = () => {
      searchOpen = true;
      $('#search-sheet').hidden = false;
      $('#search-input').value = '';
      $('#search-results').innerHTML = '';
      $('#search-input').focus();
    };

    $('#search-close').onclick = () => {
      searchOpen = false;
      $('#search-sheet').hidden = true;
    };

    $('#search-form').onsubmit = (e) => {
      e.preventDefault();
      const q = $('#search-input').value.trim();
      if (!q) return;
      searchOpen = false;
      $('#search-sheet').hidden = true;
      navigate('search', { q });
    };

    let searchTimer;
    $('#search-input').addEventListener('input', () => {
      clearTimeout(searchTimer);
      const q = $('#search-input').value.trim();
      if (q.length < 2) {
        $('#search-results').innerHTML = '';
        return;
      }
      searchTimer = setTimeout(async () => {
        try {
          const data = await tmdb('/search/multi', { query: q, include_adult: 'false' });
          const items = (data.results || [])
            .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
            .slice(0, 18)
            .map((r) => mapItem(r, r.media_type === 'tv' ? 'tv' : 'movie'));
          $('#search-results').innerHTML = items.map((i) => cardHtml(i)).join('');
          bindOpenButtons($('#search-results'));
        } catch {
          /* ignore live search errors */
        }
      }, 320);
    });
  }

  // Inject tab / search icons once DOM is ready
  function injectChromeIcons() {
    const searchBtn = $('#btn-search');
    if (searchBtn) searchBtn.innerHTML = ICONS.search;

    const iconMap = {
      home: ICONS.home,
      movies: ICONS.film,
      tv: ICONS.tv,
      surprise: ICONS.spark,
      list: ICONS.list,
    };
    $$('.tab').forEach((tab) => {
      const nav = tab.dataset.nav;
      const iconWrap = tab.querySelector('.tab-icon');
      if (iconWrap && iconMap[nav]) iconWrap.innerHTML = iconMap[nav];
    });
  }

  // -- Boot -------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    injectChromeIcons();
    ensurePlayerDom();
    bindChrome();
    bootstrapNotifications();
    navigate('home');
  });
})();
