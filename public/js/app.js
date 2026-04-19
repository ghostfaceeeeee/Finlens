/**
 * public/js/app.js — FinLens Orchestrator (rewritten clean)
 * Tidak ada window.onclick. Semua event binding di sini.
 */
import { api, isLoggedIn, getToken, setToken } from './modules/api.js';
import { showToast, fmtPrice, fmtPct, fmtMktCap, fmtVol, fmtDate,
         typeLabel, typeIcon, buildSparkSVG, buildPriceChart, showLoading } from './modules/ui.js';

// ─── STATE ────────────────────────────────────────────
let currentPage    = 'home';
let currentFilter  = '';     // tipe aset: crypto, stock_id, dll
let currentSymbol  = null;   // untuk AI context
let viewMode       = 'grid';
let aiOpen         = false;
let aiLoading      = false;
let currentUser    = null;
let allAssets      = [];     // cache semua aset

// ─── INIT ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupClock();
  bindNav();
  bindSearch();
  bindAI();
  bindMarketChips();
  bindNewsChips();
  bindViewToggle();
  bindMisc();
  await initAuth();
  gotoPage('home', '');
  loadTicker();
  connectSSE();
});

// ─── AUTH ─────────────────────────────────────────────
async function initAuth() {
  const token = getToken();
  if (!token) return;
  try {
    const { user } = await api.verify();
    currentUser = user;
    updateUserUI(user);
    loadWatchlist();
  } catch {
    setToken(null);
    updateUserUI(null);
  }
}

function updateUserUI(user) {
  const av    = document.getElementById('sideAvatar');
  const name  = document.getElementById('sideUsername');
  const role  = document.getElementById('sideRole');
  const loginBtn  = document.getElementById('sideLoginBtn');
  const logoutBtn = document.getElementById('sideLogoutBtn');
  if (user) {
    if (av)   { av.textContent = user.username[0].toUpperCase(); av.style.background = user.avatar_color || '#11C4A8'; }
    if (name) name.textContent = user.username;
    if (role) role.textContent = user.role === 'admin' ? 'Administrator' : 'Member';
    if (loginBtn)  loginBtn.style.display  = 'none';
    if (logoutBtn) logoutBtn.style.display = 'block';
  } else {
    if (av)   { av.textContent = '?'; av.style.background = '#4D7088'; }
    if (name) name.textContent = 'Tamu';
    if (role) role.textContent = 'Belum login';
    if (loginBtn)  loginBtn.style.display  = 'block';
    if (logoutBtn) logoutBtn.style.display = 'none';
  }
}

