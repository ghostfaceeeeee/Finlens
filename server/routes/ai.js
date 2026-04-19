/**
 * server/routes/ai.js
 * Proxy ke Anthropic Claude API — API key aman di server.
 */
const { Router } = require('express');
const { aiLimiter } = require('../middleware');
const { requireAuth } = require('../middleware/auth');
const { aiLog, assets, priceCache } = require('../db/queries');

const router = Router();

const SYSTEM_PROMPT = `Kamu adalah analis keuangan dan investasi berpengalaman bernama "FinLens AI".
Kamu ahli dalam: pasar saham Indonesia (IDX/BEI) & global (NYSE, NASDAQ), cryptocurrency, komoditas (emas, minyak), forex, dan instrumen investasi lainnya.

Panduan respons:
- Bahasa Indonesia yang profesional tapi mudah dipahami
- Berikan analisis berdasarkan data yang diberikan dalam konteks
- Selalu sertakan disclaimer bahwa ini bukan saran investasi formal
- Analisis meliputi: fundamental, teknikal sederhana, sentimen pasar, risiko
- Format: gunakan poin-poin singkat dan jelas
- Maksimal 4 paragraf atau 6 poin
- Sertakan perspektif jangka pendek dan menengah jika relevan

PENTING: Selalu tutup dengan "⚠️ Disclaimer: Ini adalah analisis informatif, bukan saran investasi. Lakukan riset mandiri sebelum berinvestasi."`;

// POST /api/ai/chat
router.post('/chat', requireAuth, aiLimiter, async (req, res, next) => {
  try {
    const { question, asset_symbol, context } = req.body;
    if (!question || question.trim().length < 3)
      return res.status(400).json({ error: 'Pertanyaan terlalu pendek.' });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey.includes('your-key-here')) {
      return res.status(503).json({ error: 'AI belum dikonfigurasi. Tambahkan ANTHROPIC_API_KEY di file .env.' });
    }

    // Build context dari data aset jika ada
    let assetContext = '';
    let assetId = null;
    if (asset_symbol) {
      const asset = assets.getBySymbol(asset_symbol);
      if (asset) {
        assetId = asset.id;
        const price = priceCache.get(asset.id);
        assetContext = `\n\nData Aset Saat Ini:\n- Aset: ${asset.name} (${asset.symbol})\n- Jenis: ${asset.type}\n- Exchange: ${asset.exchange || '-'}\n- Harga: ${price?.price ? '$' + price.price.toLocaleString() : 'N/A'}\n- Perubahan 24h: ${price?.change_pct ? price.change_pct.toFixed(2) + '%' : 'N/A'}\n- High 24h: ${price?.high_24h || 'N/A'}\n- Low 24h: ${price?.low_24h || 'N/A'}\n- Market Cap: ${price?.market_cap ? '$' + (price.market_cap/1e9).toFixed(2) + 'B' : 'N/A'}\n- ATH: ${price?.ath ? '$' + price.ath.toLocaleString() : 'N/A'}`;
      }
    }

    const userContent = `${assetContext}${context ? '\n\nKonteks tambahan: ' + context : ''}\n\nPertanyaan: ${question}`;

    const t0 = Date.now();
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Anthropic API error ${resp.status}`);
    }

    const data = await resp.json();
    const answer   = data.content?.map(b => b.text || '').join('') || '';
    const tIn      = data.usage?.input_tokens  || 0;
    const tOut     = data.usage?.output_tokens || 0;
    const duration = Date.now() - t0;

    try { aiLog.insert(req.user.id, assetId, question, answer, tIn, tOut, duration); } catch {}

    res.json({ answer, tokens: { in: tIn, out: tOut }, duration_ms: duration });
  } catch (e) {
    try { aiLog.insert(req.user?.id, null, req.body.question, null, 0, 0, 0, 'error'); } catch {}
    next(e);
  }
});

// GET /api/ai/history - riwayat chat user
router.get('/history', requireAuth, (req, res) => {
  res.json(aiLog.getByUser(req.user.id, 50));
});

// GET /api/ai/stats (admin)
router.get('/stats', requireAuth, (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Akses ditolak.' });
  res.json(aiLog.getStats());
});

module.exports = router;
