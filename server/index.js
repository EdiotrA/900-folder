import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuid } from 'uuid';
import { db, auditLog } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(
  session({
    name: 'playvault.sid',
    secret: process.env.SESSION_SECRET || 'dev-only-change-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 14,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

function mapGame(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    thumbnail: row.thumbnail,
    category: row.category_name,
    categoryId: row.category_id,
    embedUrl: row.embed_url,
    tags: row.tags ? JSON.parse(row.tags) : [],
    featured: !!row.featured,
    published: !!row.published,
    playCount: row.play_count,
    developer: row.developer,
    controls: row.controls,
    rating: row.rating,
    supportsFullscreen: !!row.supports_fullscreen,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function isBanned(user) {
  if (!user?.banned_until) return false;
  if (user.banned_until === 'permanent') return true;
  return new Date(user.banned_until) > new Date();
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    role: user.role,
    createdAt: user.created_at,
    lastActive: user.last_active,
    banned: isBanned(user),
    banReason: isBanned(user) ? user.ban_reason : null,
    banUntil: isBanned(user) ? user.banned_until : null,
  };
}

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  try {
    done(null, getUserById(id));
  } catch (e) {
    done(e);
  }
});

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${BASE_URL}/api/auth/google/callback`,
      },
      (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) return done(null, false, { message: 'No email from Google' });

          let user = db.prepare('SELECT * FROM users WHERE google_id = ? OR email = ?').get(profile.id, email);
          if (!user) {
            const id = uuid();
            const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
            const role = adminEmail && email.toLowerCase() === adminEmail ? 'admin' : 'user';
            db.prepare(
              `INSERT INTO users (id, google_id, email, display_name, avatar_url, role, last_active)
               VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
            ).run(id, profile.id, email, profile.displayName || email.split('@')[0], profile.photos?.[0]?.value || null, role);
            user = getUserById(id);
          } else {
            db.prepare(
              `UPDATE users SET google_id = ?, display_name = ?, avatar_url = ?, last_active = datetime('now') WHERE id = ?`
            ).run(profile.id, profile.displayName || user.display_name, profile.photos?.[0]?.value || user.avatar_url, user.id);
            user = getUserById(user.id);
          }
          if (isBanned(user)) {
            return done(null, false, { message: 'Account banned', banReason: user.ban_reason, banUntil: user.banned_until });
          }
          done(null, user);
        } catch (err) {
          done(err);
        }
      }
    )
  );
}

async function ensureAdminPassword() {
  const plain = process.env.ADMIN_PASSWORD || 'AdminPlayVault2026!';
  const row = db.prepare('SELECT password_hash FROM admin_credentials WHERE id = 1').get();
  if (!row) {
    const hash = await bcrypt.hash(plain, 10);
    db.prepare('INSERT INTO admin_credentials (id, password_hash) VALUES (1, ?)').run(hash);
  }
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@playvault.io').trim().toLowerCase();
  const existingAdmin = db.prepare('SELECT * FROM users WHERE email = ?').get(adminEmail);
  if (!existingAdmin) {
    db.prepare(
      `INSERT INTO users (id, google_id, email, display_name, avatar_url, role, last_active)
       VALUES (?, ?, ?, ?, ?, 'admin', datetime('now'))`
    ).run('admin-root', 'admin-system', adminEmail, 'PlayVault Administrator', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&h=120&q=80');
  }
}

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in required.' });
  const fresh = getUserById(req.user.id);
  if (!fresh) {
    req.logout(() => {});
    return res.status(401).json({ error: 'Session expired.' });
  }
  if (isBanned(fresh)) {
    req.logout(() => {});
    return res.status(403).json({
      error: 'Your account is banned.',
      banReason: fresh.ban_reason,
      banUntil: fresh.banned_until,
    });
  }
  req.user = fresh;
  db.prepare(`UPDATE users SET last_active = datetime('now') WHERE id = ?`).run(fresh.id);
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.adminVerified) return res.status(401).json({ error: 'Admin authentication required.' });
  if (!req.user || !['admin', 'moderator', 'game_manager'].includes(req.user.role)) {
    return res.status(403).json({ error: 'You do not have admin access.' });
  }
  next();
}

function requireAdminRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }
    next();
  };
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/auth/config', (_req, res) => {
  res.json({
    googleEnabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.json({ user: null, adminSession: !!req.session.adminVerified });
  const user = getUserById(req.user.id);
  if (isBanned(user)) {
    req.logout(() => {});
    return res.status(403).json({
      error: 'Your account is banned.',
      banReason: user.ban_reason,
      banUntil: user.banned_until,
    });
  }
  res.json({ user: sanitizeUser(user), adminSession: !!req.session.adminVerified });
});

app.get('/api/auth/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: 'Google sign-in is not configured yet.' });
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

app.get(
  '/api/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/?auth=failed' }),
  (_req, res) => {
    res.redirect('/?auth=ok');
  }
);

app.post('/api/auth/logout', (req, res) => {
  req.session.adminVerified = false;
  req.logout(() => res.json({ ok: true }));
});

app.post('/api/auth/demo-login', (req, res) => {
  const email = (req.body?.email || 'gamer@gmail.com').trim().toLowerCase();
  const displayName = req.body?.displayName || email.split('@')[0];
  const avatarUrl = req.body?.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(email)}`;

  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    const id = uuid();
    const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const role = adminEmail && email === adminEmail ? 'admin' : 'user';
    db.prepare(
      `INSERT INTO users (id, google_id, email, display_name, avatar_url, role, last_active)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(id, `google_${id}`, email, displayName, avatarUrl, role);
    user = getUserById(id);
  } else {
    db.prepare(`UPDATE users SET last_active = datetime('now') WHERE id = ?`).run(user.id);
    user = getUserById(user.id);
  }

  if (isBanned(user)) {
    return res.status(403).json({
      error: 'Account banned',
      banReason: user.ban_reason,
      banUntil: user.banned_until,
    });
  }

  req.login(user, (err) => {
    if (err) return res.status(500).json({ error: 'Failed to establish session' });
    res.json({ ok: true, user: sanitizeUser(user) });
  });
});

app.post('/api/admin/login', async (req, res) => {
  const { password } = req.body || {};
  const row = db.prepare('SELECT password_hash FROM admin_credentials WHERE id = 1').get();
  if (!row) return res.status(503).json({ error: 'Admin login is not configured on the server.' });
  const ok = await bcrypt.compare(String(password || ''), row.password_hash);
  if (!ok) return res.status(401).json({ error: 'Incorrect admin password.' });

  let user = req.user ? getUserById(req.user.id) : null;
  if (!user || !['admin', 'moderator', 'game_manager'].includes(user.role)) {
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@playvault.io').trim().toLowerCase();
    user = db.prepare('SELECT * FROM users WHERE email = ?').get(adminEmail);
    if (!user) {
      const id = 'admin-root';
      db.prepare(
        `INSERT INTO users (id, google_id, email, display_name, avatar_url, role, last_active)
         VALUES (?, ?, ?, ?, ?, 'admin', datetime('now'))`
      ).run(id, 'admin_system', adminEmail, 'PlayVault Administrator', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&h=120&q=80');
      user = getUserById(id);
    }
  }

  req.login(user, (err) => {
    if (err) return res.status(500).json({ error: 'Login session error.' });
    req.session.adminVerified = true;
    auditLog('admin_login', user.id, 'admin', user.id, { ip: req.ip });
    res.json({ ok: true, user: sanitizeUser(user) });
  });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.adminVerified = false;
  if (req.user) {
    auditLog('admin_logout', req.user.id, 'admin', req.user.id, null);
  }
  res.json({ ok: true });
});

app.get('/api/games', (req, res) => {
  const { q, category, featured, popular, recent, limit = '48', offset = '0' } = req.query;
  let sql = `
    SELECT g.*, c.name as category_name FROM games g
    LEFT JOIN categories c ON c.id = g.category_id
    WHERE g.published = 1 AND (c.hidden IS NULL OR c.hidden = 0)
  `;
  const params = [];
  if (q) {
    sql += ` AND (g.title LIKE ? OR g.description LIKE ? OR g.tags LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (category) {
    sql += ` AND c.slug = ?`;
    params.push(category);
  }
  if (featured === '1') sql += ` AND g.featured = 1`;
  if (popular === '1') sql += ` ORDER BY g.play_count DESC, g.title ASC`;
  else if (recent === '1') sql += ` ORDER BY g.created_at DESC`;
  else sql += ` ORDER BY g.title ASC`;
  sql += ` LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));
  const rows = db.prepare(sql).all(...params);
  res.json({ games: rows.map(mapGame) });
});