function showAuthModal(tab = 'login') {
  document.getElementById('_authModal')?.remove();
  const el = document.createElement('div');
  el.id = '_authModal';
  el.className = 'modal-overlay';
  el.innerHTML = `
  <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center">
    <div style="position:absolute;inset:0" id="_modalBg"></div>
    <div class="modal-box" style="position:relative;z-index:1">
      <div id="_tabLogin" style="display:${tab==='login'?'block':'none'}">
        <div class="modal-title">Masuk ke <em>FinLens</em></div>
        <div class="modal-sub">Akses watchlist & AI analisis real-time</div>
        <div class="form-group"><label class="form-label">EMAIL</label>
          <input id="_liEmail" type="email" class="form-input" placeholder="nama@email.com" autocomplete="email">
        </div>
        <div class="form-group"><label class="form-label">PASSWORD</label>
          <input id="_liPass" type="password" class="form-input" placeholder="••••••••">
          <div class="form-error" id="_liErr"></div>
        </div>
        <button class="btn btn-primary" id="_liBtn">Masuk</button>
        <button class="btn btn-ghost" id="_toReg">Belum punya akun? Daftar</button>
        <div class="modal-switch" style="margin-top:10px">Demo: <strong style="color:var(--teal2)">demo@finlens.id</strong> / <strong style="color:var(--teal2)">demo1234</strong></div>
      </div>
      <div id="_tabReg" style="display:${tab==='register'?'block':'none'}">
        <div class="modal-title">Daftar <em>FinLens</em></div>
        <div class="modal-sub">Buat akun gratis sekarang</div>
        <div class="form-group"><label class="form-label">EMAIL</label>
          <input id="_rgEmail" type="email" class="form-input" placeholder="nama@email.com" autocomplete="email">
        </div>
        <div class="form-group"><label class="form-label">USERNAME</label>
          <input id="_rgUser" type="text" class="form-input" placeholder="username (3-20 karakter)">
        </div>
        <div class="form-group"><label class="form-label">PASSWORD</label>
          <input id="_rgPass" type="password" class="form-input" placeholder="Min. 8 karakter">
          <div class="form-error" id="_rgErr"></div>
        </div>
        <button class="btn btn-primary" id="_rgBtn">Buat Akun</button>
        <button class="btn btn-ghost" id="_toLogin">Sudah punya akun? Masuk</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(el);

  // Bind modal buttons
  el.querySelector('#_modalBg').onclick = () => el.remove();
  el.querySelector('#_toReg')?.addEventListener('click', () => { document.getElementById('_tabLogin').style.display='none'; document.getElementById('_tabReg').style.display='block'; });
  el.querySelector('#_toLogin')?.addEventListener('click', () => { document.getElementById('_tabReg').style.display='none'; document.getElementById('_tabLogin').style.display='block'; });

  el.querySelector('#_liBtn')?.addEventListener('click', async () => {
    const email = el.querySelector('#_liEmail').value.trim();
    const pass  = el.querySelector('#_liPass').value;
    const errEl = el.querySelector('#_liErr');
    const btn   = el.querySelector('#_liBtn');
    if (!email || !pass) { errEl.textContent = 'Isi semua field.'; return; }
    btn.disabled = true; btn.textContent = 'Masuk...';
    try {
      const data = await api.login(email, pass);
      setToken(data.token); currentUser = data.user;
      updateUserUI(data.user); el.remove();
      showToast(`Selamat datang, ${data.user.username}!`, 'ok');
      loadWatchlist();
    } catch(e) { errEl.textContent = e.message; btn.disabled=false; btn.textContent='Masuk'; }
  });

  el.querySelector('#_rgBtn')?.addEventListener('click', async () => {
    const email = el.querySelector('#_rgEmail').value.trim();
    const user  = el.querySelector('#_rgUser').value.trim();
    const pass  = el.querySelector('#_rgPass').value;
    const errEl = el.querySelector('#_rgErr');
    const btn   = el.querySelector('#_rgBtn');
    if (!email || !user || !pass) { errEl.textContent = 'Isi semua field.'; return; }
    btn.disabled = true; btn.textContent = 'Mendaftar...';
    try {
      const data = await api.register(email, user, pass);
      setToken(data.token); currentUser = data.user;
      updateUserUI(data.user); el.remove();
      showToast('Registrasi berhasil!', 'ok');
      loadWatchlist();
    } catch(e) { errEl.textContent = e.message; btn.disabled=false; btn.textContent='Buat Akun'; }
  });

  // Enter key
  el.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const loginVisible = document.getElementById('_tabLogin')?.style.display !== 'none';
    if (loginVisible) el.querySelector('#_liBtn')?.click();
    else el.querySelector('#_rgBtn')?.click();
  });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { el.remove(); document.removeEventListener('keydown', esc); }
  }, { once: true });
}

function logout() {
  setToken(null); currentUser = null;
  updateUserUI(null);
  document.getElementById('watchlistBadge').textContent = '0';
  document.getElementById('watchlistContent').innerHTML = '<div style="text-align:center;padding:30px;color:var(--dim);font-family:var(--mono);font-size:11px">Login untuk melihat watchlist.</div>';
  showToast('Berhasil logout', 'ok');
}

// ─── NAVIGATION ───────────────────────────────────────
function gotoPage(page, type = '') {
  currentPage   = page;
  currentFilter = type;

  // Hide all pages, show target
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');

  // Active nav
  document.querySelectorAll('[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page && el.dataset.type === type);
  });

  // Title
  const titles = {
    home: '<em>FinLens</em> Dashboard', market: 'Pasar <em>Keuangan</em>',
    detail: 'Detail <em>Aset</em>', news: 'Berita <em>Pasar</em>',
    watchlist: 'Watchlist <em>Saya</em>',
  };
  document.getElementById('ptitle').innerHTML = titles[page] || '';

  // Scroll to top
  document.getElementById('pageScroll').scrollTop = 0;
  closeSidebar();

  // Load data
  if (page === 'home')      loadHome();
  if (page === 'market')    loadMarket(type);
  if (page === 'news')      loadNews('');
  if (page === 'watchlist') loadWatchlist();
}

function bindNav() {
  // Sidebar nav items
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => gotoPage(el.dataset.page, el.dataset.type || ''));
  });
  // Login / Logout
  document.getElementById('sideLoginBtn')?.addEventListener('click',  () => showAuthModal('login'));
  document.getElementById('sideLogoutBtn')?.addEventListener('click', logout);
  // Hero buttons
  document.getElementById('heroMarketBtn')?.addEventListener('click', () => gotoPage('market', ''));
  document.getElementById('heroRegisterBtn')?.addEventListener('click', () => showAuthModal('register'));
  document.getElementById('seeAllBtn')?.addEventListener('click',   () => gotoPage('market', ''));
  document.getElementById('aiFeatureCard')?.addEventListener('click', toggleAI);
  // Hamburger
  document.getElementById('hamburger')?.addEventListener('click', toggleSidebar);
  document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);
  // Refresh
  document.getElementById('refreshBtn')?.addEventListener('click', doRefresh);
}

function toggleSidebar() {
  const s = document.getElementById('sidebar');
  const ov = document.getElementById('sidebarOverlay');
  const open = s.classList.toggle('open');
  ov.style.display = open ? 'block' : 'none';
}
function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay').style.display = 'none';
}

// ─── MARKET CHIPS ────────────────────────────────────
function bindMarketChips() {
  document.getElementById('marketChips')?.addEventListener('click', e => {
    const chip = e.target.closest('[data-filter]');
    if (!chip) return;
    document.querySelectorAll('#marketChips .chip').forEach(c => c.classList.remove('on'));
    chip.classList.add('on');
    currentFilter = chip.dataset.filter;
    loadMarket(currentFilter);
  });
  document.getElementById('vt-grid')?.addEventListener('click', () => { viewMode='grid'; document.getElementById('vt-grid').classList.add('on'); document.getElementById('vt-table').classList.remove('on'); renderAssets(allAssets); });
  document.getElementById('vt-table')?.addEventListener('click', () => { viewMode='table'; document.getElementById('vt-table').classList.add('on'); document.getElementById('vt-grid').classList.remove('on'); renderAssets(allAssets); });
}

// ─── NEWS CHIPS ──────────────────────────────────────
function bindNewsChips() {
  document.getElementById('newsChips')?.addEventListener('click', e => {
    const chip = e.target.closest('[data-cat]');
    if (!chip) return;
    document.querySelectorAll('#newsChips .chip').forEach(c => c.classList.remove('on'));
    chip.classList.add('on');
    loadNews(chip.dataset.cat);
  });
}

// ─── VIEW TOGGLE ─────────────────────────────────────
function bindViewToggle() {
  // already bound in bindMarketChips above
}

// ─── MISC BINDINGS ───────────────────────────────────
function bindMisc() {
  // Feature cards on home page
  document.querySelectorAll('.nav-item-trigger').forEach(el => {
    el.addEventListener('click', () => gotoPage(el.dataset.page, el.dataset.type || ''));
  });
}

// ─── LOAD HOME ───────────────────────────────────────
async function loadHome() {
  const el = document.getElementById('homeSummary');
  if (!el) return;
  el.innerHTML = `<div style="text-align:center;padding:30px;color:var(--dim);font-family:var(--mono);font-size:11px">Memuat...</div>`;
  try {
    const assets = await api.getAssets('');
    // show top 8 mixed
    const featured = [
      ...assets.filter(a => a.type==='crypto').slice(0,3),
      ...assets.filter(a => a.type==='stock_id').slice(0,2),
      ...assets.filter(a => a.type==='stock_us').slice(0,2),
      ...assets.filter(a => a.type==='commodity').slice(0,1),
    ].slice(0, 8);
    if (!featured.length) { el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--dim);font-size:11px">Tidak ada data — pastikan seed sudah dijalankan: <code>npm run seed</code></div>`; return; }
    el.innerHTML = renderGrid(featured);
    el.querySelectorAll('[data-symbol]').forEach(card => {
      card.addEventListener('click', () => openDetail(card.dataset.symbol));
    });
  } catch(e) {
    el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--dn);font-family:var(--mono);font-size:11px">Gagal memuat: ${e.message}</div>`;
  }
}

