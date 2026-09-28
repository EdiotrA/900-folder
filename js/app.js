// ==========================================================================
// PlayVault Arcade — Gaming Platform Front-End Controller
// Complete Implementation: Auth, Games, Admin, Moderation, Favorites & Reports
// ==========================================================================

(function () {
  'use strict';

  // Platform Global State
  const state = {
    user: null,
    adminSession: false,
    categories: [],
    allGames: [],
    favorites: new Set(),
    recentGames: [],
    activeCategory: 'all',
    searchQuery: '',
    sortBy: 'popular',
    currentGame: null,
    currentView: 'home',
    adminTab: 'overview',
    adminUsersPage: 1,
    adminUsersFilter: 'all',
    adminUsersSearch: '',
  };

  // DOM Elements
  const platformRoot = document.getElementById('platformRoot');
  const mainContent = document.getElementById('mainContent');
  const navAuthBtn = document.getElementById('navAuthBtn');
  const navUserBadge = document.getElementById('navUserBadge');
  const navUserAvatar = document.getElementById('navUserAvatar');
  const navUserName = document.getElementById('navUserName');
  const navAdminLink = document.getElementById('navAdminLink');
  const mobileToggle = document.getElementById('mobileToggle');
  const navLinks = document.getElementById('navLinks');
  const lockQuickBtn = document.getElementById('lockQuickBtn');

  // Modals
  const adminLoginModal = document.getElementById('adminLoginModal');
  const banUserModal = document.getElementById('banUserModal');
  const unbanUserModal = document.getElementById('unbanUserModal');
  const reportGameModal = document.getElementById('reportGameModal');
  const gameModal = document.getElementById('gameModal');
  const categoryModal = document.getElementById('categoryModal');
  const authModal = document.getElementById('authModal');

  // ==========================================================================
  // Toast Notifications
  // ==========================================================================
  function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ==========================================================================
  // API Fetch Helpers
  // ==========================================================================
  async function api(endpoint, options = {}) {
    try {
      const res = await fetch(endpoint, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Request failed with status ${res.status}`);
      }
      return data;
    } catch (err) {
      console.warn(`API Error [${endpoint}]:`, err.message);
      throw err;
    }
  }

  // ==========================================================================
  // Authentication & Session
  // ==========================================================================
  async function checkAuth() {
    try {
      const data = await api('/api/auth/me');
      state.user = data.user;
      state.adminSession = !!data.adminSession;
      updateNavAuth();
      if (state.user) {
        await loadFavorites();
        await loadRecentlyPlayed();
      }
    } catch (err) {
      if (err.message && err.message.includes('banned')) {
        showToast(err.message, 'error');
      }
      state.user = null;
      state.adminSession = false;
      updateNavAuth();
    }
  }

  function updateNavAuth() {
    if (state.user) {
      navAuthBtn?.classList.add('hidden');
      navUserBadge?.classList.remove('hidden');
      if (navUserAvatar) navUserAvatar.src = state.user.avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=user';
      if (navUserName) navUserName.textContent = state.user.displayName || 'Gamer';
    } else {
      navAuthBtn?.classList.remove('hidden');
      navUserBadge?.classList.add('hidden');
    }

    if (state.adminSession) {
      navAdminLink?.classList.remove('hidden');
    } else {
      navAdminLink?.classList.add('hidden');
    }
  }

  // ==========================================================================
  // Data Loading
  // ==========================================================================
  async function loadInitialData() {
    try {
      const [catsRes, gamesRes] = await Promise.all([
        api('/api/categories'),
        api('/api/games?limit=300'),
      ]);
      state.categories = catsRes.categories || [];
      state.allGames = gamesRes.games || [];
    } catch (err) {
      showToast('Error loading game catalog', 'error');
    }
  }

  async function loadFavorites() {
    if (!state.user) return;
    try {
      const res = await api('/api/me/favorites');
      state.favorites = new Set((res.games || []).map((g) => g.id));
    } catch (_) {}
  }

  async function loadRecentlyPlayed() {
    if (!state.user) return;
    try {
      const res = await api('/api/me/recent');
      state.recentGames = res.games || [];
    } catch (_) {}
  }

  // ==========================================================================
  // Router & Navigation
  // ==========================================================================
  function handleRoute() {
    const hash = window.location.hash || '#home';
    const [path, param] = hash.replace('#', '').split('/');

    // Update active nav link
    document.querySelectorAll('.nav-links a').forEach((a) => {
      const href = a.getAttribute('href')?.replace('#', '');
      a.classList.toggle('active', href === path);
    });

    if (navLinks?.classList.contains('mobile-open')) {
      navLinks.classList.remove('mobile-open');
    }

    if (path === 'game' && param) {
      renderGamePage(param);
    } else if (path === 'account') {
      renderAccountPage();
    } else if (path === 'favorites') {
      renderFavoritesPage();
    } else if (path === 'admin') {
      renderAdminPage();
    } else if (path === 'popular') {
      state.sortBy = 'popular';
      renderHomePage(true);
    } else if (path === 'categories') {
      renderHomePage();
      document.getElementById('categoriesSection')?.scrollIntoView({ behavior: 'smooth' });
    } else if (path === 'games') {
      renderHomePage();
      document.getElementById('allGamesSection')?.scrollIntoView({ behavior: 'smooth' });
    } else {
      renderHomePage();
    }
  }

  // ==========================================================================
  // 1. HOMEPAGE RENDERING (Requirement 16)
  // ==========================================================================
  function renderHomePage(scrollToGrid = false) {
    state.currentView = 'home';
    const featured = state.allGames.filter((g) => g.featured).slice(0, 8);
    const popular = [...state.allGames].sort((a, b) => b.playCount - a.playCount).slice(0, 8);
    const recent = [...state.allGames].slice(0, 8);

    // Pick top highlighted featured title (Bonk.io prioritized)
    const bonkGame = state.allGames.find((g) => g.slug === 'bonk-io-local') || featured[0] || state.allGames[0];

    mainContent.innerHTML = `
      <div class="container">
        <!-- Hero Section -->
        <section class="hero">
          <div class="hero-content">
            <div class="hero-pill">⚡ Curated Arcade 2026</div>
            <h1>Instant Web Gaming. <span>Pure &amp; Unlocked.</span></h1>
            <p>Over 200+ high-performance browser games curated for immediate play. Zero installation, ad-shielded embeds, and fullscreen ready.</p>
            <div class="hero-actions">
              <a href="#games" class="btn btn-primary">Browse All Games</a>
              <a href="#popular" class="btn btn-secondary">Popular Right Now</a>
            </div>
          </div>
          ${
            bonkGame
              ? `
          <div class="hero-featured-card">
            <div class="featured-preview-box">
              <img src="${escapeHtml(bonkGame.thumbnail)}" alt="${escapeHtml(bonkGame.title)}" onerror="this.src='https://images.crazygames.com/bonk-io/cover/600x600.webp'">
              <div class="featured-overlay">
                <span class="badge badge-featured">Spotlight Game</span>
                <h3>${escapeHtml(bonkGame.title)}</h3>
                <p>${escapeHtml(bonkGame.description)}</p>
              </div>
            </div>
            <div class="featured-card-footer">
              <span class="badge badge-cat">${escapeHtml(bonkGame.category || 'Multiplayer')}</span>
              <a href="#game/${bonkGame.slug}" class="btn btn-accent btn-sm">▶ Play Now</a>
            </div>
          </div>
          `
              : ''
          }
        </section>

        <!-- 1. Featured Games -->
        <section class="section featured">
          <div class="section-header">
            <div class="section-title-group">
              <h2 class="section-title">⭐ Featured Games</h2>
              <p class="section-subtitle">Editor-picked titles with top multiplayer &amp; action experiences</p>
            </div>
          </div>
          <div class="game-grid">
            ${featured.map((g) => renderGameCard(g, 'Featured')).join('')}
          </div>
        </section>

        <!-- 2. Popular Right Now -->
        <section class="section popular" id="popularSection">
          <div class="section-header">
            <div class="section-title-group">
              <h2 class="section-title">🔥 Popular Right Now</h2>
              <p class="section-subtitle">Most played by our community this week</p>
            </div>
          </div>
          <div class="game-grid">
            ${popular.map((g) => renderGameCard(g)).join('')}
          </div>
        </section>

        <!-- 3. Recently Added -->
        <section class="section recent">
          <div class="section-header">
            <div class="section-title-group">
              <h2 class="section-title">✨ Recently Added</h2>
              <p class="section-subtitle">Fresh additions to our growing 200+ game catalog</p>
            </div>
          </div>
          <div class="game-grid">
            ${recent.map((g) => renderGameCard(g, 'New')).join('')}
          </div>
        </section>

        <!-- 4. Browse by Category -->
        <section class="section categories-section" id="categoriesSection">
          <div class="section-header">
            <div class="section-title-group">
              <h2 class="section-title">📁 Browse by Category</h2>
              <p class="section-subtitle">Filter the arcade by your favorite genre</p>
            </div>
          </div>
          <div class="category-grid">
            <div class="category-card ${state.activeCategory === 'all' ? 'active' : ''}" data-cat="all">
              <span class="cat-icon">🎮</span>
              <span class="cat-name">All Games</span>
            </div>
            ${state.categories
              .map(
                (c) => `
              <div class="category-card ${state.activeCategory === c.slug ? 'active' : ''}" data-cat="${c.slug}">
                <span class="cat-icon">${getCategoryIcon(c.slug)}</span>
                <span class="cat-name">${escapeHtml(c.name)}</span>
              </div>
            `
              )
              .join('')}
          </div>
        </section>

        <!-- 5. More Games Grid -->
        <section class="section" id="allGamesSection">
          <div class="section-header">
            <div class="section-title-group">
              <h2 class="section-title">🕹️ Full Game Vault</h2>
              <p class="section-subtitle">Explore 200+ legitimate HTML5 titles</p>
            </div>
          </div>

          <div class="filter-bar">
            <div class="search-box">
              <span class="search-icon">🔍</span>
              <input type="text" id="gameSearchInput" placeholder="Search games by title, tags, developer..." value="${escapeHtml(state.searchQuery)}">
            </div>
            <select class="sort-select" id="sortSelect">
              <option value="popular" ${state.sortBy === 'popular' ? 'selected' : ''}>Sort: Most Popular</option>
              <option value="newest" ${state.sortBy === 'newest' ? 'selected' : ''}>Sort: Recently Added</option>
              <option value="az" ${state.sortBy === 'az' ? 'selected' : ''}>Sort: Alphabetical (A-Z)</option>
            </select>
          </div>

          <div class="game-grid" id="mainGameGrid">
            ${renderFilteredGameGrid()}
          </div>
        </section>
      </div>
    `;

    bindHomeEvents();
    if (scrollToGrid) {
      document.getElementById('popularSection')?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  function getCategoryIcon(slug) {
    const icons = {
      action: '⚔️',
      adventure: '🗺️',
      arcade: '👾',
      puzzle: '🧩',
      racing: '🏎️',
      sports: '⚽',
      strategy: '🏰',
      multiplayer: '👥',
      casual: '☕',
      platformer: '🏃',
    };
    return icons[slug] || '🎲';
  }

  // ==========================================================================
  // 2. GAME CARDS (Requirement 17)
  // ==========================================================================
  function renderGameCard(game, badgeText = null) {
    const isFav = state.favorites.has(game.id);
    const plays = (game.playCount || 0) + (game.playsOffset || 0);

    return `
      <div class="game-card" data-slug="${escapeHtml(game.slug)}">
        <div class="card-thumb-wrap">
          <img src="${escapeHtml(game.thumbnail)}" alt="${escapeHtml(game.title)}" loading="lazy" onerror="this.src='https://images.crazygames.com/${escapeHtml(game.slug)}/cover/600x600.webp'">
          ${badgeText ? `<span class="badge ${badgeText === 'Featured' ? 'badge-featured' : 'badge-new'} card-badge-top">${badgeText}</span>` : ''}
          <button class="card-fav-btn ${isFav ? 'favorited' : ''}" data-game-id="${escapeHtml(game.id)}" title="${isFav ? 'Remove Favorite' : 'Add to Favorites'}">
            ♥
          </button>
          <div class="card-overlay-actions">
            <a href="#game/${escapeHtml(game.slug)}" class="btn btn-primary btn-sm btn-block">Play Now</a>
          </div>
        </div>
        <div class="card-body">
          <h3 class="card-title" title="${escapeHtml(game.title)}">${escapeHtml(game.title)}</h3>
          <div class="card-meta">
            <span class="badge badge-cat">${escapeHtml(game.category || 'Arcade')}</span>
            <span class="card-play-count">👁️ ${plays}</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderFilteredGameGrid() {
    let filtered = [...state.allGames];

    if (state.activeCategory !== 'all') {
      filtered = filtered.filter((g) => g.tags?.includes(state.activeCategory) || g.category?.toLowerCase() === state.activeCategory);
    }

    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      filtered = filtered.filter((g) => g.title.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q));
    }

    if (state.sortBy === 'popular') {
      filtered.sort((a, b) => b.playCount - a.playCount);
    } else if (state.sortBy === 'newest') {
      filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    } else if (state.sortBy === 'az') {
      filtered.sort((a, b) => a.title.localeCompare(b.title));
    }

    if (filtered.length === 0) {
      return `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <h3>No games matched your search</h3>
          <p>Try searching for a different keyword or choosing another category.</p>
        </div>
      `;
    }

    return filtered.map((g) => renderGameCard(g)).join('');
  }

  function bindHomeEvents() {
    // Search input with debounce
    const searchInput = document.getElementById('gameSearchInput');
    let timer;
    searchInput?.addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.searchQuery = e.target.value.trim();
        const grid = document.getElementById('mainGameGrid');
        if (grid) grid.innerHTML = renderFilteredGameGrid();
      }, 250);
    });

    // Sort select
    const sortSelect = document.getElementById('sortSelect');
    sortSelect?.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      const grid = document.getElementById('mainGameGrid');
      if (grid) grid.innerHTML = renderFilteredGameGrid();
    });

    // Category card clicks
    document.querySelectorAll('.category-card').forEach((card) => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.category-card').forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        state.activeCategory = card.getAttribute('data-cat') || 'all';
        const grid = document.getElementById('mainGameGrid');
        if (grid) grid.innerHTML = renderFilteredGameGrid();
        document.getElementById('allGamesSection')?.scrollIntoView({ behavior: 'smooth' });
      });
    });

    // Card favorite clicks (delegated)
    bindFavoriteClicks();
  }

  function bindFavoriteClicks() {
    document.querySelectorAll('.card-fav-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const gameId = btn.getAttribute('data-game-id');
        await toggleFavorite(gameId, btn);
      });
    });
  }

  async function toggleFavorite(gameId, btnElem = null) {
    if (!state.user) {
      showToast('Please sign in with Google to save favorites', 'info');
      openAuthModal();
      return;
    }

    const isFav = state.favorites.has(gameId);
    try {
      if (isFav) {
        await api(`/api/me/favorites/${gameId}`, { method: 'DELETE' });
        state.favorites.delete(gameId);
        showToast('Removed from favorites', 'info');
        if (btnElem) btnElem.classList.remove('favorited');
      } else {
        await api(`/api/me/favorites/${gameId}`, { method: 'POST' });
        state.favorites.add(gameId);
        showToast('Added to favorites!', 'success');
        if (btnElem) btnElem.classList.add('favorited');
      }
    } catch (err) {
      showToast(err.message || 'Error updating favorites', 'error');
    }
  }

  // ==========================================================================
  // 3. INDIVIDUAL GAME PAGE (Requirement 18, 36)
  // ==========================================================================
  async function renderGamePage(slug) {
    state.currentView = 'game';
    mainContent.innerHTML = `
      <div class="game-view-container">
        <div class="empty-state"><p>Loading game details...</p></div>
      </div>
    `;

    try {
      const data = await api(`/api/games/${slug}`);
      const game = data.game;
      state.currentGame = game;

      // Track play count and recently played if authenticated
      if (state.user) {
        api(`/api/games/${slug}/play`, { method: 'POST' }).catch(() => {});
      }

      const isFav = state.favorites.has(game.id);
      const related = state.allGames
        .filter((g) => g.categoryId === game.categoryId && g.id !== game.id)
        .slice(0, 4);

      mainContent.innerHTML = `
        <div class="game-view-container">
          <!-- Game Player Area -->
          <div class="game-player-wrapper" id="gamePlayerWrapper">
            <iframe
              id="activeGameIframe"
              src="${escapeHtml(game.embedUrl)}"
              title="${escapeHtml(game.title)}"
              allow="autoplay; fullscreen; gamepad; focus-without-user-activation; keyboard-map"
              sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-downloads allow-modals"
              tabindex="0"
            ></iframe>
          </div>

          <!-- Game Toolbar -->
          <div class="game-toolbar">
            <div class="game-title-group">
              <h1>${escapeHtml(game.title)}</h1>
              <div class="game-tags-list">
                <span class="badge badge-cat">${escapeHtml(game.category || 'Arcade')}</span>
                <span class="card-play-count">👁️ ${game.playCount || 1} plays</span>
                ${game.developer ? `<span class="card-play-count">By ${escapeHtml(game.developer)}</span>` : ''}
              </div>
            </div>
            <div class="game-actions-group">
              <button id="gameFavBtn" class="btn ${isFav ? 'btn-danger' : 'btn-secondary'} btn-sm">
                ${isFav ? '♥ Favorited' : '♡ Add Favorite'}
              </button>
              <button id="gameFullscreenBtn" class="btn btn-primary btn-sm">
                ⛶ Fullscreen
              </button>
              <button id="gameReportBtn" class="btn btn-secondary btn-sm">
                🚩 Report Problem
              </button>
              <a href="#games" class="btn btn-secondary btn-sm">← Back to Vault</a>
            </div>
          </div>

          <!-- Game Details & Controls -->
          <div class="game-details-grid">
            <div class="game-info-card">
              <h2>About ${escapeHtml(game.title)}</h2>
              <p>${escapeHtml(game.description || 'Enjoy playing this browser game online. No downloads required.')}</p>
              
              <div class="controls-box">
                <h3>🎮 How to Play &amp; Controls</h3>
                <ul>
                  <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>Arrow Keys</kbd> — Navigation &amp; Movement</li>
                  <li><kbd>Space</kbd> or <kbd>Left Click</kbd> — Primary Action / Jump / Fire</li>
                  <li><kbd>P</kbd> or <kbd>Esc</kbd> — Pause / Game Menu</li>
                </ul>
              </div>
            </div>

            <div class="game-info-card">
              <h2>Safe Arcade Play</h2>
              <p>This title is running in a sandbox environment that isolates advertisements and prevents rogue redirects to outside domains.</p>
              <button class="btn btn-secondary btn-block btn-sm" onclick="window.lockPlayVault()">
                🔒 Quick Classroom Lock
              </button>
            </div>
          </div>

          <!-- Related Games -->
          ${
            related.length > 0
              ? `
          <section class="section">
            <div class="section-header">
              <h2 class="section-title">More in ${escapeHtml(game.category || 'this category')}</h2>
            </div>
            <div class="game-grid">
              ${related.map((g) => renderGameCard(g)).join('')}
            </div>
          </section>
          `
              : ''
          }
        </div>
      `;

      // Fullscreen handler
      document.getElementById('gameFullscreenBtn')?.addEventListener('click', () => {
        const wrapper = document.getElementById('gamePlayerWrapper');
        if (!document.fullscreenElement) {
          wrapper?.requestFullscreen?.();
        } else {
          document.exitFullscreen?.();
        }
      });

      // Favorite button
      document.getElementById('gameFavBtn')?.addEventListener('click', async () => {
        await toggleFavorite(game.id);
        const favBtn = document.getElementById('gameFavBtn');
        const nowFav = state.favorites.has(game.id);
        if (favBtn) {
          favBtn.className = `btn ${nowFav ? 'btn-danger' : 'btn-secondary'} btn-sm`;
          favBtn.textContent = nowFav ? '♥ Favorited' : '♡ Add Favorite';
        }
      });

      // Report button (Requirement 36)
      document.getElementById('gameReportBtn')?.addEventListener('click', () => {
        openReportModal(game);
      });

      bindFavoriteClicks();
    } catch (err) {
      mainContent.innerHTML = `
        <div class="container">
          <div class="empty-state">
            <h3>Game not found</h3>
            <p>The game you requested is unavailable or has been unpublished.</p>
            <br>
            <a href="#games" class="btn btn-primary">Return to Catalog</a>
          </div>
        </div>
      `;
    }
  }

  // ==========================================================================
  // 4. USER ACCOUNT AREA (Requirement 19, 20, 21, 27)
  // ==========================================================================
  async function renderAccountPage() {
    state.currentView = 'account';

    if (!state.user) {
      mainContent.innerHTML = `
        <div class="account-container">
          <div class="account-header-card" style="grid-template-columns: 1fr; text-align: center;">
            <div class="account-info-group">
              <h2>Player Account</h2>
              <p>Sign in with your Google account to save your favorite games and sync your recently played games across devices.</p>
              <br>
              <button class="btn btn-primary" onclick="window.openAuthModal()">Sign in with Google</button>
            </div>
          </div>
        </div>
      `;
      return;
    }

    await loadFavorites();
    await loadRecentlyPlayed();

    const favGames = state.allGames.filter((g) => state.favorites.has(g.id));
    const isBanned = state.user.banned;

    mainContent.innerHTML = `
      <div class="account-container">
        ${
          isBanned
            ? `
        <div class="banned-alert">
          <h3>⚠️ Account Restriction Notice</h3>
          <p><strong>Reason:</strong> ${escapeHtml(state.user.banReason || 'Policy violation')}</p>
          <p><strong>Duration:</strong> ${escapeHtml(state.user.banUntil || 'Permanent')}</p>
          <p style="margin-top: 0.5rem; font-size: 0.85rem; color: #fca5a5;">If you believe this action was made in error, contact the platform administrator.</p>
        </div>
        `
            : ''
        }

        <div class="account-header-card">
          <img class="account-avatar-large" src="${escapeHtml(state.user.avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=user')}" alt="User Avatar">
          <div class="account-info-group">
            <h2>${escapeHtml(state.user.displayName)}</h2>
            <p>${escapeHtml(state.user.email)}</p>
            <div class="account-meta-pills">
              <span class="badge ${state.user.role === 'admin' ? 'badge-featured' : 'badge-cat'}">Role: ${escapeHtml(state.user.role)}</span>
              <span class="badge badge-cat">Member since: ${new Date(state.user.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
          <div>
            <button id="accountSignOutBtn" class="btn btn-secondary btn-sm">Sign Out</button>
          </div>
        </div>

        <div class="account-tabs">
          <button class="account-tab-btn active" id="tabFavoritesBtn">My Favorites (${favGames.length})</button>
          <button class="account-tab-btn" id="tabRecentBtn">Recently Played (${state.recentGames.length})</button>
        </div>

        <div id="accountTabContent">
          ${renderFavoritesGrid(favGames)}
        </div>
      </div>
    `;

    document.getElementById('accountSignOutBtn')?.addEventListener('click', handleSignOut);

    const tabFav = document.getElementById('tabFavoritesBtn');
    const tabRecent = document.getElementById('tabRecentBtn');
    const tabContent = document.getElementById('accountTabContent');

    tabFav?.addEventListener('click', () => {
      tabFav.classList.add('active');
      tabRecent?.classList.remove('active');
      if (tabContent) tabContent.innerHTML = renderFavoritesGrid(favGames);
      bindFavoriteClicks();
    });

    tabRecent?.addEventListener('click', () => {
      tabRecent.classList.add('active');
      tabFav?.classList.remove('active');
      if (tabContent) tabContent.innerHTML = renderRecentlyPlayedGrid(state.recentGames);
      bindFavoriteClicks();
    });

    bindFavoriteClicks();
  }

  function renderFavoritesGrid(games) {
    if (games.length === 0) {
      return `
        <div class="empty-state">
          <h3>No Favorites Yet</h3>
          <p>Games you favorite will appear here for easy access.</p>
          <br>
          <a href="#games" class="btn btn-secondary btn-sm">Browse Games</a>
        </div>
      `;
    }
    return `
      <div class="game-grid">
        ${games.map((g) => renderGameCard(g)).join('')}
      </div>
    `;
  }

  function renderRecentlyPlayedGrid(games) {
    if (games.length === 0) {
      return `
        <div class="empty-state">
          <h3>No Recently Played Games</h3>
          <p>Games you play while signed in will automatically appear here.</p>
        </div>
      `;
    }
    return `
      <div class="game-grid">
        ${games.map((g) => renderGameCard(g)).join('')}
      </div>
    `;
  }

  function renderFavoritesPage() {
    state.currentView = 'favorites';
    if (!state.user) {
      renderAccountPage();
      return;
    }
    const favGames = state.allGames.filter((g) => state.favorites.has(g.id));
    mainContent.innerHTML = `
      <div class="container">
        <div class="section-header">
          <div class="section-title-group">
            <h2 class="section-title">♥ Your Favorite Games</h2>
            <p class="section-subtitle">Quickly launch titles you have saved</p>
          </div>
        </div>
        ${renderFavoritesGrid(favGames)}
      </div>
    `;
    bindFavoriteClicks();
  }

  // ==========================================================================
  // 5. ADMIN DASHBOARD (Requirements 22 to 26, 37)
  // Distinct Professional Dashboard Layout
  // ==========================================================================
  async function renderAdminPage() {
    state.currentView = 'admin';

    // Must have active admin verification on server session
    if (!state.adminSession) {
      openAdminLoginModal();
      return;
    }

    mainContent.innerHTML = `
      <div class="admin-shell">
        <!-- Professional Admin Sidebar -->
        <aside class="admin-sidebar">
          <div class="admin-sidebar-nav">
            <div class="admin-sidebar-title">Admin Management</div>
            <button class="admin-nav-item ${state.adminTab === 'overview' ? 'active' : ''}" data-admin-tab="overview">📊 Overview</button>
            <button class="admin-nav-item ${state.adminTab === 'users' ? 'active' : ''}" data-admin-tab="users">👥 User Moderation</button>
            <button class="admin-nav-item ${state.adminTab === 'bans' ? 'active' : ''}" data-admin-tab="bans">🚫 Active Bans</button>
            <button class="admin-nav-item ${state.adminTab === 'games' ? 'active' : ''}" data-admin-tab="games">🎮 Game Vault</button>
            <button class="admin-nav-item ${state.adminTab === 'categories' ? 'active' : ''}" data-admin-tab="categories">📁 Categories</button>
            <button class="admin-nav-item ${state.adminTab === 'reports' ? 'active' : ''}" data-admin-tab="reports">🚩 Bug Reports</button>
            <button class="admin-nav-item ${state.adminTab === 'logs' ? 'active' : ''}" data-admin-tab="logs">📜 Audit Logs</button>
          </div>
          <div>
            <button id="adminLogoutBtn" class="btn btn-danger btn-block btn-sm">Exit Admin Session</button>
          </div>
        </aside>

        <!-- Admin Workspace Area -->
        <main class="admin-main" id="adminMainArea">
          <p>Loading dashboard data...</p>
        </main>
      </div>
    `;

    document.getElementById('adminLogoutBtn')?.addEventListener('click', handleAdminLogout);

    document.querySelectorAll('[data-admin-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-admin-tab]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.adminTab = btn.getAttribute('data-admin-tab') || 'overview';
        loadAdminTabContent();
      });
    });

    loadAdminTabContent();
  }

  async function loadAdminTabContent() {
    const area = document.getElementById('adminMainArea');
    if (!area) return;

    if (state.adminTab === 'overview') {
      await renderAdminOverview(area);
    } else if (state.adminTab === 'users') {
      await renderAdminUsers(area);
    } else if (state.adminTab === 'bans') {
      state.adminUsersFilter = 'banned';
      await renderAdminUsers(area);
    } else if (state.adminTab === 'games') {
      await renderAdminGames(area);
    } else if (state.adminTab === 'categories') {
      await renderAdminCategories(area);
    } else if (state.adminTab === 'reports') {
      await renderAdminReports(area);
    } else if (state.adminTab === 'logs') {
      await renderAdminLogs(area);
    }
  }

  async function renderAdminOverview(area) {
    try {
      const data = await api('/api/admin/overview');
      const s = data.stats || {};

      area.innerHTML = `
        <div class="admin-top-bar">
          <h1>Platform Administration</h1>
          <span class="status-badge status-active">Protected Session Active</span>
        </div>

        <div class="admin-stats-grid">
          <div class="admin-stat-card">
            <div class="admin-stat-label">Total Users</div>
            <div class="admin-stat-value">${s.totalUsers || 0}</div>
          </div>
          <div class="admin-stat-card">
            <div class="admin-stat-label">Active Users (7 Days)</div>
            <div class="admin-stat-value">${s.activeUsers || 0}</div>
          </div>
          <div class="admin-stat-card">
            <div class="admin-stat-label">Total Games in Vault</div>
            <div class="admin-stat-value">${s.totalGames || 0}</div>
          </div>
          <div class="admin-stat-card">
            <div class="admin-stat-label">Banned Users</div>
            <div class="admin-stat-value" style="color: #ef4444;">${s.bannedUsers || 0}</div>
          </div>
          <div class="admin-stat-card">
            <div class="admin-stat-label">Open Bug Reports</div>
            <div class="admin-stat-value" style="color: #f59e0b;">${s.openReports || 0}</div>
          </div>
        </div>

        <div class="admin-panel-card">
          <h2>Quick Actions</h2>
          <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
            <button class="btn btn-primary btn-sm" onclick="window.openAddGameModal()">+ Add New Game</button>
            <button class="btn btn-secondary btn-sm" onclick="window.openAddCategoryModal()">+ Add Category</button>
            <a href="#reports" class="btn btn-secondary btn-sm" onclick="document.querySelector('[data-admin-tab=reports]').click()">View Reports (${s.openReports || 0})</a>
          </div>
        </div>
      `;
    } catch (err) {
      area.innerHTML = `<div class="empty-state">Error loading overview: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function renderAdminUsers(area) {
    try {
      const q = encodeURIComponent(state.adminUsersSearch || '');
      const filter = state.adminUsersFilter || 'all';
      const page = state.adminUsersPage || 1;
      const res = await api(`/api/admin/users?q=${q}&status=${filter}&page=${page}&pageSize=15`);
      const users = res.users || [];
      const total = res.total || 0;

      area.innerHTML = `
        <div class="admin-top-bar">
          <h1>User Management &amp; Moderation</h1>
          <div style="display: flex; gap: 0.5rem;">
            <input type="text" id="adminUserSearchInput" class="form-control" placeholder="Search name or email..." value="${escapeHtml(state.adminUsersSearch)}" style="width: 220px; font-size: 0.85rem;">
            <select id="adminUserStatusFilter" class="form-control" style="width: 140px; font-size: 0.85rem;">
              <option value="all" ${filter === 'all' ? 'selected' : ''}>All Status</option>
              <option value="active" ${filter === 'active' ? 'selected' : ''}>Active</option>
              <option value="banned" ${filter === 'banned' ? 'selected' : ''}>Banned</option>
            </select>
          </div>
        </div>

        <div class="admin-panel-card">
          <div class="admin-table-wrapper">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Profile</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Last Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${
                  users.length === 0
                    ? `<tr><td colspan="7" style="text-align:center; padding: 2rem;">No users found.</td></tr>`
                    : users
                        .map(
                          (u) => `
                    <tr>
                      <td><img src="${escapeHtml(u.avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=user')}" width="32" height="32" style="border-radius:50%; object-fit:cover;"></td>
                      <td><strong>${escapeHtml(u.displayName)}</strong></td>
                      <td>${escapeHtml(u.email)}</td>
                      <td>
                        <span class="status-badge ${u.banned ? 'status-banned' : 'status-active'}">
                          ${u.banned ? 'Banned' : 'Active'}
                        </span>
                      </td>
                      <td>${new Date(u.createdAt).toLocaleDateString()}</td>
                      <td>${u.lastActive ? new Date(u.lastActive).toLocaleDateString() : 'Never'}</td>
                      <td>
                        <div style="display:flex; gap:0.4rem;">
                          ${
                            u.banned
                              ? `<button class="btn btn-sm btn-secondary unban-btn" data-user-id="${u.id}" data-user-name="${escapeHtml(u.displayName)}">Unban</button>`
                              : `<button class="btn btn-sm btn-danger ban-btn" data-user-id="${u.id}" data-user-name="${escapeHtml(u.displayName)}">Ban</button>`
                          }
                        </div>
                      </td>
                    </tr>
                  `
                        )
                        .join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      `;

      // Search & Filter listeners
      document.getElementById('adminUserSearchInput')?.addEventListener('change', (e) => {
        state.adminUsersSearch = e.target.value.trim();
        state.adminUsersPage = 1;
        renderAdminUsers(area);
      });

      document.getElementById('adminUserStatusFilter')?.addEventListener('change', (e) => {
        state.adminUsersFilter = e.target.value;
        state.adminUsersPage = 1;
        renderAdminUsers(area);
      });

      // Ban button clicks (Requirement 24)
      document.querySelectorAll('.ban-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const uid = btn.getAttribute('data-user-id');
          const name = btn.getAttribute('data-user-name');
          openBanModal(uid, name);
        });
      });

      // Unban button clicks
      document.querySelectorAll('.unban-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const uid = btn.getAttribute('data-user-id');
          const name = btn.getAttribute('data-user-name');
          openUnbanModal(uid, name);
        });
      });
    } catch (err) {
      area.innerHTML = `<div class="empty-state">Error loading users: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function renderAdminGames(area) {
    try {
      const res = await api('/api/admin/games');
      const games = res.games || [];

      area.innerHTML = `
        <div class="admin-top-bar">
          <h1>Game Vault Catalog (${games.length})</h1>
          <button class="btn btn-primary btn-sm" onclick="window.openAddGameModal()">+ Add New Game</button>
        </div>

        <div class="admin-panel-card">
          <div class="admin-table-wrapper">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Thumb</th>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Featured</th>
                  <th>Plays</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${games
                  .slice(0, 50)
                  .map(
                    (g) => `
                  <tr>
                    <td><img src="${escapeHtml(g.thumbnail)}" width="38" height="24" style="object-fit:cover; border-radius:4px;" onerror="this.src='https://images.crazygames.com/${escapeHtml(g.slug)}/cover/600x600.webp'"></td>
                    <td><strong>${escapeHtml(g.title)}</strong></td>
                    <td>${escapeHtml(g.category || 'Arcade')}</td>
                    <td>${g.featured ? '⭐ Yes' : 'No'}</td>
                    <td>${g.playCount || 0}</td>
                    <td>
                      <div style="display:flex; gap:0.4rem;">
                        <button class="btn btn-sm btn-secondary edit-game-btn" data-game='${JSON.stringify(g)}'>Edit</button>
                        <button class="btn btn-sm btn-danger delete-game-btn" data-game-id="${g.id}">Delete</button>
                      </div>
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
          ${games.length > 50 ? `<p style="margin-top: 1rem; color: #64748b; font-size: 0.85rem;">Showing first 50 games. Use search for more.</p>` : ''}
        </div>
      `;

      document.querySelectorAll('.delete-game-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Are you sure you want to delete this game?')) return;
          const id = btn.getAttribute('data-game-id');
          try {
            await api(`/api/admin/games/${id}`, { method: 'DELETE' });
            showToast('Game deleted', 'info');
            await loadInitialData();
            renderAdminGames(area);
          } catch (e) {
            showToast(e.message, 'error');
          }
        });
      });

      document.querySelectorAll('.edit-game-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const game = JSON.parse(btn.getAttribute('data-game'));
          window.openEditGameModal(game);
        });
      });
    } catch (err) {
      area.innerHTML = `<div class="empty-state">Error loading games: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function renderAdminCategories(area) {
    try {
      const res = await api('/api/admin/categories');
      const cats = res.categories || [];

      area.innerHTML = `
        <div class="admin-top-bar">
          <h1>Game Categories</h1>
          <button class="btn btn-primary btn-sm" onclick="window.openAddCategoryModal()">+ Add Category</button>
        </div>

        <div class="admin-panel-card">
          <div class="admin-table-wrapper">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Hidden</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${cats
                  .map(
                    (c) => `
                  <tr>
                    <td><strong>${escapeHtml(c.name)}</strong></td>
                    <td><code>${escapeHtml(c.slug)}</code></td>
                    <td>${c.hidden ? 'Hidden' : 'Visible'}</td>
                    <td>
                      <div style="display:flex; gap:0.4rem;">
                        <button class="btn btn-sm btn-secondary toggle-hide-cat" data-id="${c.id}" data-hidden="${c.hidden}">
                          ${c.hidden ? 'Unhide' : 'Hide'}
                        </button>
                        <button class="btn btn-sm btn-danger delete-cat-btn" data-id="${c.id}">Delete</button>
                      </div>
                    </td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      document.querySelectorAll('.toggle-hide-cat').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const hidden = btn.getAttribute('data-hidden') === '1';
          try {
            await api(`/api/admin/categories/${id}`, {
              method: 'PATCH',
              body: JSON.stringify({ hidden: !hidden }),
            });
            showToast('Category updated', 'success');
            renderAdminCategories(area);
          } catch (e) {
            showToast(e.message, 'error');
          }
        });
      });

      document.querySelectorAll('.delete-cat-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (!confirm('Delete this category?')) return;
          try {
            await api(`/api/admin/categories/${id}`, { method: 'DELETE' });
            showToast('Category deleted', 'info');
            renderAdminCategories(area);
          } catch (e) {
            showToast(e.message, 'error');
          }
        });
      });
    } catch (err) {
      area.innerHTML = `<div class="empty-state">Error loading categories: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function renderAdminReports(area) {
    try {
      const res = await api('/api/admin/reports');
      const reports = res.reports || [];

      area.innerHTML = `
        <div class="admin-top-bar">
          <h1>Broken Game Reports (${reports.length})</h1>
        </div>

        <div class="admin-panel-card">
          <div class="admin-table-wrapper">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Reason</th>
                  <th>Details</th>
                  <th>Reporter</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${
                  reports.length === 0
                    ? `<tr><td colspan="6" style="text-align:center; padding: 2rem;">No broken game reports submitted yet.</td></tr>`
                    : reports
                        .map(
                          (r) => `
                    <tr>
                      <td><strong>${escapeHtml(r.game_title)}</strong></td>
                      <td><span class="badge badge-cat">${escapeHtml(r.reason)}</span></td>
                      <td>${escapeHtml(r.details || 'None provided')}</td>
                      <td>${escapeHtml(r.reporter_email || 'Anonymous')}</td>
                      <td><span class="status-badge status-${r.status}">${escapeHtml(r.status)}</span></td>
                      <td>
                        <div style="display:flex; gap:0.4rem;">
                          ${
                            r.status === 'open'
                              ? `<button class="btn btn-sm btn-secondary mark-reviewed-btn" data-id="${r.id}">Mark Reviewed</button>`
                              : ''
                          }
                          ${
                            r.status !== 'resolved'
                              ? `<button class="btn btn-sm btn-primary resolve-btn" data-id="${r.id}">Resolve</button>`
                              : ''
                          }
                        </div>
                      </td>
                    </tr>
                  `
                        )
                        .join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      `;

      document.querySelectorAll('.mark-reviewed-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          await api(`/api/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'reviewed' }) });
          showToast('Marked as reviewed', 'success');
          renderAdminReports(area);
        });
      });

      document.querySelectorAll('.resolve-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          await api(`/api/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) });
          showToast('Report marked resolved', 'success');
          renderAdminReports(area);
        });
      });
    } catch (err) {
      area.innerHTML = `<div class="empty-state">Error loading reports: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function renderAdminLogs(area) {
    try {
      const res = await api('/api/admin/logs');
      const logs = res.logs || [];

      area.innerHTML = `
        <div class="admin-top-bar">
          <h1>Admin Audit Trail</h1>
        </div>

        <div class="admin-panel-card">
          <div class="admin-table-wrapper">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Target Type</th>
                  <th>Target ID</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                ${
                  logs.length === 0
                    ? `<tr><td colspan="5" style="text-align:center; padding: 2rem;">No audit logs recorded yet.</td></tr>`
                    : logs
                        .map(
                          (l) => `
                    <tr>
                      <td style="white-space:nowrap; font-size:0.8rem; color:#64748b;">${new Date(l.created_at).toLocaleString()}</td>
                      <td><span class="badge badge-featured">${escapeHtml(l.action)}</span></td>
                      <td>${escapeHtml(l.target_type || '-')}</td>
                      <td><code style="font-size:0.75rem;">${escapeHtml(l.target_id || '-')}</code></td>
                      <td style="font-size:0.82rem; color:#475569;">${escapeHtml(l.details || '-')}</td>
                    </tr>
                  `
                        )
                        .join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      area.innerHTML = `<div class="empty-state">Error loading logs: ${escapeHtml(err.message)}</div>`;
    }
  }

  // ==========================================================================
  // 6. MODAL WORKFLOWS
  // ==========================================================================
  // Admin Login Modal
  function openAdminLoginModal() {
    if (!adminLoginModal) return;
    adminLoginModal.classList.remove('hidden');
    const input = document.getElementById('adminPasswordInput');
    if (input) {
      input.value = '';
      input.focus();
    }
  }

  document.getElementById('adminLoginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = document.getElementById('adminPasswordInput')?.value;
    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ password: pass }),
      });
      state.adminSession = true;
      adminLoginModal.classList.add('hidden');
      updateNavAuth();
      showToast('Admin session verified', 'success');
      renderAdminPage();
    } catch (err) {
      showToast(err.message || 'Incorrect password', 'error');
    }
  });

  async function handleAdminLogout() {
    try {
      await api('/api/admin/logout', { method: 'POST' });
      state.adminSession = false;
      updateNavAuth();
      showToast('Admin session ended', 'info');
      window.location.hash = '#home';
    } catch (_) {}
  }

  // Ban Confirmation Modal (Requirement 24)
  let activeBanUserId = null;
  function openBanModal(userId, userName) {
    activeBanUserId = userId;
    const nameElem = document.getElementById('banUserName');
    if (nameElem) nameElem.textContent = userName;
    const reasonInput = document.getElementById('banReasonInput');
    if (reasonInput) reasonInput.value = '';
    banUserModal?.classList.remove('hidden');
  }

  document.getElementById('confirmBanBtn')?.addEventListener('click', async () => {
    const reason = document.getElementById('banReasonInput')?.value.trim();
    const duration = document.getElementById('banDurationSelect')?.value;
    if (!reason) {
      showToast('Please enter a ban reason', 'error');
      return;
    }
    try {
      await api(`/api/admin/users/${activeBanUserId}/ban`, {
        method: 'POST',
        body: JSON.stringify({ reason, duration }),
      });
      showToast('User has been banned', 'success');
      banUserModal?.classList.add('hidden');
      loadAdminTabContent();
    } catch (err) {
      showToast(err.message || 'Failed to ban user', 'error');
    }
  });

  // Unban Confirmation Modal
  let activeUnbanUserId = null;
  function openUnbanModal(userId, userName) {
    activeUnbanUserId = userId;
    const nameElem = document.getElementById('unbanUserName');
    if (nameElem) nameElem.textContent = userName;
    unbanUserModal?.classList.remove('hidden');
  }

  document.getElementById('confirmUnbanBtn')?.addEventListener('click', async () => {
    try {
      await api(`/api/admin/users/${activeUnbanUserId}/unban`, { method: 'POST' });
      showToast('User unbanned successfully', 'success');
      unbanUserModal?.classList.add('hidden');
      loadAdminTabContent();
    } catch (err) {
      showToast(err.message || 'Failed to unban user', 'error');
    }
  });

  // Broken Game Report Modal (Requirement 36)
  let activeReportGame = null;
  function openReportModal(game) {
    activeReportGame = game;
    const titleElem = document.getElementById('reportGameTitle');
    if (titleElem) titleElem.textContent = game.title;
    reportGameModal?.classList.remove('hidden');
  }

  document.getElementById('submitReportBtn')?.addEventListener('click', async () => {
    if (!state.user) {
      showToast('Please sign in to submit game reports', 'info');
      openAuthModal();
      return;
    }
    const reason = document.getElementById('reportReasonSelect')?.value;
    const details = document.getElementById('reportDetailsInput')?.value;
    try {
      await api(`/api/games/${activeReportGame.slug}/report`, {
        method: 'POST',
        body: JSON.stringify({ reason, details }),
      });
      showToast('Report submitted. Thank you for helping keep the catalog clean!', 'success');
      reportGameModal?.classList.add('hidden');
    } catch (err) {
      showToast(err.message || 'Failed to submit report', 'error');
    }
  });

  // Google Sign-In & Test Sign-In Modal
  window.openAuthModal = function () {
    authModal?.classList.remove('hidden');
  };

  document.getElementById('googleLiveAuthBtn')?.addEventListener('click', () => {
    window.location.href = '/api/auth/google';
  });

  document.getElementById('demoUserLoginBtn')?.addEventListener('click', async () => {
    try {
      const res = await api('/api/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify({ email: 'gamer@gmail.com', displayName: 'Alex Player' }),
      });
      state.user = res.user;
      authModal?.classList.add('hidden');
      updateNavAuth();
      await loadFavorites();
      await loadRecentlyPlayed();
      showToast(`Signed in as ${state.user.displayName}`, 'success');
      handleRoute();
    } catch (err) {
      showToast(err.message || 'Sign in error', 'error');
    }
  });

  document.getElementById('customEmailAuthForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('customEmailInput')?.value.trim();
    if (!email) return;
    try {
      const res = await api('/api/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      state.user = res.user;
      authModal?.classList.add('hidden');
      updateNavAuth();
      await loadFavorites();
      await loadRecentlyPlayed();
      showToast(`Signed in as ${state.user.displayName}`, 'success');
      handleRoute();
    } catch (err) {
      showToast(err.message || 'Sign in error', 'error');
    }
  });

  async function handleSignOut() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
      state.user = null;
      state.adminSession = false;
      state.favorites.clear();
      state.recentGames = [];
      updateNavAuth();
      showToast('Signed out', 'info');
      handleRoute();
    } catch (_) {}
  }

  // Add / Edit Game Modals
  window.openAddGameModal = function () {
    const idInput = document.getElementById('gameFormId');
    if (idInput) idInput.value = '';
    document.getElementById('gameFormTitle').value = '';
    document.getElementById('gameFormSlug').value = '';
    document.getElementById('gameFormEmbed').value = '';
    document.getElementById('gameFormThumb').value = '';
    document.getElementById('gameFormDesc').value = '';
    populateCategorySelect();
    gameModal?.classList.remove('hidden');
  };

  window.openEditGameModal = function (game) {
    document.getElementById('gameFormId').value = game.id;
    document.getElementById('gameFormTitle').value = game.title;
    document.getElementById('gameFormSlug').value = game.slug;
    document.getElementById('gameFormEmbed').value = game.embedUrl;
    document.getElementById('gameFormThumb').value = game.thumbnail;
    document.getElementById('gameFormDesc').value = game.description || '';
    populateCategorySelect(game.categoryId);
    gameModal?.classList.remove('hidden');
  };

  function populateCategorySelect(selectedId = null) {
    const select = document.getElementById('gameFormCategory');
    if (!select) return;
    select.innerHTML = state.categories
      .map((c) => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`)
      .join('');
  }

  document.getElementById('gameForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('gameFormId')?.value;
    const body = {
      title: document.getElementById('gameFormTitle').value,
      slug: document.getElementById('gameFormSlug').value,
      embedUrl: document.getElementById('gameFormEmbed').value,
      thumbnail: document.getElementById('gameFormThumb').value,
      description: document.getElementById('gameFormDesc').value,
      categoryId: document.getElementById('gameFormCategory').value,
    };
    try {
      if (id) {
        await api(`/api/admin/games/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
        showToast('Game updated', 'success');
      } else {
        await api('/api/admin/games', { method: 'POST', body: JSON.stringify(body) });
        showToast('Game created', 'success');
      }
      gameModal?.classList.add('hidden');
      await loadInitialData();
      loadAdminTabContent();
    } catch (err) {
      showToast(err.message || 'Error saving game', 'error');
    }
  });

  // Add Category Modal
  window.openAddCategoryModal = function () {
    document.getElementById('catFormName').value = '';
    document.getElementById('catFormSlug').value = '';
    categoryModal?.classList.remove('hidden');
  };

  document.getElementById('categoryForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('catFormName').value.trim();
    const slug = document.getElementById('catFormSlug').value.trim().toLowerCase();
    try {
      await api('/api/admin/categories', {
        method: 'POST',
        body: JSON.stringify({ name, slug }),
      });
      showToast('Category created', 'success');
      categoryModal?.classList.add('hidden');
      await loadInitialData();
      loadAdminTabContent();
    } catch (err) {
      showToast(err.message || 'Error creating category', 'error');
    }
  });

  // Generic modal close handler
  document.querySelectorAll('.modal-close-btn, .modal-cancel-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.closest('.modal-backdrop')?.classList.add('hidden');
    });
  });

  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.classList.add('hidden');
    });
  });

  // Quick lock button
  lockQuickBtn?.addEventListener('click', () => {
    window.lockPlayVault();
  });

  // Mobile navigation hamburger toggle
  mobileToggle?.addEventListener('click', () => {
    navLinks?.classList.toggle('mobile-open');
  });

  // Window hash change router
  window.addEventListener('hashchange', handleRoute);

  // Initialize
  async function init() {
    await checkAuth();
    await loadInitialData();
    handleRoute();

    // Check for auth callback messages in query string
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'ok') {
      showToast('Successfully authenticated with Google!', 'success');
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    } else if (params.get('auth') === 'failed') {
      showToast('Authentication failed or account is banned', 'error');
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    }
  }

  // Trigger when unlocked
  window.addEventListener('playvault:unlocked', init);

  // If already unlocked
  if (sessionStorage.getItem('playvault_gate_1223') === '1') {
    init();
  }
})();
