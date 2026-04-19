/**
 * public/js/modules/market.js
 * Halaman market: asset list (grid/table), detail aset, news.
 */
import { api } from './api.js';
import { showToast, fmtPrice, fmtPct, fmtMktCap, fmtVol, fmtDate,
         typeLabel, typeIcon, buildSparkSVG, buildPriceChart, showLoading, el } from './ui.js';
import { askAI, setAIContext } from './ai.js';
import { addToWatchlist, isInWatchlist, getWatchlistItem, removeFromWatchlist } from './watchlist.js';

let viewMode = 'grid'; // grid | table
let currentType = 'all';
let currentDetailSymbol = null;
let newsCategory = null;

const TYPE_COLORS = {
  crypto: '#F5A623', stock_id: '#11C4A8', stock_us: '#5B8AF5',
  commodity: '#A78BFA', forex: '#34D399', index: '#F472B6',
};

// ── MARKET LIST ───────────────────────────────────────
export async function loadMarket(type = null) {
  currentType = type || 'all';
  showLoading('marketContent', 'Memuat data aset...');
  try {
    const assets = await api.getAssets(type);
    renderMarket(assets);
  } catch (e) {
    el('marketContent').innerHTML = `<div style="padding:30px;text-align:center;color:var(--dn);font-family:var(--mono);font-size:11px">Gagal memuat: ${e.message}</div>`;
  }
}

function renderMarket(assets) {
  const container = el('marketContent');
  if (!container) return;
  if (!assets.length) {
    container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--dim);font-family:var(--mono);font-size:11px">Tidak ada aset</div>`;
    return;
  }
  if (viewMode === 'grid') container.innerHTML = renderGrid(assets);
  else container.innerHTML = renderTable(assets);
  bindAssetClicks(container);
}

function renderGrid(assets) {
  return `<div class="asset-grid">` + assets.map(a => {
    const pct   = a.change_pct;
    const dir   = pct == null ? '' : pct >= 0 ? 'up' : 'dn';
    const color = TYPE_COLORS[a.type] || '#8EAAB8';
    const sparkColor = dir === 'up' ? '#12D19E' : dir === 'dn' ? '#F7644A' : '#8EAAB8';
    // Generate mini random spark for display (real spark would come from history)
    const sparkData = Array.from({ length: 12 }, (_, i) => {
      const base = a.price || 100;
      return base * (1 + (Math.sin(i * 0.8 + (a.id || 1)) * 0.05));
    });
    return `
    <div class="asset-card ${dir}" data-symbol="${a.symbol}" title="${a.name}">
      <div class="ac-header">
        <span class="ac-sym">${a.symbol}</span>
        <span class="ac-type" style="color:${color}">${typeLabel(a.type)}</span>
      </div>
      <div class="ac-name">${a.name}</div>
      <div class="ac-price">${fmtPrice(a.price, a.currency)}</div>
      <div class="ac-change ${dir}">${pct != null ? fmtPct(pct) : '—'}</div>
      <div class="mini-spark">${buildSparkSVG(sparkData, sparkColor, 120, 28)}</div>
    </div>`;
  }).join('') + `</div>`;
}

function renderTable(assets) {
  return `
  <div style="overflow-x:auto">
  <table class="asset-table">
    <thead><tr>
      <th>Aset</th>
      <th class="right">Harga</th>
      <th class="right">24h %</th>
      <th class="right hide-mobile">24h High</th>
      <th class="right hide-mobile">24h Low</th>
      <th class="right hide-mobile">Market Cap</th>
      <th class="right hide-mobile">Volume</th>
      <th class="right">Grafik</th>
    </tr></thead>
    <tbody>` + assets.map(a => {
    const pct = a.change_pct;
    const dir = pct == null ? '' : pct >= 0 ? 'up' : 'dn';
    const sparkData = Array.from({ length: 10 }, (_, i) =>
      (a.price || 100) * (1 + Math.sin(i * 0.9 + (a.id || 1)) * 0.04));
    return `
    <tr data-symbol="${a.symbol}">
      <td>
        <div class="at-sym">${a.symbol}</div>
        <div class="at-name">${a.name}</div>
      </td>
      <td class="right at-price">${fmtPrice(a.price, a.currency)}</td>
      <td class="right at-chg ${dir}">${pct != null ? fmtPct(pct) : '—'}</td>
      <td class="right at-price hide-mobile" style="font-size:11px;color:var(--dim)">${fmtPrice(a.high_24h, a.currency)}</td>
      <td class="right at-price hide-mobile" style="font-size:11px;color:var(--dim)">${fmtPrice(a.low_24h, a.currency)}</td>
      <td class="right at-mcap hide-mobile">${fmtMktCap(a.market_cap)}</td>
      <td class="right at-mcap hide-mobile">${fmtVol(a.volume_24h)}</td>
      <td class="right at-spark">${buildSparkSVG(sparkData, dir === 'up' ? '#12D19E' : '#F7644A', 56, 22)}</td>
    </tr>`;
  }).join('') + `</tbody></table></div>`;
}