app.get('/api/games/:slug', (req, res) => {
  const row = db
    .prepare(
      `SELECT g.*, c.name as category_name, c.slug as category_slug FROM games g
       LEFT JOIN categories c ON c.id = g.category_id WHERE g.slug = ? AND g.published = 1`
    )
    .get(req.params.slug);
  if (!row) return res.status(404).json({ error: 'Game not found.' });
  res.json({ game: mapGame(row) });
});

app.post('/api/games/:slug/play', requireUser, (req, res) => {
  const game = db.prepare('SELECT id FROM games WHERE slug = ?').get(req.params.slug);
  if (!game) return res.status(404).json({ error: 'Game not found.' });
  db.prepare(`UPDATE games SET play_count = play_count + 1 WHERE id = ?`).run(game.id);
  db.prepare(
    `INSERT INTO recently_played (user_id, game_id, played_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id, game_id) DO UPDATE SET played_at = datetime('now')`
  ).run(req.user.id, game.id);
  const all = db
    .prepare(`SELECT game_id FROM recently_played WHERE user_id = ? ORDER BY played_at DESC`)
    .all(req.user.id);
  if (all.length > 30) {
    const drop = all.slice(30);
    const del = db.prepare('DELETE FROM recently_played WHERE user_id = ? AND game_id = ?');
    for (const r of drop) del.run(req.user.id, r.game_id);
  }
  res.json({ ok: true });
});

app.get('/api/categories', (_req, res) => {
  const rows = db
    .prepare(`SELECT * FROM categories WHERE hidden = 0 ORDER BY sort_order ASC, name ASC`)
    .all();
  res.json({ categories: rows });
});

app.get('/api/me/favorites', requireUser, (req, res) => {
  const rows = db
    .prepare(
      `SELECT g.*, c.name as category_name FROM favorites f
       JOIN games g ON g.id = f.game_id
       LEFT JOIN categories c ON c.id = g.category_id
       WHERE f.user_id = ? ORDER BY f.created_at DESC`
    )
    .all(req.user.id);
  res.json({ games: rows.map(mapGame) });
});

app.post('/api/me/favorites/:gameId', requireUser, (req, res) => {
  const game = db.prepare('SELECT id FROM games WHERE id = ?').get(req.params.gameId);
  if (!game) return res.status(404).json({ error: 'Game not found.' });
  db.prepare(`INSERT OR IGNORE INTO favorites (user_id, game_id) VALUES (?, ?)`).run(req.user.id, game.id);
  res.json({ ok: true });
});

app.delete('/api/me/favorites/:gameId', requireUser, (req, res) => {
  db.prepare(`DELETE FROM favorites WHERE user_id = ? AND game_id = ?`).run(req.user.id, req.params.gameId);
  res.json({ ok: true });
});

app.get('/api/me/recent', requireUser, (req, res) => {
  const rows = db
    .prepare(
      `SELECT g.*, c.name as category_name, rp.played_at FROM recently_played rp
       JOIN games g ON g.id = rp.game_id
       LEFT JOIN categories c ON c.id = g.category_id
       WHERE rp.user_id = ? ORDER BY rp.played_at DESC LIMIT 12`
    )
    .all(req.user.id);
  res.json({ games: rows.map((r) => ({ ...mapGame(r), lastPlayed: r.played_at })) });
});

app.post('/api/games/:slug/report', requireUser, (req, res) => {
  const game = db.prepare('SELECT id FROM games WHERE slug = ?').get(req.params.slug);
  if (!game) return res.status(404).json({ error: 'Game not found.' });
  const { reason, details } = req.body || {};
  const allowed = ['load', 'link', 'incorrect', 'inappropriate', 'other'];
  if (!allowed.includes(reason)) return res.status(400).json({ error: 'Invalid report reason.' });
  db.prepare(
    `INSERT INTO game_reports (id, game_id, user_id, reason, details) VALUES (?, ?, ?, ?, ?)`
  ).run(uuid(), game.id, req.user.id, reason, details || null);
  res.json({ ok: true, message: 'Report submitted. Thank you.' });
});