// ─── LOAD MARKET ─────────────────────────────────────
async function loadMarket(type = '') {
  const container = document.getElementById('marketContent');
  if (!container) return;
  container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--dim);font-family:var(--mono);font-size:11px">Memuat aset...</div>`;

  // Sync chip UI
  document.querySelectorAll('#marketChips .chip').forEach(c => {
    c.classList.toggle('on', c.dataset.filter === type);
  });

  try {
    const assets = await api.getAssets(type || '');
    allAssets = assets;
    if (!assets.length) {
      container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--dim);font-family:var(--mono);font-size:11px">Tidak ada aset${type ? ' untuk kategori ini' : ''}.<br>Jalankan <code>npm run seed</code> untuk mengisi data.</div>`;
      return;
    }
    renderAssets(assets);
  } catch(e) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--dn);font-family:var(--mono);font-size:11px">Gagal memuat: ${e.message}<br><small style="color:var(--dim)">Pastikan server berjalan: npm run dev</small></div>`;
  }
}

function renderAssets(assets) {
  const container = document.getElementById('marketContent');
  if (!container || !assets) return;
  container.innerHTML = viewMode === 'grid' ? renderGrid(assets) : renderTable(assets);
  container.querySelectorAll('[data-symbol]').forEach(el => {
    el.addEventListener('click', () => openDetail(el.dataset.symbol));
  });
}

