/**
 * server/db/schema.js
 * SQLite schema untuk FinLens:
 * users, sessions, assets, watchlist (favorit), price_cache, news_cache, ai_log
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../database/finlens.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

let _db = null;

function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  return _db;
}

function initSchema() {
  const db = getDb();
  db.exec(`
    -- ─────────────────────────────────────────────
    -- USERS: akun pengguna
    -- ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      email        TEXT NOT NULL UNIQUE COLLATE NOCASE,
      username     TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      avatar_color TEXT NOT NULL DEFAULT '#11C4A8',
      role         TEXT NOT NULL DEFAULT 'user',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      last_login   TEXT
    );

    -- ─────────────────────────────────────────────
    -- SESSIONS: JWT blacklist (logout)
    -- ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS sessions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    -- ─────────────────────────────────────────────
    -- ASSETS: master data aset keuangan
    -- ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS assets (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol        TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      type          TEXT NOT NULL, -- stock_id | stock_us | crypto | commodity | forex | index
      exchange      TEXT,          -- IDX, NYSE, NASDAQ, BINANCE, etc
      currency      TEXT NOT NULL DEFAULT 'USD',
      description   TEXT,
      sector        TEXT,
      country       TEXT,
      logo_url      TEXT,
      coingecko_id  TEXT,         -- untuk crypto via CoinGecko
      yahoo_symbol  TEXT,         -- untuk saham/komoditas via Yahoo
      active        INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_assets_type   ON assets(type);
    CREATE INDEX IF NOT EXISTS idx_assets_symbol ON assets(symbol);

    -- ─────────────────────────────────────────────
    -- WATCHLIST: favorit per user (CRUD)
    -- ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS watchlist (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      asset_id   INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      notes      TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      added_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, asset_id)
    );
    CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id);

    -- ─────────────────────────────────────────────
    -- PRICE_CACHE: cache harga real-time (5 menit)
    -- ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS price_cache (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id     INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      price        REAL,
      price_idr    REAL,
      change_24h   REAL,
      change_pct   REAL,
      volume_24h   REAL,
      market_cap   REAL,
      high_24h     REAL,
      low_24h      REAL,
      ath          REAL,
      ath_date     TEXT,
      atl          REAL,
      atl_date     TEXT,
      fetched_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(asset_id)
    );
    CREATE INDEX IF NOT EXISTS idx_price_cache_asset ON price_cache(asset_id);

    -- ─────────────────────────────────────────────
    -- PRICE_HISTORY: historis harga harian (untuk chart)
    -- ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS price_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id   INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      date       TEXT NOT NULL,
      open       REAL,
      high       REAL,
      low        REAL,
      close      REAL,
      volume     REAL,
      UNIQUE(asset_id, date)
    );
    CREATE INDEX IF NOT EXISTS idx_history_asset_date ON price_history(asset_id, date DESC);

    -- ─────────────────────────────────────────────
    -- NEWS_CACHE: berita keuangan (cache 30 menit)
    -- ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS news_cache (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      source      TEXT NOT NULL,
      title       TEXT NOT NULL,
      summary     TEXT,
      url         TEXT,
      image_url   TEXT,
      category    TEXT,  -- markets | crypto | economy | tech | commodity
      sentiment   TEXT,  -- positive | negative | neutral
      published_at TEXT,
      fetched_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_news_category ON news_cache(category, fetched_at DESC);

    -- ─────────────────────────────────────────────
    -- AI_LOG: riwayat chat AI per user
    -- ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS ai_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      asset_id    INTEGER REFERENCES assets(id) ON DELETE SET NULL,
      question    TEXT NOT NULL,
      answer      TEXT,
      tokens_in   INTEGER,
      tokens_out  INTEGER,
      duration_ms INTEGER,
      status      TEXT DEFAULT 'ok',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ai_log_user ON ai_log(user_id, created_at DESC);
  `);
  console.log('[DB] Schema initialized');
  return db;
}

module.exports = { getDb, initSchema };