app.get('/api/admin/overview', requireAdmin, (_req, res) => {
  const stats = {
    totalUsers: db.prepare('SELECT COUNT(*) as n FROM users').get().n,
    activeUsers: db.prepare(`SELECT COUNT(*) as n FROM users WHERE last_active >= datetime('now', '-7 days')`).get().n,
    totalGames: db.prepare('SELECT COUNT(*) as n FROM games').get().n,
    bannedUsers: db.prepare(`SELECT COUNT(*) as n FROM users WHERE banned_until IS NOT NULL`).get().n,
    openReports: db.prepare(`SELECT COUNT(*) as n FROM game_reports WHERE status = 'open'`).get().n,
    recentGames: db
      .prepare(`SELECT title, created_at FROM games ORDER BY created_at DESC LIMIT 5`)
      .all(),
  };
  res.json({ stats });
});

app.get('/api/admin/users', requireAdmin, requireAdminRole('admin', 'moderator'), (req, res) => {
  const { q = '', status = 'all', sort = 'joined', page = '1', pageSize = '20' } = req.query;
  let sql = `SELECT * FROM users WHERE 1=1`;
  const params = [];
  if (q) {
    sql += ` AND (display_name LIKE ? OR email LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`);
  }
  if (status === 'banned') sql += ` AND banned_until IS NOT NULL`;
  if (status === 'active') sql += ` AND (banned_until IS NULL OR banned_until <= datetime('now'))`;
  if (sort === 'active') sql += ` ORDER BY last_active DESC NULLS LAST`;
  else if (sort === 'name') sql += ` ORDER BY display_name ASC`;
  else sql += ` ORDER BY created_at DESC`;
  const limit = Math.min(100, Number(pageSize) || 20);
  const offset = (Math.max(1, Number(page) || 1) - 1) * limit;
  const total = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) as n')).get(...params).n;
  sql += ` LIMIT ? OFFSET ?`;
  params.push(limit, offset);
  res.json({ users: db.prepare(sql).all(...params).map(sanitizeUser), total, page: Number(page) || 1 });
});

app.get('/api/admin/users/:id', requireAdmin, requireAdminRole('admin', 'moderator'), (req, res) => {
  const user = getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const logs = db
    .prepare(
      `SELECT * FROM audit_logs WHERE target_id = ? OR admin_id = ? ORDER BY created_at DESC LIMIT 50`
    )
    .all(user.id, user.id);
  res.json({ user: sanitizeUser(user), moderationLogs: logs });
});

app.post('/api/admin/users/:id/ban', requireAdmin, requireAdminRole('admin', 'moderator'), (req, res) => {
  const { reason, duration, customUntil } = req.body || {};
  if (!reason) return res.status(400).json({ error: 'Ban reason is required.' });
  let until = 'permanent';
  if (duration === '1d') until = new Date(Date.now() + 864e5).toISOString();
  else if (duration === '7d') until = new Date(Date.now() + 7 * 864e5).toISOString();
  else if (duration === '30d') until = new Date(Date.now() + 30 * 864e5).toISOString();
  else if (duration === 'custom' && customUntil) until = new Date(customUntil).toISOString();
  db.prepare(`UPDATE users SET banned_until = ?, ban_reason = ? WHERE id = ?`).run(until, reason, req.params.id);
  auditLog('user_banned', req.user.id, 'user', req.params.id, { until, reason });
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/unban', requireAdmin, requireAdminRole('admin', 'moderator'), (req, res) => {
  db.prepare(`UPDATE users SET banned_until = NULL, ban_reason = NULL WHERE id = ?`).run(req.params.id);
  auditLog('user_unbanned', req.user.id, 'user', req.params.id, null);
  res.json({ ok: true });
});