const TYPE_COLORS = { crypto:'#F5A623', stock_id:'#11C4A8', stock_us:'#5B8AF5', commodity:'#A78BFA', forex:'#34D399', index:'#F472B6' };

function renderGrid(assets) {
  return `<div class="asset-grid">` + assets.map(a => {
    const pct = a.change_pct;
    const dir = pct == null ? '' : pct >= 0 ? 'up' : 'dn';
    const col = TYPE_COLORS[a.type] || '#8EAAB8';
    const sc  = dir==='up'?'#12D19E': dir==='dn'?'#F7644A':'#8EAAB8';
    const sp  = Array.from({length:10},(_,i)=>(a.price||100)*(1+Math.sin(i*.9+(a.id||1))*.04));
    return `<div class="asset-card ${dir}" data-symbol="${a.symbol}" title="${a.name}">
      <div class="ac-header"><span class="ac-sym">${a.symbol}</span><span class="ac-type" style="color:${col}">${typeLabel(a.type)}</span></div>
      <div class="ac-name">${a.name}</div>
      <div class="ac-price" style="color:${a.price?'var(--off)':'var(--dim)'}">${fmtPrice(a.price, a.currency)}</div>
      <div class="ac-change ${dir}">${pct!=null?fmtPct(pct):'—'}</div>
      <div class="mini-spark">${buildSparkSVG(sp,sc,120,26)}</div>
    </div>`;
  }).join('') + `</div>`;
}

function renderTable(assets) {
  return `<div style="overflow-x:auto"><table class="asset-table">
    <thead><tr>
      <th>Aset</th><th class="right">Harga</th><th class="right">24h %</th>
      <th class="right hide-mobile">High 24h</th><th class="right hide-mobile">Low 24h</th>
      <th class="right hide-mobile">Market Cap</th><th class="right hide-mobile">Volume</th>
      <th class="right">Trend</th>
    </tr></thead><tbody>`
    + assets.map(a => {
      const pct = a.change_pct, dir = pct==null?'':pct>=0?'up':'dn';
      const sp  = Array.from({length:8},(_,i)=>(a.price||100)*(1+Math.sin(i*.9+(a.id||1))*.04));
      return `<tr data-symbol="${a.symbol}">
        <td><div class="at-sym">${a.symbol}</div><div class="at-name">${a.name}</div></td>
        <td class="right at-price">${fmtPrice(a.price, a.currency)}</td>
        <td class="right at-chg ${dir}">${pct!=null?fmtPct(pct):'—'}</td>
        <td class="right at-mcap hide-mobile" style="color:var(--up)">${fmtPrice(a.high_24h,a.currency)}</td>
        <td class="right at-mcap hide-mobile" style="color:var(--dn)">${fmtPrice(a.low_24h,a.currency)}</td>
        <td class="right at-mcap hide-mobile">${fmtMktCap(a.market_cap)}</td>
        <td class="right at-mcap hide-mobile">${fmtVol(a.volume_24h)}</td>
        <td class="right">${buildSparkSVG(sp,dir==='up'?'#12D19E':'#F7644A',52,20)}</td>
      </tr>`;
    }).join('') + `</tbody></table></div>`;
}

