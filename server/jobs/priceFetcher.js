/**
 * server/jobs/priceFetcher.js
 * Fetch harga real-time dari:
 * - CoinGecko API (crypto) - GRATIS, no key
 * - Yahoo Finance query2 (saham, komoditas, forex, index) - GRATIS, no key
 * Cache hasil di SQLite. Update tiap 5 menit via cron.
 */
const cron = require('node-cron');
const { getDb } = require('../db/schema');
const { assets, priceCache, priceHistory, news: newsQ } = require('../db/queries');

// SSE clients
const clients = new Set();
function addClient(res)    { clients.add(res); }
function removeClient(res) { clients.delete(res); }
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach(r => { try { r.write(payload); } catch { clients.delete(r); } });
}

// Header standar untuk semua request Yahoo Finance
const YAHOO_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Origin': 'https://finance.yahoo.com',
  'Referer': 'https://finance.yahoo.com/',
};

// IDR exchange rate (fetch sekali per jam)
let usdToIdr = 16200;
async function fetchUsdIdr() {
  try {
    const r = await fetch('https://query2.finance.yahoo.com/v8/finance/chart/USDIDR=X?interval=1d&range=1d', {
      headers: YAHOO_HEADERS,
    });
    const d = await r.json();
    const p = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (p) usdToIdr = p;
    console.log(`[PRICE] USD/IDR: ${usdToIdr}`);
  } catch (e) {
    console.warn('[PRICE] USD/IDR fetch failed, pakai fallback:', usdToIdr);
  }
}

// ── COINGECKO: fetch crypto ────────────────────────────────────
async function fetchCrypto(cryptoAssets) {
  if (!cryptoAssets.length) return;
  try {
    const ids = cryptoAssets.map(a => a.coingecko_id).filter(Boolean).join(',');
    if (!ids) return;
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`;
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) {
      console.warn('[PRICE] CoinGecko response:', r.status);
      return;
    }
    const coins = await r.json();

    coins.forEach(c => {
      const asset = cryptoAssets.find(a => a.coingecko_id === c.id);
      if (!asset) return;
      priceCache.upsert(asset.id, {
        price:      c.current_price,
        priceIdr:   Math.round(c.current_price * usdToIdr),
        change24h:  c.price_change_24h,
        changePct:  c.price_change_percentage_24h,
        volume24h:  c.total_volume,
        marketCap:  c.market_cap,
        high24h:    c.high_24h,
        low24h:     c.low_24h,
        ath:        c.ath,
        athDate:    c.ath_date,
        atl:        c.atl,
        atlDate:    c.atl_date,
      });
    });
    console.log(`[PRICE] Crypto: ${coins.length}/${cryptoAssets.length} updated`);
  } catch (e) {
    console.warn('[PRICE] Crypto fetch failed:', e.message);
  }
}

// ── YAHOO FINANCE: fetch stocks, commodities, forex, indices ───
async function fetchYahoo(yahooAssets) {
  if (!yahooAssets.length) return;
  try {
    // Batch max 20 symbols per request
    const chunks = [];
    for (let i = 0; i < yahooAssets.length; i += 20)
      chunks.push(yahooAssets.slice(i, i + 20));

    let successCount = 0;

    for (const chunk of chunks) {
      const syms = chunk.map(a => a.yahoo_symbol || a.symbol).join(',');

      // Coba query2 dulu, fallback ke query1
      let data = null;
      for (const host of ['query2', 'query1']) {
        try {
          const url = `https://${host}.finance.yahoo.com/v8/finance/quote?symbols=${encodeURIComponent(syms)}`;
          const r = await fetch(url, { headers: YAHOO_HEADERS });
          if (!r.ok) {
            console.warn(`[PRICE] ${host} responded ${r.status} for: ${syms}`);
            continue;
          }
          data = await r.json();
          break; // sukses, keluar dari loop
        } catch (e) {
          console.warn(`[PRICE] ${host} error:`, e.message);
        }
      }

      if (!data) continue;

      const quotes = data?.quoteResponse?.result || [];
      quotes.forEach(q => {
        const sym   = q.symbol;
        const asset = chunk.find(a => (a.yahoo_symbol || a.symbol) === sym);
        if (!asset) return;
        const price = q.regularMarketPrice;
        if (!price) return;
        priceCache.upsert(asset.id, {
          price,
          priceIdr:   asset.currency === 'IDR' ? price : Math.round(price * usdToIdr),
          change24h:  q.regularMarketChange,
          changePct:  q.regularMarketChangePercent,
          volume24h:  q.regularMarketVolume,
          marketCap:  q.marketCap,
          high24h:    q.regularMarketDayHigh,
          low24h:     q.regularMarketDayLow,
          ath:        q.fiftyTwoWeekHigh,
          athDate:    null,
          atl:        q.fiftyTwoWeekLow,
          atlDate:    null,
        });
        successCount++;
      });

      // Jeda kecil antar chunk agar tidak di-rate-limit
      if (chunks.length > 1) await sleep(500);
    }

    console.log(`[PRICE] Yahoo: ${successCount}/${yahooAssets.length} assets updated`);
  } catch (e) {
    console.warn('[PRICE] Yahoo fetch failed:', e.message);
  }
}