function bindAssetClicks(container) {
  container.querySelectorAll('[data-symbol]').forEach(el => {
    el.addEventListener('click', () => openAssetDetail(el.dataset.symbol));
  });
}

// ── ASSET DETAIL ──────────────────────────────────────
export async function openAssetDetail(symbol) {
  currentDetailSymbol = symbol;
  setAIContext(symbol);

  // Navigate to detail page
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  el('page-detail')?.classList.add('active');
  el('ptitle').innerHTML = 'Detail <em>Aset</em>';

  showLoading('detailContent', 'Memuat detail aset...');

  try {
    const { asset, price, history, in_watchlist } = await api.getAsset(symbol);
    renderDetail(asset, price, history, in_watchlist);
  } catch (e) {
    el('detailContent').innerHTML = `<div style="padding:40px;text-align:center;color:var(--dn);font-size:12px">${e.message}</div>`;
  }
}

function renderDetail(asset, price, history, inWatchlist) {
  const container = el('detailContent');
  if (!container) return;

  const pct  = price?.change_pct;
  const dir  = pct == null ? '' : pct >= 0 ? 'up' : 'dn';
  const icon = typeIcon(asset.type);
  const color = TYPE_COLORS[asset.type] || '#8EAAB8';
  const wItem = getWatchlistItem(asset.id);

  container.innerHTML = `
  <div class="content">

    <!-- Back button -->
    <button onclick="history.back ? history.back() : window._goto('market')" style="display:flex;align-items:center;gap:5px;background:var(--bg3);border:1px solid var(--line);border-radius:var(--r8);padding:5px 12px;font-size:11px;font-family:var(--mono);color:var(--dim);cursor:pointer;margin-bottom:14px;transition:.15s" onmouseover="this.style.color='var(--off)'" onmouseout="this.style.color='var(--dim)'">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2L4 6l4 4"/></svg>
      Kembali
    </button>

    <!-- Header -->
    <div class="detail-header">
      <div class="detail-icon" style="font-size:22px">${icon}</div>
      <div class="detail-title">
        <div class="detail-sym" style="color:${color}">${asset.symbol} · ${typeLabel(asset.type)} · ${asset.exchange || ''}</div>
        <div class="detail-name">${asset.name}</div>
        <div class="detail-tags">
          ${asset.sector ? `<span class="tag">${asset.sector}</span>` : ''}
          ${asset.country ? `<span class="tag">${asset.country}</span>` : ''}
          ${asset.currency ? `<span class="tag">${asset.currency}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="fav-btn ${inWatchlist ? 'active' : ''}" id="favBtn" onclick="toggleFav(${asset.id}, '${asset.symbol}')">
          <svg viewBox="0 0 16 16"><path d="M8 1l2 4 4 .5-3 3 .7 4.5L8 11l-3.7 2 .7-4.5-3-3L6 5z"/></svg>
          ${inWatchlist ? 'Di Watchlist' : 'Tambah Favorit'}
        </button>
        <button class="ai-toggle" onclick="askAI('Analisis aset ${asset.name} (${asset.symbol}). Berikan pandangan fundamental, teknikal, dan risiko investasinya.', '${asset.symbol}')">
          <span class="ai-dot"></span>
          Analisis AI
        </button>
      </div>
    </div>

    <!-- Price -->
    <div class="detail-price-row">
      <div class="detail-price">${fmtPrice(price?.price, asset.currency)}</div>
      <div class="detail-change ${dir}">${pct != null ? fmtPct(pct) : '—'}</div>
      <div style="font-size:11px;font-family:var(--mono);color:var(--dim)">24 jam</div>
    </div>

    <!-- Description -->
    ${asset.description ? `<div class="detail-desc">${asset.description}</div>` : ''}

    <!-- Meta stats -->
    <div class="detail-meta">
      <div class="meta-item">
        <div class="meta-label">HIGH 24H</div>
        <div class="meta-val" style="color:var(--up)">${fmtPrice(price?.high_24h, asset.currency)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">LOW 24H</div>
        <div class="meta-val" style="color:var(--dn)">${fmtPrice(price?.low_24h, asset.currency)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">ATH / 52W HIGH</div>
        <div class="meta-val" style="color:var(--amber)">${fmtPrice(price?.ath, asset.currency)}</div>
        ${price?.ath_date ? `<div style="font-size:9px;color:var(--dim);margin-top:2px">${fmtDate(price.ath_date)}</div>` : ''}
      </div>
      <div class="meta-item">
        <div class="meta-label">ATL / 52W LOW</div>
        <div class="meta-val">${fmtPrice(price?.atl, asset.currency)}</div>
        ${price?.atl_date ? `<div style="font-size:9px;color:var(--dim);margin-top:2px">${fmtDate(price.atl_date)}</div>` : ''}
      </div>
      <div class="meta-item">
        <div class="meta-label">MARKET CAP</div>
        <div class="meta-val">${fmtMktCap(price?.market_cap)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">VOLUME 24H</div>
        <div class="meta-val">${fmtVol(price?.volume_24h)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">HARGA (IDR)</div>
        <div class="meta-val" style="font-size:11px">${price?.price_idr ? 'Rp ' + Math.round(price.price_idr).toLocaleString('id-ID') : '—'}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">DATA TERAKHIR</div>
        <div class="meta-val" style="font-size:10px;color:var(--dim)">${price?.fetched_at ? new Date(price.fetched_at).toLocaleTimeString('id-ID') : '—'}</div>
      </div>
    </div>

    <!-- Price Chart -->
    <div class="panel" style="margin-bottom:14px">
      <div class="panel-head">
        <div>
          <div class="panel-title">Grafik Harga Historis</div>
          <div class="panel-sub">Klik range untuk ubah periode</div>
        </div>
        <div class="chart-range" id="chartRange">
          <button class="range-btn on" data-days="7">7H</button>
          <button class="range-btn" data-days="30">1B</button>
          <button class="range-btn" data-days="90">3B</button>
          <button class="range-btn" data-days="180">6B</button>
          <button class="range-btn" data-days="365">1T</button>
        </div>
      </div>
      <div style="height:220px;position:relative">
        <canvas id="detailChart"></canvas>
      </div>
    </div>

    <!-- AI Quick Questions -->
    <div class="panel">
      <div class="panel-head">
        <div class="panel-title">Pertanyaan Cepat ke AI</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${[
          `Apakah ${asset.symbol} layak dibeli sekarang?`,
          `Analisis teknikal ${asset.symbol} saat ini`,
          `Apa risiko investasi ${asset.name}?`,
          `Prediksi harga ${asset.symbol} jangka pendek`,
          `Bandingkan ${asset.symbol} dengan kompetitornya`,
        ].map(q => `<button class="ai-sug" onclick="window._askAI('${q.replace(/'/g, "\\'")}', '${asset.symbol}')">${q}</button>`).join('')}
      </div>
    </div>

  </div>`;

  // Build chart
  buildPriceChart('detailChart', history, color, 7);

  // Range buttons
  container.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      container.querySelectorAll('.range-btn').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      const days = parseInt(btn.dataset.days);
      try {
        const { history: h } = await api.getHistory(asset.symbol, days);
        buildPriceChart('detailChart', h, color, days);
      } catch {}
    });
  });

  // Fav toggle
  window.toggleFav = async (assetId, sym) => {
    const btn = el('favBtn');
    if (!btn) return;
    const inW = isInWatchlist(assetId);
    if (inW) {
      const item = getWatchlistItem(assetId);
      if (item) { await removeFromWatchlist(item.id, sym); }
      btn.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 1l2 4 4 .5-3 3 .7 4.5L8 11l-3.7 2 .7-4.5-3-3L6 5z"/></svg> Tambah Favorit`;
      btn.classList.remove('active');
    } else {
      const ok = await addToWatchlist(assetId);
      if (ok) {
        btn.innerHTML = `<svg viewBox="0 0 16 16" fill="var(--amber)" stroke="var(--amber)" stroke-width="1"><path d="M8 1l2 4 4 .5-3 3 .7 4.5L8 11l-3.7 2 .7-4.5-3-3L6 5z"/></svg> Di Watchlist`;
        btn.classList.add('active');
      }
    }
  };
}

// ── NEWS ──────────────────────────────────────────────
export async function loadNews(category = null) {
  newsCategory = category;
  showLoading('newsContent', 'Memuat berita...');
  try {
    const { news } = await api.getNews(category, 24);
    renderNews(news);
  } catch (e) {
    el('newsContent').innerHTML = `<div style="padding:30px;text-align:center;color:var(--dn);font-family:var(--mono);font-size:11px">${e.message}</div>`;
  }
}

function renderNews(news) {
  const container = el('newsContent');
  if (!container || !news.length) {
    if (container) container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--dim);font-family:var(--mono);font-size:11px">Belum ada berita terbaru</div>`;
    return;
  }
  container.innerHTML = `<div class="news-grid">` + news.map(n => {
    const sentLabel = { positive:'📈 Positif', negative:'📉 Negatif', neutral:'➡️ Netral' }[n.sentiment] || '';
    const catKey = n.category || 'markets';
    return `
    <div class="news-card" onclick="window._askAI('Analisis berita ini: ${n.title.replace(/'/g,"\\'")}. Apa dampaknya terhadap pasar?')">
      <span class="nc-cat ${catKey}">${(n.category||'markets').toUpperCase()}</span>
      <div class="nc-title">${n.title}</div>
      <div class="nc-summary">${n.summary || ''}</div>
      <div class="nc-meta">
        <span>${n.source}</span>
        ${sentLabel ? `<span class="nc-sent ${n.sentiment}">${sentLabel}</span>` : ''}
      </div>
    </div>`;
  }).join('') + `</div>`;
}

// ── NEWS TICKER ───────────────────────────────────────
export async function loadNewsTicker() {
  try {
    const { news } = await api.getNews(null, 12);
    const wrap = document.getElementById('tickerWrap');
    if (!wrap || !news.length) return;
    const items = news.map(n => `
      <span class="tick-item" onclick="window._askAI('Analisis berita: ${n.title.replace(/'/g,"\\'")}', null)">
        <span class="tick-cat">${(n.category||'news').toUpperCase()}</span>
        <span class="tick-title">${n.title}</span>
        <span style="color:var(--dim);padding:0 4px">·</span>
        <span style="color:var(--dim)">${n.source}</span>
      </span>`).join('');
    wrap.innerHTML = items + items; // duplicate for seamless loop
  } catch {}
}

// ── SEARCH ────────────────────────────────────────────
let searchTimer;
export function initSearch() {
  const input   = document.getElementById('searchInput');
  const results = document.getElementById('searchResults');
  if (!input || !results) return;

  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = input.value.trim();
    if (!q) { results.classList.remove('open'); return; }
    searchTimer = setTimeout(async () => {
      try {
        const assets = await api.searchAssets(q);
        if (!assets.length) { results.classList.remove('open'); return; }
        results.innerHTML = assets.slice(0, 8).map(a => `
          <div class="search-item" data-symbol="${a.symbol}">
            <span class="search-item-sym">${a.symbol}</span>
            <span class="search-item-name">${a.name}</span>
            <span class="search-item-type">${typeLabel(a.type)}</span>
          </div>`).join('');
        results.classList.add('open');
        results.querySelectorAll('.search-item').forEach(item => {
          item.addEventListener('click', () => {
            openAssetDetail(item.dataset.symbol);
            results.classList.remove('open');
            input.value = '';
          });
        });
      } catch {}
    }, 300);
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !results.contains(e.target))
      results.classList.remove('open');
  });
}

export { currentDetailSymbol };