// ─── ASSET DETAIL ────────────────────────────────────
async function openDetail(symbol) {
  currentSymbol = symbol;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-detail')?.classList.add('active');
  document.getElementById('ptitle').innerHTML = 'Detail <em>Aset</em>';
  document.getElementById('pageScroll').scrollTop = 0;

  const container = document.getElementById('detailContent');
  container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--dim);font-family:var(--mono);font-size:11px">Memuat detail...</div>`;

  try {
    const { asset, price, history, in_watchlist } = await api.getAsset(symbol);
    const pct = price?.change_pct;
    const dir = pct==null?'':pct>=0?'up':'dn';
    const col = TYPE_COLORS[asset.type]||'#8EAAB8';

    container.innerHTML = `<div class="content">
      <button id="backBtn" style="display:flex;align-items:center;gap:5px;background:var(--bg3);border:1px solid var(--line);border-radius:var(--r8);padding:5px 12px;font-size:11px;font-family:var(--mono);color:var(--dim);cursor:pointer;margin-bottom:14px;transition:.15s">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 2L3 5l4 3"/></svg>Kembali
      </button>

      <div class="detail-header">
        <div class="detail-icon">${typeIcon(asset.type)}</div>
        <div class="detail-title">
          <div class="detail-sym" style="color:${col}">${asset.symbol} · ${typeLabel(asset.type)}${asset.exchange?' · '+asset.exchange:''}</div>
          <div class="detail-name">${asset.name}</div>
          <div class="detail-tags">
            ${asset.sector?`<span class="tag">${asset.sector}</span>`:''}
            ${asset.country?`<span class="tag">${asset.country}</span>`:''}
            ${asset.currency?`<span class="tag">${asset.currency}</span>`:''}
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <button id="favBtn" class="fav-btn ${in_watchlist?'active':''}">
            <svg viewBox="0 0 16 16"><path d="M8 1l2 4 4 .5-3 3 .7 4.5L8 11l-3.7 2 .7-4.5-3-3L6 5z"/></svg>
            ${in_watchlist?'Di Watchlist':'+ Favorit'}
          </button>
          <button id="aiAskBtn" class="ai-toggle" style="height:32px">
            <span class="ai-dot"></span>Analisis AI
          </button>
        </div>
      </div>

      <div class="detail-price-row">
        <div class="detail-price">${fmtPrice(price?.price, asset.currency)}</div>
        <div class="detail-change ${dir}">${pct!=null?fmtPct(pct):'—'}</div>
        <span style="font-size:10px;font-family:var(--mono);color:var(--dim)">24j</span>
      </div>

      ${asset.description?`<div class="detail-desc">${asset.description}</div>`:''}

      <div class="detail-meta">
        <div class="meta-item"><div class="meta-label">HIGH 24H</div><div class="meta-val" style="color:var(--up)">${fmtPrice(price?.high_24h,asset.currency)}</div></div>
        <div class="meta-item"><div class="meta-label">LOW 24H</div><div class="meta-val" style="color:var(--dn)">${fmtPrice(price?.low_24h,asset.currency)}</div></div>
        <div class="meta-item"><div class="meta-label">ATH / 52W HIGH</div><div class="meta-val" style="color:var(--amber)">${fmtPrice(price?.ath,asset.currency)}</div>${price?.ath_date?`<div style="font-size:9px;color:var(--dim);margin-top:2px">${fmtDate(price.ath_date)}</div>`:''}</div>
        <div class="meta-item"><div class="meta-label">ATL / 52W LOW</div><div class="meta-val">${fmtPrice(price?.atl,asset.currency)}</div></div>
        <div class="meta-item"><div class="meta-label">MARKET CAP</div><div class="meta-val">${fmtMktCap(price?.market_cap)}</div></div>
        <div class="meta-item"><div class="meta-label">VOLUME 24H</div><div class="meta-val">${fmtVol(price?.volume_24h)}</div></div>
        <div class="meta-item"><div class="meta-label">HARGA IDR</div><div class="meta-val" style="font-size:11px">${price?.price_idr?'Rp '+Math.round(price.price_idr).toLocaleString('id-ID'):'—'}</div></div>
        <div class="meta-item"><div class="meta-label">UPDATE</div><div class="meta-val" style="font-size:10px;color:var(--dim)">${price?.fetched_at?new Date(price.fetched_at).toLocaleTimeString('id-ID'):'—'}</div></div>
      </div>

      <div class="panel" style="margin-bottom:14px">
        <div class="panel-head">
          <div><div class="panel-title">Grafik Harga Historis</div><div class="panel-sub">Data dari database lokal</div></div>
          <div class="chart-range" id="chartRange" style="display:flex;gap:3px">
            <button class="range-btn on" data-days="7">7H</button>
            <button class="range-btn" data-days="30">1B</button>
            <button class="range-btn" data-days="90">3B</button>
            <button class="range-btn" data-days="365">1T</button>
          </div>
        </div>
        <div style="height:220px;position:relative"><canvas id="detailChart"></canvas></div>
      </div>

      <div class="panel">
        <div class="panel-head"><div class="panel-title">Pertanyaan Cepat ke AI</div></div>
        <div style="display:flex;flex-wrap:wrap;gap:6px" id="aiQuickBtns">
          <span class="ai-sug" data-q="Apakah ${asset.symbol} layak dibeli sekarang?">Layak beli sekarang?</span>
          <span class="ai-sug" data-q="Analisis teknikal ${asset.symbol} saat ini">Analisis teknikal</span>
          <span class="ai-sug" data-q="Apa risiko investasi ${asset.name}?">Risiko investasi</span>
          <span class="ai-sug" data-q="Prediksi harga ${asset.symbol} jangka pendek">Prediksi harga</span>
        </div>
      </div>
    </div>`;

    // Build chart
    buildPriceChart('detailChart', history, col, 7);

    // Chart range buttons
    container.querySelectorAll('.range-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        container.querySelectorAll('.range-btn').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        try {
          const { history: h } = await api.getHistory(asset.symbol, parseInt(btn.dataset.days));
          buildPriceChart('detailChart', h, col, parseInt(btn.dataset.days));
        } catch {}
      });
    });

    // Back button
    container.querySelector('#backBtn')?.addEventListener('click', () => gotoPage('market', currentFilter));

    // AI quick buttons
    container.querySelectorAll('#aiQuickBtns .ai-sug').forEach(btn => {
      btn.addEventListener('click', () => sendAIMessage(btn.dataset.q, asset.symbol));
    });

    // AI Ask button
    container.querySelector('#aiAskBtn')?.addEventListener('click', () => {
      sendAIMessage(`Analisis mendalam ${asset.name} (${asset.symbol}): fundamental, teknikal, sentimen, dan risiko investasi.`, asset.symbol);
    });

    // Fav button
    container.querySelector('#favBtn')?.addEventListener('click', async () => {
      if (!currentUser) { showAuthModal('login'); showToast('Login untuk menambah favorit', 'warn'); return; }
      const btn = container.querySelector('#favBtn');
      if (in_watchlist) {
        try {
          const { watchlist } = await api.getWatchlist();
          const item = watchlist.find(w => w.symbol === asset.symbol);
          if (item) { await api.removeWatchlist(item.id); btn.textContent = '+ Favorit'; btn.classList.remove('active'); showToast('Dihapus dari watchlist', 'ok'); }
        } catch(e) { showToast(e.message, 'err'); }
      } else {
        try {
          await api.addWatchlist(asset.id);
          btn.innerHTML = `<svg viewBox="0 0 16 16"><path d="M8 1l2 4 4 .5-3 3 .7 4.5L8 11l-3.7 2 .7-4.5-3-3L6 5z" fill="var(--amber)" stroke="var(--amber)"/></svg> Di Watchlist`;
          btn.classList.add('active'); showToast(`${asset.name} ditambahkan!`, 'ok');
          loadWatchlist();
        } catch(e) { showToast(e.message, 'err'); }
      }
    });

  } catch(e) {
    container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--dn);font-size:12px">${e.message}</div>`;
  }
}