app.get('/api/admin/reports', requireAdmin, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT r.*, g.title as game_title, u.email as reporter_email FROM game_reports r
       JOIN games g ON g.id = r.game_id
       LEFT JOIN users u ON u.id = r.user_id
       ORDER BY r.created_at DESC LIMIT 100`
    )
    .all();
  res.json({ reports: rows });
});

app.patch('/api/admin/reports/:id', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!['reviewed', 'resolved', 'open'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  db.prepare(
    `UPDATE game_reports SET status = ?, reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?`
  ).run(status, req.user.id, req.params.id);
  res.json({ ok: true });
});

app.get('/api/admin/games', requireAdmin, requireAdminRole('admin', 'game_manager'), (_req, res) => {
  const rows = db
    .prepare(`SELECT g.*, c.name as category_name FROM games g LEFT JOIN categories c ON c.id = g.category_id ORDER BY g.title`)
    .all();
  res.json({ games: rows.map(mapGame) });
});

app.post('/api/admin/games', requireAdmin, requireAdminRole('admin', 'game_manager'), (req, res) => {
  const b = req.body || {};
  const id = uuid();
  const slug = b.slug || b.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  db.prepare(
    `INSERT INTO games (id, title, slug, description, thumbnail, category_id, embed_url, tags, featured, published)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    b.title,
    slug,
    b.description || '',
    b.thumbnail || '',
    b.categoryId,
    b.embedUrl,
    JSON.stringify(b.tags || []),
    b.featured ? 1 : 0,
    b.published === false ? 0 : 1
  );
  auditLog('game_added', req.user.id, 'game', id, { title: b.title });
  res.json({ id });
});

app.patch('/api/admin/games/:id', requireAdmin, requireAdminRole('admin', 'game_manager'), (req, res) => {
  const b = req.body || {};
  db.prepare(
    `UPDATE games SET title=COALESCE(?,title), description=COALESCE(?,description), thumbnail=COALESCE(?,thumbnail),
     category_id=COALESCE(?,category_id), embed_url=COALESCE(?,embed_url), featured=COALESCE(?,featured),
     published=COALESCE(?,published), updated_at=datetime('now') WHERE id=?`
  ).run(
    b.title ?? null,
    b.description ?? null,
    b.thumbnail ?? null,
    b.categoryId ?? null,
    b.embedUrl ?? null,
    b.featured === undefined ? null : b.featured ? 1 : 0,
    b.published === undefined ? null : b.published ? 1 : 0,
    req.params.id
  );
  auditLog('game_edited', req.user.id, 'game', req.params.id, b);
  res.json({ ok: true });
});

app.delete('/api/admin/games/:id', requireAdmin, requireAdminRole('admin', 'game_manager'), (req, res) => {
  db.prepare('DELETE FROM games WHERE id = ?').run(req.params.id);
  auditLog('game_deleted', req.user.id, 'game', req.params.id, null);
  res.json({ ok: true });
});

app.get('/api/admin/categories', requireAdmin, requireAdminRole('admin', 'game_manager'), (_req, res) => {
  res.json({ categories: db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all() });
});

app.post('/api/admin/categories', requireAdmin, requireAdminRole('admin', 'game_manager'), (req, res) => {
  const { name, slug } = req.body || {};
  if (!name || !slug) return res.status(400).json({ error: 'Name and slug required.' });
  const id = uuid();
  db.prepare(`INSERT INTO categories (id, name, slug) VALUES (?, ?, ?)`).run(id, name, slug);
  res.json({ id });
});

app.patch('/api/admin/categories/:id', requireAdmin, requireAdminRole('admin', 'game_manager'), (req, res) => {
  const { name, hidden } = req.body || {};
  db.prepare(`UPDATE categories SET name = COALESCE(?, name), hidden = COALESCE(?, hidden) WHERE id = ?`).run(
    name ?? null,
    hidden === undefined ? null : hidden ? 1 : 0,
    req.params.id
  );
  res.json({ ok: true });
});

app.delete('/api/admin/categories/:id', requireAdmin, requireAdminRole('admin', 'game_manager'), (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as n FROM games WHERE category_id = ?').get(req.params.id).n;
  if (count > 0) return res.status(400).json({ error: 'Category still has games assigned.' });
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/admin/logs', requireAdmin, requireAdminRole('admin'), (_req, res) => {
  const logs = db.prepare(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200`).all();
  res.json({ logs });
});

app.use(express.static(root));

app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(root, 'index.html'));
});

await ensureAdminPassword();

const gameCount = db.prepare('SELECT COUNT(*) as n FROM games').get().n;
if (gameCount === 0) {
  console.log('No games found — run: npm run seed');
}

app.listen(PORT, () => {
  console.log(`PlayVault running at ${BASE_URL}`);
});