// ── SEED HISTORY dari Yahoo ────────────────────────────────────
async function seedHistoryForAsset(asset, days = 90) {
  try {
    const sym   = asset.yahoo_symbol || asset.symbol;
    const end   = Math.floor(Date.now() / 1000);
    const start = end - days * 86400;

    // Coba query2 dulu, fallback ke query1
    let data = null;
    for (const host of ['query2', 'query1']) {
      try {
        const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&period1=${start}&period2=${end}`;
        const r = await fetch(url, { headers: YAHOO_HEADERS });
        if (!r.ok) continue;
        data = await r.json();
        break;
      } catch {}
    }

    if (!data) return false;
    const result = data?.chart?.result?.[0];
    if (!result) return false;

    const ts    = result.timestamp || [];
    const ohlcv = result.indicators?.quote?.[0] || {};
    const rows  = ts.map((t, i) => [
      asset.id,
      new Date(t * 1000).toISOString().split('T')[0],
      ohlcv.open?.[i]   || null,
      ohlcv.high?.[i]   || null,
      ohlcv.low?.[i]    || null,
      ohlcv.close?.[i]  || null,
      ohlcv.volume?.[i] || null,
    ]).filter(r => r[4] !== null);

    priceHistory.bulkInsert(rows);
    console.log(`[HISTORY] ${sym}: ${rows.length} hari tersimpan`);
    return true;
  } catch (e) {
    console.warn(`[HISTORY] seedHistoryForAsset error:`, e.message);
    return false;
  }
}

// ── NEWS FETCHER ──────────────────────────────────────────────
async function fetchNews() {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT COUNT(*) as n FROM news_cache WHERE fetched_at > datetime("now", "-30 minutes")').get();
    if (existing.n > 10) return;

    const demoNews = generateDemoNews();
    newsQ.insertMany(demoNews);
    newsQ.deleteOld(48);
    console.log(`[NEWS] ${demoNews.length} berita disisipkan`);
  } catch (e) {
    console.warn('[NEWS] Fetch failed:', e.message);
  }
}

function generateDemoNews() {
  const now = new Date().toISOString();
  return [
    { source:'Bloomberg', title:'Bitcoin Tembus $70.000 Didorong ETF Inflow Besar', summary:'Arus masuk ETF Bitcoin spot AS mencapai $500 juta dalam sehari, mendorong BTC ke level tertinggi 2 bulan.', url:'#', imageUrl:null, category:'crypto', sentiment:'positive', publishedAt: now },
    { source:'CNBC Indonesia', title:'IHSG Menguat 0.8% Dipimpin Sektor Perbankan', summary:'Indeks Harga Saham Gabungan (IHSG) ditutup menguat 58 poin didorong aksi beli asing di saham big-cap perbankan.', url:'#', imageUrl:null, category:'markets', sentiment:'positive', publishedAt: now },
    { source:'Reuters', title:'Harga Emas Capai Record $2.400/oz Imbas Ketegangan Geopolitik', summary:'Safe haven demand mendorong emas ke rekor tertinggi sepanjang masa seiring meningkatnya ketidakpastian global.', url:'#', imageUrl:null, category:'commodity', sentiment:'positive', publishedAt: now },
    { source:'Bisnis.com', title:'Fed Tahan Suku Bunga, Pasar Saham AS Bereaksi Positif', summary:'Federal Reserve mempertahankan fed funds rate di kisaran 5.25-5.5%, sesuai ekspektasi pasar. Wall Street merespons positif.', url:'#', imageUrl:null, category:'economy', sentiment:'neutral', publishedAt: now },
    { source:'CoinDesk', title:'Ethereum Upgrade "Pectra" Dijadwalkan Q2 2026', summary:'Developer Ethereum mengumumkan jadwal upgrade Pectra yang akan meningkatkan skalabilitas dan efisiensi gas fee secara signifikan.', url:'#', imageUrl:null, category:'crypto', sentiment:'positive', publishedAt: now },
    { source:'Kontan', title:'OJK Terbitkan Aturan Baru Investasi Reksa Dana Digital', summary:'Otoritas Jasa Keuangan merilis regulasi baru yang mempermudah akses masyarakat ke produk reksa dana berbasis platform digital.', url:'#', imageUrl:null, category:'markets', sentiment:'positive', publishedAt: now },
    { source:'Bloomberg', title:'Minyak Brent Turun ke $82/barel Akibat Kenaikan Stok AS', summary:'Harga minyak mentah Brent melemah setelah data EIA menunjukkan kenaikan stok minyak AS melebihi ekspektasi.', url:'#', imageUrl:null, category:'commodity', sentiment:'negative', publishedAt: now },
    { source:'CNBC', title:'Nvidia Cetak Rekor Pendapatan Q1, Saham Naik 8%', summary:'Nvidia melaporkan pendapatan $26 miliar untuk Q1 2026, melampaui proyeksi analis. Dorongan AI chip demand terus kuat.', url:'#', imageUrl:null, category:'markets', sentiment:'positive', publishedAt: now },
    { source:'Antara', title:'BI Pertahankan BI Rate 6.25% Demi Stabilkan Rupiah', summary:'Bank Indonesia mempertahankan suku bunga acuan di tengah tekanan pelemahan Rupiah dan inflasi yang terkendali di 2.8% YoY.', url:'#', imageUrl:null, category:'economy', sentiment:'neutral', publishedAt: now },
    { source:'CoinTelegraph', title:'Solana Ekosistem Capai 2 Juta Transaksi Per Hari', summary:'Jaringan Solana mencatat rekor throughput dengan biaya transaksi rata-rata kurang dari $0.001, mendorong adopsi DeFi & NFT.', url:'#', imageUrl:null, category:'crypto', sentiment:'positive', publishedAt: now },
  ];
}

// ── MAIN UPDATE FUNCTION ──────────────────────────────────────
async function updateAllPrices() {
  const all = assets.getAll();
  const cryptoAssets = all.filter(a => a.type === 'crypto' && a.coingecko_id);
  const yahooAssets  = all.filter(a => a.type !== 'crypto');

  await fetchUsdIdr();
  await Promise.allSettled([
    fetchCrypto(cryptoAssets),
    fetchYahoo(yahooAssets),
  ]);

  broadcast('price_update', { ts: new Date().toISOString(), usd_idr: usdToIdr });
}

// ── HELPER ────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── CRON JOBS ─────────────────────────────────────────────────
function startJobs() {
  // Update harga tiap 5 menit
  cron.schedule('*/5 * * * *', () => {
    updateAllPrices().catch(e => console.error('[CRON] price update error:', e));
  });

  // Update berita tiap 30 menit
  cron.schedule('*/30 * * * *', () => {
    fetchNews().catch(e => console.error('[CRON] news error:', e));
  });

  // Update IDR rate tiap jam
  cron.schedule('0 * * * *', () => {
    fetchUsdIdr().catch(() => {});
  });

  console.log('[JOBS] Cron jobs started: prices every 5min, news every 30min');
}

module.exports = { startJobs, addClient, removeClient, updateAllPrices, seedHistoryForAsset, getUsdIdr: () => usdToIdr };