// ─── NEWS ─────────────────────────────────────────────
async function loadNews(cat = '') {
  const container = document.getElementById('newsContent');
  if (!container) return;
  container.innerHTML = `<div style="text-align:center;padding:30px;color:var(--dim);font-family:var(--mono);font-size:11px">Memuat berita...</div>`;
  try {
    const { news } = await api.getNews(cat, 24);
    if (!news.length) { container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--dim);font-family:var(--mono);font-size:11px">Belum ada berita.</div>`; return; }
    container.innerHTML = `<div class="news-grid">` + news.map(n => {
      const catKey = n.category || 'markets';
      return `<div class="news-card" data-q="Analisis berita: ${n.title.replace(/"/g,"'")}. Dampak terhadap pasar?">
        <span class="nc-cat ${catKey}">${(n.category||'news').toUpperCase()}</span>
        <div class="nc-title">${n.title}</div>
        <div class="nc-summary">${n.summary||''}</div>
        <div class="nc-meta"><span>${n.source}</span>${n.sentiment?`<span class="nc-sent ${n.sentiment}">${{positive:'📈 Positif',negative:'📉 Negatif',neutral:'➡️ Netral'}[n.sentiment]||''}</span>`:''}</div>
      </div>`;
    }).join('') + `</div>`;
    container.querySelectorAll('.news-card').forEach(card => {
      card.addEventListener('click', () => sendAIMessage(card.dataset.q, null));
    });
  } catch(e) {
    container.innerHTML = `<div style="padding:30px;text-align:center;color:var(--dn);font-size:11px">${e.message}</div>`;
  }
}

