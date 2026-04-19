/**
 * scripts/seed.js
 * Seed database: master asset list + demo news + trigger first price fetch.
 */
require('dotenv').config();
const { initSchema, getDb } = require('../server/db/schema');
const { news: newsQ } = require('../server/db/queries');

console.log('\n🌱 FinLens — Seed Database...\n');
initSchema();
const db = getDb();

// ── MASTER ASSETS ─────────────────────────────────────────────
const ASSETS = [
  // ── CRYPTO ──
  { symbol:'BTC',  name:'Bitcoin',          type:'crypto',    exchange:'Global',  currency:'USD', coingecko_id:'bitcoin',          description:'Cryptocurrency pertama dan terbesar berdasarkan market cap. Diciptakan Satoshi Nakamoto pada 2009.', sector:'Layer 1', country:'Global' },
  { symbol:'ETH',  name:'Ethereum',         type:'crypto',    exchange:'Global',  currency:'USD', coingecko_id:'ethereum',         description:'Platform smart contract terbesar. Dasar dari ekosistem DeFi dan NFT global.', sector:'Layer 1', country:'Global' },
  { symbol:'BNB',  name:'BNB',              type:'crypto',    exchange:'Binance', currency:'USD', coingecko_id:'binancecoin',      description:'Token native Binance Smart Chain. Digunakan untuk fee trading dan berbagai aplikasi DeFi.', sector:'Exchange Token', country:'Global' },
  { symbol:'SOL',  name:'Solana',           type:'crypto',    exchange:'Global',  currency:'USD', coingecko_id:'solana',           description:'Blockchain layer 1 berkecepatan tinggi dengan throughput hingga 65.000 TPS dan biaya rendah.', sector:'Layer 1', country:'Global' },
  { symbol:'XRP',  name:'XRP',              type:'crypto',    exchange:'Global',  currency:'USD', coingecko_id:'ripple',           description:'Token pembayaran lintas batas milik Ripple Labs. Digunakan bank dan institusi keuangan global.', sector:'Payment', country:'Global' },
  { symbol:'ADA',  name:'Cardano',          type:'crypto',    exchange:'Global',  currency:'USD', coingecko_id:'cardano',          description:'Blockchain proof-of-stake yang dikembangkan secara akademis. Fokus pada keamanan dan skalabilitas.', sector:'Layer 1', country:'Global' },
  { symbol:'DOGE', name:'Dogecoin',         type:'crypto',    exchange:'Global',  currency:'USD', coingecko_id:'dogecoin',         description:'Meme coin yang diciptakan 2013 sebagai lelucon, kini menjadi aset kripto top 10 berdasarkan market cap.', sector:'Meme Coin', country:'Global' },
  { symbol:'AVAX', name:'Avalanche',        type:'crypto',    exchange:'Global',  currency:'USD', coingecko_id:'avalanche-2',      description:'Platform smart contract dengan finality sub-second. Arsitektur subnet memungkinkan skalabilitas tinggi.', sector:'Layer 1', country:'Global' },

  // ── SAHAM IDX ──
  { symbol:'BBCA.JK', name:'Bank Central Asia',    type:'stock_id', exchange:'IDX',    currency:'IDR', yahoo_symbol:'BBCA.JK', description:'Bank swasta terbesar di Indonesia berdasarkan aset. Dikenal dengan layanan digital dan jaringan ATM terluas.', sector:'Banking', country:'Indonesia' },
  { symbol:'BBRI.JK', name:'Bank Rakyat Indonesia',type:'stock_id', exchange:'IDX',    currency:'IDR', yahoo_symbol:'BBRI.JK', description:'Bank BUMN terbesar di Indonesia. Fokus pada segmen UMKM dan memiliki nasabah terbanyak.', sector:'Banking', country:'Indonesia' },
  { symbol:'TLKM.JK', name:'Telkom Indonesia',     type:'stock_id', exchange:'IDX',    currency:'IDR', yahoo_symbol:'TLKM.JK', description:'BUMN telekomunikasi terbesar Indonesia. Mengoperasikan infrastruktur internet, TV kabel, dan data center.', sector:'Telecom', country:'Indonesia' },
  { symbol:'ASII.JK', name:'Astra International',  type:'stock_id', exchange:'IDX',    currency:'IDR', yahoo_symbol:'ASII.JK', description:'Konglomerat terbesar Indonesia. Bergerak di otomotif, agribisnis, alat berat, pertambangan, dan infrastruktur.', sector:'Conglomerate', country:'Indonesia' },
  { symbol:'GOTO.JK', name:'GoTo Gojek Tokopedia', type:'stock_id', exchange:'IDX',    currency:'IDR', yahoo_symbol:'GOTO.JK', description:'Perusahaan teknologi terbesar Indonesia hasil merger Gojek dan Tokopedia. Ekosistem digital terlengkap.', sector:'Technology', country:'Indonesia' },
  { symbol:'BMRI.JK', name:'Bank Mandiri',         type:'stock_id', exchange:'IDX',    currency:'IDR', yahoo_symbol:'BMRI.JK', description:'Bank BUMN terbesar berdasarkan aset total. Pemimpin di segmen korporasi, komersial, dan consumer banking.', sector:'Banking', country:'Indonesia' },

  // ── SAHAM US ──
  { symbol:'AAPL',  name:'Apple Inc.',       type:'stock_us', exchange:'NASDAQ', currency:'USD', yahoo_symbol:'AAPL',  description:'Perusahaan teknologi terbesar dunia berdasarkan market cap. Pembuat iPhone, Mac, iPad, dan layanan digital.', sector:'Technology', country:'USA' },
  { symbol:'NVDA',  name:'Nvidia',           type:'stock_us', exchange:'NASDAQ', currency:'USD', yahoo_symbol:'NVDA',  description:'Pemimpin GPU dan chip AI. Dominan di segmen data center, gaming, dan kendaraan otonom.', sector:'Semiconductors', country:'USA' },
  { symbol:'TSLA',  name:'Tesla',            type:'stock_us', exchange:'NASDAQ', currency:'USD', yahoo_symbol:'TSLA',  description:'Produsen kendaraan listrik terbesar. Juga bergerak di solar panel, baterai, dan AI autonomous driving.', sector:'Auto/EV', country:'USA' },
  { symbol:'MSFT',  name:'Microsoft',        type:'stock_us', exchange:'NASDAQ', currency:'USD', yahoo_symbol:'MSFT',  description:'Raksasa software dan cloud computing. Azure tumbuh pesat, diperkuat investasi besar di OpenAI/ChatGPT.', sector:'Technology', country:'USA' },
  { symbol:'GOOGL', name:'Alphabet (Google)',type:'stock_us', exchange:'NASDAQ', currency:'USD', yahoo_symbol:'GOOGL', description:'Induk perusahaan Google. Dominan di search engine, YouTube, cloud (GCP), dan pengembangan AI Gemini.', sector:'Technology', country:'USA' },

  // ── KOMODITAS ──
  { symbol:'GC=F',  name:'Gold (Emas)',       type:'commodity', exchange:'COMEX',  currency:'USD', yahoo_symbol:'GC=F',  description:'Logam mulia yang digunakan sebagai safe haven, lindung nilai inflasi, dan cadangan devisa bank sentral.', sector:'Precious Metal', country:'Global' },
  { symbol:'CL=F',  name:'Crude Oil (WTI)',   type:'commodity', exchange:'NYMEX',  currency:'USD', yahoo_symbol:'CL=F',  description:'Minyak mentah West Texas Intermediate, patokan harga minyak Amerika Serikat dan referensi global.', sector:'Energy', country:'Global' },
  { symbol:'SI=F',  name:'Silver (Perak)',    type:'commodity', exchange:'COMEX',  currency:'USD', yahoo_symbol:'SI=F',  description:'Logam mulia dengan aplikasi industri luas (elektronik, panel surya) dan nilai investasi tinggi.', sector:'Precious Metal', country:'Global' },
  { symbol:'BZ=F',  name:'Brent Crude Oil',  type:'commodity', exchange:'ICE',    currency:'USD', yahoo_symbol:'BZ=F',  description:'Minyak mentah Brent, patokan internasional utama yang digunakan OPEC dan pasar global.', sector:'Energy', country:'Global' },

  // ── FOREX ──
  { symbol:'USDIDR=X', name:'USD/IDR',        type:'forex',     exchange:'FX',     currency:'IDR', yahoo_symbol:'USDIDR=X', description:'Pasangan mata uang Dolar AS terhadap Rupiah Indonesia. Indikator utama kekuatan ekonomi Indonesia.', sector:'Forex', country:'Global' },
  { symbol:'EURUSD=X', name:'EUR/USD',        type:'forex',     exchange:'FX',     currency:'USD', yahoo_symbol:'EURUSD=X', description:'Pasangan mata uang paling diperdagangkan di dunia. Cerminan kekuatan ekonomi Eropa vs Amerika Serikat.', sector:'Forex', country:'Global' },

  // ── INDICES ──
  { symbol:'^JKSE',  name:'IHSG',             type:'index', exchange:'IDX',    currency:'IDR', yahoo_symbol:'^JKSE',  description:'Indeks Harga Saham Gabungan — indeks utama Bursa Efek Indonesia mencakup seluruh saham tercatat.', sector:'Index', country:'Indonesia' },
  { symbol:'^GSPC',  name:'S&P 500',          type:'index', exchange:'NYSE',   currency:'USD', yahoo_symbol:'^GSPC',  description:'Indeks 500 perusahaan terbesar AS berdasarkan market cap. Tolok ukur utama pasar saham global.', sector:'Index', country:'USA' },
  { symbol:'^DJI',   name:'Dow Jones',        type:'index', exchange:'NYSE',   currency:'USD', yahoo_symbol:'^DJI',   description:'Indeks 30 perusahaan industri besar AS. Salah satu indikator ekonomi tertua dan paling dipantau.', sector:'Index', country:'USA' },
  { symbol:'^IXIC',  name:'NASDAQ Composite', type:'index', exchange:'NASDAQ', currency:'USD', yahoo_symbol:'^IXIC',  description:'Indeks komposit NASDAQ mencakup >3.000 saham, didominasi sektor teknologi dan biotek.', sector:'Index', country:'USA' },
];

