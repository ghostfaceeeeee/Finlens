/**
 * server/db/queries.js
 * Semua prepared statements dan query helpers.
 */
const { getDb } = require('./schema');

// ── USERS ──────────────────────────────────────────────────────
const users = {
  create: (email, username, passwordHash, avatarColor) =>
    getDb().prepare(`INSERT INTO users (email, username, password_hash, avatar_color) VALUES (?,?,?,?)`)
      .run(email, username, passwordHash, avatarColor),

  findByEmail: (email) =>
    getDb().prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email),

  findByUsername: (username) =>
    getDb().prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username),

  findById: (id) =>
    getDb().prepare('SELECT id, email, username, avatar_color, role, created_at, last_login FROM users WHERE id = ?').get(id),

  updateLastLogin: (id) =>
    getDb().prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(id),

  updatePassword: (id, hash) =>
    getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id),
};

// ── WATCHLIST (Favorit) ────────────────────────────────────────
const watchlist = {
  getByUser: (userId) =>
    getDb().prepare(`
      SELECT w.id, w.asset_id, w.notes, w.sort_order, w.added_at,
             a.symbol, a.name, a.type, a.exchange, a.currency, a.logo_url,
             pc.price, pc.change_pct, pc.price_idr, pc.fetched_at
      FROM watchlist w
      JOIN assets a ON a.id = w.asset_id
      LEFT JOIN price_cache pc ON pc.asset_id = w.asset_id
      WHERE w.user_id = ?
      ORDER BY w.sort_order ASC, w.added_at ASC
    `).all(userId),

  add: (userId, assetId, notes = null) => {
    const maxOrder = getDb().prepare('SELECT MAX(sort_order) AS m FROM watchlist WHERE user_id = ?').get(userId);
    return getDb().prepare(`
      INSERT OR IGNORE INTO watchlist (user_id, asset_id, notes, sort_order)
      VALUES (?, ?, ?, ?)
    `).run(userId, assetId, notes, (maxOrder?.m || 0) + 1);
  },

  remove: (userId, watchlistId) =>
    getDb().prepare('DELETE FROM watchlist WHERE id = ? AND user_id = ?').run(watchlistId, userId),

  updateNotes: (userId, watchlistId, notes) =>
    getDb().prepare('UPDATE watchlist SET notes = ? WHERE id = ? AND user_id = ?').run(notes, watchlistId, userId),

  reorder: (userId, watchlistId, newOrder) =>
    getDb().prepare('UPDATE watchlist SET sort_order = ? WHERE id = ? AND user_id = ?').run(newOrder, watchlistId, userId),

  isInWatchlist: (userId, assetId) =>
    !!getDb().prepare('SELECT id FROM watchlist WHERE user_id = ? AND asset_id = ?').get(userId, assetId),
};

// ── ASSETS ─────────────────────────────────────────────────────
const assets = {
  getAll: (type = null) => {
    const q = type
      ? getDb().prepare('SELECT * FROM assets WHERE type = ? AND active = 1 ORDER BY symbol')
      : getDb().prepare('SELECT * FROM assets WHERE active = 1 ORDER BY type, symbol');
    return type ? q.all(type) : q.all();
  },

  getById: (id) =>
    getDb().prepare('SELECT * FROM assets WHERE id = ?').get(id),

  getBySymbol: (symbol) =>
    getDb().prepare('SELECT * FROM assets WHERE symbol = ? COLLATE NOCASE').get(symbol),

  search: (q) =>
    getDb().prepare(`
      SELECT a.*, pc.price, pc.change_pct
      FROM assets a
      LEFT JOIN price_cache pc ON pc.asset_id = a.id
      WHERE (a.symbol LIKE ? OR a.name LIKE ?) AND a.active = 1
      LIMIT 20
    `).all(`%${q}%`, `%${q}%`),

  getWithPrice: (type = null) => {
    const where = type ? `WHERE a.type = ? AND a.active = 1` : `WHERE a.active = 1`;
    const q = getDb().prepare(`
      SELECT a.*, pc.price, pc.price_idr, pc.change_24h, pc.change_pct,
             pc.volume_24h, pc.market_cap, pc.high_24h, pc.low_24h,
             pc.ath, pc.ath_date, pc.fetched_at
      FROM assets a
      LEFT JOIN price_cache pc ON pc.asset_id = a.id
      ${where}
      ORDER BY pc.market_cap DESC NULLS LAST, a.symbol
    `);
    return type ? q.all(type) : q.all();
  },
};