// ─── WATCHLIST ────────────────────────────────────────
async function loadWatchlist() {
  const container = document.getElementById('watchlistContent');
  const badge = document.getElementById('watchlistBadge');
  if (!container) return;
  if (!currentUser) {
    container.innerHTML = `<div style="text-align:center;padding:30px;color:var(--dim);font-family:var(--mono);font-size:11px">Login untuk melihat watchlist Anda.</div>`;
    if (badge) badge.textContent = '0';
    return;
  }
  try {
    const { watchlist, count } = await api.getWatchlist();
    if (badge) badge.textContent = count || '0';
    if (!watchlist.length) {
      container.innerHTML = `<div style="text-align:center;padding:30px;color:var(--dim);font-family:var(--mono);font-size:11px">Belum ada aset favorit.<br>Klik ⭐ di halaman detail aset.</div>`;
      return;
    }
    container.innerHTML = watchlist.map(w => {
      const pct = w.change_pct, dir = pct==null?'':pct>=0?'up':'dn';
      return `<div class="watch-item" data-sym="${w.symbol}" data-wid="${w.id}">
        <div class="wi-sym">${w.symbol}</div>
        <div style="flex:1;min-width:0">
          <div class="wi-name">${w.name}</div>
          ${w.notes?`<div class="wi-notes">📝 ${w.notes}</div>`:''}
        </div>
        <div class="wi-price">${w.price!=null?fmtPrice(w.price,w.currency):'—'}</div>
        <div class="wi-chg ${dir}">${pct!=null?fmtPct(pct):'—'}</div>
        <button class="wi-del" data-wid="${w.id}" data-name="${w.name}" title="Hapus">
          <svg viewBox="0 0 10 10"><line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/></svg>
        </button>
      </div>`;
    }).join('');
    // Events
    container.querySelectorAll('.watch-item').forEach(row => {
      row.addEventListener('click', e => { if (!e.target.closest('.wi-del')) openDetail(row.dataset.sym); });
    });
    container.querySelectorAll('.wi-del').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        try { await api.removeWatchlist(btn.dataset.wid); showToast(`${btn.dataset.name} dihapus`, 'ok'); loadWatchlist(); } catch(e) { showToast(e.message,'err'); }
      });
    });
  } catch(e) {
    container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--dn);font-size:11px">${e.message}</div>`;
  }
}

// ─── TICKER ───────────────────────────────────────────
async function loadTicker() {
  try {
    const { news } = await api.getNews('', 12);
    if (!news.length) return;
    const wrap = document.getElementById('tickerWrap');
    const items = news.map(n => `<span class="tick-item" data-q="Analisis berita: ${n.title.replace(/"/g,"'")}"><span class="tick-cat">${(n.category||'news').toUpperCase()}</span><span class="tick-title">${n.title}</span><span style="color:var(--dim);padding:0 6px">·</span><span style="color:var(--dim);font-size:9px">${n.source}</span></span>`).join('');
    wrap.innerHTML = items + items;
    wrap.querySelectorAll('.tick-item').forEach(item => {
      item.addEventListener('click', () => sendAIMessage(item.dataset.q, null));
    });
  } catch {}
}

// ─── AI PANEL ─────────────────────────────────────────
function toggleAI() {
  if (!currentUser) { showAuthModal('login'); showToast('Login untuk menggunakan AI Analisis', 'warn'); return; }
  aiOpen = !aiOpen;
  document.getElementById('aiPanel').classList.toggle('open', aiOpen);
  document.getElementById('aiToggle').classList.toggle('open', aiOpen);
}

function bindAI() {
  document.getElementById('aiToggle')?.addEventListener('click', toggleAI);
  document.getElementById('aiClose')?.addEventListener('click', toggleAI);
  document.getElementById('aiSendBtn')?.addEventListener('click', () => {
    const inp = document.getElementById('aiInput');
    const q = inp.value.trim();
    if (!q) return;
    inp.value = ''; inp.style.height = '';
    sendAIMessage(q, currentSymbol);
  });
  document.getElementById('aiInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('aiSendBtn').click(); }
  });
  document.getElementById('aiSugs')?.addEventListener('click', e => {
    const sug = e.target.closest('[data-q]');
    if (sug) sendAIMessage(sug.dataset.q, currentSymbol);
  });
}