const insert = db.prepare(`
  INSERT OR IGNORE INTO assets (symbol, name, type, exchange, currency, coingecko_id, yahoo_symbol, description, sector, country)
  VALUES (@symbol, @name, @type, @exchange, @currency, @coingecko_id, @yahoo_symbol, @description, @sector, @country)
`);
const insertMany = db.transaction(rows => rows.forEach(r => insert.run({
  ...r,
  coingecko_id: r.coingecko_id || null,
  yahoo_symbol: r.yahoo_symbol || null,
})));

insertMany(ASSETS);
const count = db.prepare('SELECT COUNT(*) AS n FROM assets').get().n;
console.log(`✅ ${count} aset tersedia di database`);

// ── DEMO BERITA ───────────────────────────────────────────────
const now = new Date().toISOString();
const demoNews = [
  { source:'Bloomberg', title:'Bitcoin Tembus $70.000 Didorong ETF Inflow Besar', summary:'Arus masuk ETF Bitcoin spot AS mencapai $500 juta dalam sehari.', url:'#', imageUrl:null, category:'crypto', sentiment:'positive', publishedAt: now },
  { source:'CNBC Indonesia', title:'IHSG Menguat 0.8% Dipimpin Sektor Perbankan', summary:'IHSG ditutup menguat 58 poin didorong aksi beli asing di saham big-cap.', url:'#', imageUrl:null, category:'markets', sentiment:'positive', publishedAt: now },
  { source:'Reuters', title:'Harga Emas Capai Record $2.400/oz', summary:'Safe haven demand mendorong emas ke rekor tertinggi sepanjang masa.', url:'#', imageUrl:null, category:'commodity', sentiment:'positive', publishedAt: now },
  { source:'Bisnis.com', title:'Fed Tahan Suku Bunga, Wall Street Positif', summary:'Federal Reserve pertahankan fed funds rate di 5.25-5.5%.', url:'#', imageUrl:null, category:'economy', sentiment:'neutral', publishedAt: now },
  { source:'CoinDesk', title:'Ethereum Upgrade "Pectra" Dijadwalkan Q2 2026', summary:'Developer umumkan jadwal upgrade yang tingkatkan skalabilitas.', url:'#', imageUrl:null, category:'crypto', sentiment:'positive', publishedAt: now },
  { source:'Kontan', title:'OJK Terbitkan Aturan Baru Investasi Digital', summary:'Regulasi baru mempermudah akses reksa dana berbasis platform digital.', url:'#', imageUrl:null, category:'markets', sentiment:'positive', publishedAt: now },
  { source:'Bloomberg', title:'Minyak Brent Turun ke $82/barel', summary:'Harga minyak melemah akibat kenaikan stok minyak AS.', url:'#', imageUrl:null, category:'commodity', sentiment:'negative', publishedAt: now },
  { source:'CNBC', title:'Nvidia Cetak Rekor Pendapatan Q1', summary:'Nvidia laporkan pendapatan $26 miliar, melampaui proyeksi analis.', url:'#', imageUrl:null, category:'markets', sentiment:'positive', publishedAt: now },
  { source:'Antara', title:'BI Pertahankan BI Rate 6.25%', summary:'Bank Indonesia pertahankan suku bunga demi stabilkan Rupiah.', url:'#', imageUrl:null, category:'economy', sentiment:'neutral', publishedAt: now },
  { source:'CoinTelegraph', title:'Solana Ekosistem Capai 2 Juta Transaksi/Hari', summary:'Jaringan Solana catat rekor throughput dengan biaya <$0.001.', url:'#', imageUrl:null, category:'crypto', sentiment:'positive', publishedAt: now },
];