// ── PRICE CACHE ────────────────────────────────────────────────
const priceCache = {
  upsert: (assetId, data) =>
    getDb().prepare(`
      INSERT INTO price_cache (asset_id, price, price_idr, change_24h, change_pct,
        volume_24h, market_cap, high_24h, low_24h, ath, ath_date, atl, atl_date)
      VALUES (@assetId, @price, @priceIdr, @change24h, @changePct,
        @volume24h, @marketCap, @high24h, @low24h, @ath, @athDate, @atl, @atlDate)
      ON CONFLICT(asset_id) DO UPDATE SET
        price=excluded.price, price_idr=excluded.price_idr,
        change_24h=excluded.change_24h, change_pct=excluded.change_pct,
        volume_24h=excluded.volume_24h, market_cap=excluded.market_cap,
        high_24h=excluded.high_24h, low_24h=excluded.low_24h,
        ath=excluded.ath, ath_date=excluded.ath_date,
        atl=excluded.atl, atl_date=excluded.atl_date,
        fetched_at=datetime('now')
    `).run({ assetId, ...data }),

  get: (assetId) =>
    getDb().prepare('SELECT * FROM price_cache WHERE asset_id = ?').get(assetId),

  getStale: (minutes = 5) =>
    getDb().prepare(`
      SELECT a.* FROM assets a
      LEFT JOIN price_cache pc ON pc.asset_id = a.id
      WHERE a.active = 1 AND (
        pc.asset_id IS NULL OR
        pc.fetched_at < datetime('now', '-${minutes} minutes')
      )
    `).all(),
};

// ── PRICE HISTORY ──────────────────────────────────────────────
const priceHistory = {
  get: (assetId, days = 30) =>
    getDb().prepare(`
      SELECT date, open, high, low, close, volume
      FROM price_history
      WHERE asset_id = ? AND date >= date('now', '-${days} days')
      ORDER BY date ASC
    `).all(assetId),

  upsert: (assetId, date, open, high, low, close, volume) =>
    getDb().prepare(`
      INSERT OR REPLACE INTO price_history (asset_id, date, open, high, low, close, volume)
      VALUES (?,?,?,?,?,?,?)
    `).run(assetId, date, open, high, low, close, volume),

  bulkInsert: (rows) => {
    const stmt = getDb().prepare(`
      INSERT OR IGNORE INTO price_history (asset_id, date, open, high, low, close, volume)
      VALUES (?,?,?,?,?,?,?)
    `);
    const tx = getDb().transaction((rows) => rows.forEach(r => stmt.run(...r)));
    tx(rows);
  },
};

// ── NEWS ───────────────────────────────────────────────────────
const news = {
  getLatest: (category = null, limit = 20) => {
    const q = category
      ? getDb().prepare('SELECT * FROM news_cache WHERE category = ? ORDER BY published_at DESC, fetched_at DESC LIMIT ?')
      : getDb().prepare('SELECT * FROM news_cache ORDER BY published_at DESC, fetched_at DESC LIMIT ?');
    return category ? q.all(category, limit) : q.all(limit);
  },

  insertMany: (items) => {
    const stmt = getDb().prepare(`
      INSERT OR IGNORE INTO news_cache (source, title, summary, url, image_url, category, sentiment, published_at)
      VALUES (@source, @title, @summary, @url, @imageUrl, @category, @sentiment, @publishedAt)
    `);
    const tx = getDb().transaction(items => items.forEach(i => stmt.run(i)));
    tx(items);
  },

  deleteOld: (hours = 24) =>
    getDb().prepare(`DELETE FROM news_cache WHERE fetched_at < datetime('now', '-${hours} hours')`).run(),

  count: () =>
    getDb().prepare('SELECT COUNT(*) as n FROM news_cache').get().n,
};

// ── AI LOG ─────────────────────────────────────────────────────
const aiLog = {
  insert: (userId, assetId, question, answer, tokensIn, tokensOut, durationMs, status = 'ok') =>
    getDb().prepare(`
      INSERT INTO ai_log (user_id, asset_id, question, answer, tokens_in, tokens_out, duration_ms, status)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(userId, assetId, question, answer, tokensIn, tokensOut, durationMs, status),

  getByUser: (userId, limit = 20) =>
    getDb().prepare('SELECT id, question, duration_ms, status, created_at FROM ai_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(userId, limit),

  getStats: () =>
    getDb().prepare(`
      SELECT COUNT(*) AS total, AVG(duration_ms) AS avg_ms,
             SUM(tokens_in) AS tin, SUM(tokens_out) AS tout,
             SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS errors
      FROM ai_log
    `).get(),
};

module.exports = { users, watchlist, assets, priceCache, priceHistory, news, aiLog };