async function sendAIMessage(question, symbol = null) {
  if (!currentUser) { showAuthModal('login'); return; }
  if (aiLoading) return;
  if (!aiOpen) toggleAI();

  // hide suggestions
  const sugs = document.getElementById('aiSugs');
  if (sugs) sugs.style.display = 'none';

  appendAIMsg('user', question);
  const thinking = appendAIThinking();
  aiLoading = true;

  try {
    const { answer } = await api.askAI(question, symbol || currentSymbol);
    thinking.remove();
    appendAIMsg('assistant', answer);
  } catch(e) {
    thinking.remove();
    const msg = e.status === 503
      ? '⚙️ AI belum dikonfigurasi. Tambahkan ANTHROPIC_API_KEY di file .env lalu restart server.'
      : '⚠️ ' + (e.message || 'Gagal mendapat respons AI.');
    appendAIMsg('assistant', msg);
  } finally { aiLoading = false; }
}

function appendAIMsg(role, text) {
  const msgs = document.getElementById('aiMsgs');
  if (!msgs) return null;
  const d = document.createElement('div');
  d.className = 'ai-msg ' + role;
  d.innerHTML = text.replace(/\n/g,'<br>').replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
  return d;
}
function appendAIThinking() {
  const msgs = document.getElementById('aiMsgs');
  const d = document.createElement('div');
  d.className = 'ai-msg thinking';
  d.innerHTML = 'Menganalisis <span class="think-dots"><span></span><span></span><span></span></span>';
  msgs?.appendChild(d);
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
  return d;
}

// ─── SEARCH ───────────────────────────────────────────
function bindSearch() {
  const inp = document.getElementById('searchInput');
  const res = document.getElementById('searchResults');
  if (!inp || !res) return;
  let timer;
  inp.addEventListener('input', () => {
    clearTimeout(timer);
    const q = inp.value.trim();
    if (!q) { res.classList.remove('open'); return; }
    timer = setTimeout(async () => {
      try {
        const assets = await api.searchAssets(q);
        if (!assets.length) { res.classList.remove('open'); return; }
        res.innerHTML = assets.slice(0,8).map(a => `
          <div class="search-item" data-symbol="${a.symbol}">
            <span class="search-item-sym">${a.symbol}</span>
            <span class="search-item-name">${a.name}</span>
            <span class="search-item-type">${typeLabel(a.type)}</span>
          </div>`).join('');
        res.classList.add('open');
        res.querySelectorAll('.search-item').forEach(item => {
          item.addEventListener('click', () => { openDetail(item.dataset.symbol); res.classList.remove('open'); inp.value = ''; });
        });
      } catch {}
    }, 280);
  });
  document.addEventListener('click', e => { if (!inp.contains(e.target) && !res.contains(e.target)) res.classList.remove('open'); });
}

// ─── SSE ──────────────────────────────────────────────
function connectSSE() {
  const src = new EventSource('/api/events');
  src.addEventListener('connected', () => document.querySelectorAll('.sse-dot').forEach(d => d.classList.add('ok')));
  src.addEventListener('price_update', () => {
    if (currentPage === 'market') loadMarket(currentFilter);
    else if (currentPage === 'home') loadHome();
    else if (currentPage === 'watchlist') loadWatchlist();
  });
  src.onerror = () => document.querySelectorAll('.sse-dot').forEach(d => d.classList.remove('ok'));
}

// ─── CLOCK ────────────────────────────────────────────
function setupClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  const t = () => el.textContent = new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+' WIB';
  t(); setInterval(t, 1000);
}

// ─── REFRESH ──────────────────────────────────────────
async function doRefresh() {
  const btn = document.getElementById('refreshBtn');
  btn?.querySelector('svg')?.classList.add('spinning');
  await loadTicker();
  if (currentPage === 'market') await loadMarket(currentFilter);
  else if (currentPage === 'home') await loadHome();
  else if (currentPage === 'news') await loadNews('');
  else if (currentPage === 'watchlist') await loadWatchlist();
  showToast('Data diperbarui ✓', 'ok');
  setTimeout(() => btn?.querySelector('svg')?.classList.remove('spinning'), 800);
}
