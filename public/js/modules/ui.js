/**
 * public/js/modules/ui.js
 * Shared UI utilities: toast, formatters, chart helpers, spinners.
 */

// ── TOAST ─────────────────────────────────────────────
let toastTimer;
export function showToast(msg, type = 'ok') {
  let t = document.getElementById('_toast');
  if (!t) { t = document.createElement('div'); t.id = '_toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className   = `toast ${type}`;
  clearTimeout(toastTimer);
  requestAnimationFrame(() => t.classList.add('show'));
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ── FORMATTERS ────────────────────────────────────────
export function fmtPrice(price, currency = 'USD') {
  if (price == null) return '—';
  if (currency === 'IDR') return 'Rp ' + Math.round(price).toLocaleString('id-ID');
  if (price >= 1000)   return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1)      return '$' + price.toFixed(4);
  return '$' + price.toFixed(6);
}

export function fmtPct(pct) {
  if (pct == null) return '—';
  const sign = pct >= 0 ? '▲' : '▼';
  return `${sign} ${Math.abs(pct).toFixed(2)}%`;
}

export function fmtMktCap(n) {
  if (!n) return '—';
  if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6)  return '$' + (n / 1e6).toFixed(2) + 'M';
  return '$' + n.toLocaleString();
}

export function fmtVol(n) {
  if (!n) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toLocaleString();
}

export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' });
}

export function typeLabel(type) {
  return { stock_id:'IDX', stock_us:'US Stock', crypto:'Crypto', commodity:'Komoditas', forex:'Forex', index:'Indeks' }[type] || type;
}

export function typeIcon(type) {
  return { crypto:'₿', stock_id:'📈', stock_us:'🏢', commodity:'🪙', forex:'💱', index:'📊' }[type] || '📊';
}

// ── MINI SPARKLINE (SVG) ───────────────────────────────
export function buildSparkSVG(data, color, w = 60, h = 22) {
  if (!data || data.length < 2) return `<svg width="${w}" height="${h}"></svg>`;
  const vals = data.map(Number).filter(v => !isNaN(v));
  if (vals.length < 2) return `<svg width="${w}" height="${h}"></svg>`;
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

// ── LOADING SPINNER ────────────────────────────────────
export function showLoading(containerId, msg = 'Memuat...') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--dim);font-family:var(--mono);font-size:11px">
    <svg class="spinning" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--teal2)" stroke-width="2" style="margin:0 auto 10px;display:block"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" opacity=".25"/><path d="M21 12a9 9 0 00-9-9"/></svg>
    ${msg}
  </div>`;
}

// ── CHART.JS PRICE CHART ───────────────────────────────
let _priceChart = null;

export function buildPriceChart(canvasId, historyData, color = '#11C4A8', days = 30) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (_priceChart) { _priceChart.destroy(); _priceChart = null; }
  if (!historyData || historyData.length === 0) {
    canvas.parentElement.innerHTML = `<div style="height:220px;display:flex;align-items:center;justify-content:center;color:var(--dim);font-family:var(--mono);font-size:11px">Belum ada data histori</div>`;
    return;
  }
  const labels = historyData.map(d => {
    const dt = new Date(d.date);
    return dt.toLocaleDateString('id-ID', { day:'numeric', month:'short' });
  });
  const prices = historyData.map(d => d.close || d.price || 0);
  const isUp   = prices[prices.length - 1] >= prices[0];
  const c      = isUp ? '#12D19E' : '#F7644A';

  _priceChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: prices, borderColor: c, backgroundColor: c + '18',
        borderWidth: 2, pointRadius: 0, tension: 0.4, fill: true,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0C1B2E', borderColor: 'rgba(11,140,120,.35)', borderWidth: 1,
          titleColor: '#8EAAB8', bodyColor: '#EEF4F6', padding: 10,
          callbacks: { label: ctx => ' $' + ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2 }) },
        },
      },
      scales: {
        x: { ticks:{ color:'#4D7088', font:{ size:9 }, maxTicksLimit:7, autoSkip:true }, grid:{ color:'rgba(11,140,120,.06)' }, border:{ color:'rgba(11,140,120,.1)' } },
        y: { ticks:{ color:'#4D7088', font:{ size:9 }, callback: v => v >= 1000 ? '$'+Math.round(v).toLocaleString() : '$'+v.toFixed(2) }, grid:{ color:'rgba(11,140,120,.06)' }, border:{ color:'rgba(11,140,120,.1)' } },
      },
    },
  });
  return _priceChart;
}

// ── DOM HELPERS ───────────────────────────────────────
export function el(id) { return document.getElementById(id); }
export function qs(sel) { return document.querySelector(sel); }
export function qsa(sel) { return document.querySelectorAll(sel); }

export function setInner(id, html) {
  const e = document.getElementById(id);
  if (e) e.innerHTML = html;
}
