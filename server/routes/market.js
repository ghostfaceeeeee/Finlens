/**
 * server/routes/market.js
 * Endpoint data pasar: assets, harga, histori, berita.
 */
const { Router } = require('express');
const { assets, priceCache, priceHistory, news } = require('../db/queries');
const { optionalAuth } = require('../middleware/auth');

const router = Router();
router.use(optionalAuth);

// ── ASSETS ────────────────────────────────────────────────────
// GET /api/market/assets?type=crypto
router.get('/assets', (req, res) => {
  const { type, q } = req.query;
  if (q) return res.json(assets.search(q));
  res.json(assets.getWithPrice(type || null));
});

// GET /api/market/assets/:symbol
router.get('/assets/:symbol', (req, res) => {
  const asset = assets.getBySymbol(req.params.symbol);
  if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan.' });

  const price   = priceCache.get(asset.id);
  const history = priceHistory.get(asset.id, 30);

  // Cek apakah user telah favoritkan
  let inWatchlist = false;
  if (req.user) {
    const { watchlist } = require('../db/queries');
    inWatchlist = watchlist.isInWatchlist(req.user.id, asset.id);
  }

  res.json({ asset, price, history, in_watchlist: inWatchlist });
});

// GET /api/market/assets/:symbol/history?days=90
router.get('/assets/:symbol/history', (req, res) => {
  const asset = assets.getBySymbol(req.params.symbol);
  if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan.' });
  const days = Math.min(parseInt(req.query.days) || 30, 365);
  res.json({ symbol: asset.symbol, history: priceHistory.get(asset.id, days) });
});

// ── PRICES ────────────────────────────────────────────────────
// GET /api/market/prices?symbols=BTC,ETH,BBCA.JK
router.get('/prices', (req, res) => {
  const symbols = (req.query.symbols || '').split(',').filter(Boolean).map(s => s.trim().toUpperCase());
  if (!symbols.length) return res.json([]);

  const result = symbols.map(sym => {
    const asset = assets.getBySymbol(sym);
    if (!asset) return { symbol: sym, error: 'not found' };
    const price = priceCache.get(asset.id);
    return { ...asset, ...price };
  });
  res.json(result);
});

// ── NEWS ──────────────────────────────────────────────────────
// GET /api/market/news?category=crypto&limit=20
router.get('/news', (req, res) => {
  const { category, limit } = req.query;
  const items = news.getLatest(category || null, Math.min(parseInt(limit) || 20, 50));
  res.json({ news: items, count: items.length });
});

module.exports = router;
