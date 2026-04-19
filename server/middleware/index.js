/**
 * server/index.js — FinLens entry point
 */
require('dotenv').config();
const express  = require('express');
const path     = require('path');
const { initSchema }  = require('./db/schema');
const { security, logger, apiLimiter, errorHandler, notFound } = require('./middleware');
const authRoutes      = require('./routes/auth');
const marketRoutes    = require('./routes/market');
const aiRoutes        = require('./routes/ai');
const watchlistRoutes = require('./routes/watchlist');
const { startJobs, addClient, removeClient, updateAllPrices, seedHistoryForAsset } = require('./jobs/priceFetcher');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── DB ─────────────────────────────────────────────────────────
initSchema();

// ── MIDDLEWARE ─────────────────────────────────────────────────
app.use(...security);
app.use(logger);
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, '../public')));

// ── ROUTES ─────────────────────────────────────────────────────
app.use('/api', apiLimiter);
app.use('/api/auth',      authRoutes);
app.use('/api/market',    marketRoutes);
app.use('/api/ai',        aiRoutes);
app.use('/api/watchlist', watchlistRoutes);

// ── HEALTH ─────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({
  status: 'ok', version: '1.0.0',
  uptime: Math.round(process.uptime()), ts: new Date().toISOString(),
}));

// ── SSE: Live price feed ────────────────────────────────────────
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write(`event: connected\ndata: {"ts":"${new Date().toISOString()}"}\n\n`);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  addClient(res);
  req.on('close', () => { clearInterval(ping); removeClient(res); });
});

// ── API 404 (harus sebelum SPA fallback) ──────────────────────
app.use('/api', (req, res) => {
  res.status(404).json({ error: `API endpoint tidak ditemukan: ${req.method} ${req.path}` });
});

// ── SPA FALLBACK (hanya untuk non-API) ────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── ERROR ──────────────────────────────────────────────────────
app.use(errorHandler);

// ── START ──────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n🚀 FinLens running → http://localhost:${PORT}`);
  console.log(`   Mode: ${process.env.NODE_ENV || 'development'}`);
  startJobs();

  // Fetch harga & seed history saat startup
  setTimeout(async () => {
    try {
      // 1. Update harga terkini dulu
      await updateAllPrices().catch(() => {});

      // 2. Seed history untuk aset yang belum punya data
      const { assets, priceHistory } = require('./db/queries');
      const all = assets.getAll();
      console.log(`[STARTUP] Mengecek history untuk ${all.length} aset...`);

      for (const asset of all) {
        const existing = priceHistory.get(asset.id, 1);
        if (!existing || existing.length === 0) {
          console.log(`[STARTUP] Seeding history: ${asset.symbol}`);
          await seedHistoryForAsset(asset, 90);
          // Jeda kecil agar tidak kena rate limit Yahoo
          await new Promise(r => setTimeout(r, 300));
        }
      }
      console.log('[STARTUP] History seeding selesai ✓');
    } catch (e) {
      console.warn('[STARTUP] Error:', e.message);
    }
  }, 2000);
});

module.exports = app;