newsQ.insertMany(demoNews);
console.log(`✅ ${demoNews.length} berita demo disisipkan`);

// ── DEMO USER ─────────────────────────────────────────────────
const bcrypt = require('bcryptjs');
const existingUser = db.prepare("SELECT id FROM users WHERE email = 'demo@finlens.id'").get();
if (!existingUser) {
  const hash = bcrypt.hashSync('demo1234', 10);
  const r = db.prepare("INSERT OR IGNORE INTO users (email, username, password_hash, avatar_color) VALUES (?,?,?,?)").run('demo@finlens.id', 'demo_user', hash, '#11C4A8');
  if (r.lastInsertRowid) {
    // Tambah beberapa aset ke watchlist demo
    const wAssets = db.prepare("SELECT id FROM assets WHERE symbol IN ('BTC','ETH','BBCA.JK','NVDA','GC=F') ORDER BY symbol").all();
    wAssets.forEach((a, i) => {
      db.prepare("INSERT OR IGNORE INTO watchlist (user_id, asset_id, sort_order) VALUES (?,?,?)").run(r.lastInsertRowid, a.id, i);
    });
    console.log('✅ Demo user dibuat: demo@finlens.id / demo1234');
  }
} else {
  console.log('ℹ️  Demo user sudah ada');
}

console.log('\n🎉 Seed selesai!');
console.log('   Jalankan: npm run dev');
console.log('   Buka: http://localhost:3000\n');
