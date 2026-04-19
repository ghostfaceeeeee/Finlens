/**
 * public/js/modules/watchlist.js
 * Watchlist (Favorit) CRUD UI.
 */
import { api, isLoggedIn } from './api.js';
import { showToast, fmtPrice, fmtPct, buildSparkSVG } from './ui.js';
import { showLoginModal } from './auth.js';
import { openAssetDetail } from './market.js';

let _list = [];

// ── LOAD ──────────────────────────────────────────────
export async function loadWatchlist() {
  if (!isLoggedIn()) { renderEmpty('Login untuk melihat watchlist Anda.'); return; }
  try {
    const { watchlist } = await api.getWatchlist();
    _list = watchlist || [];
    renderWatchlist();
  } catch (e) {
    renderEmpty('Gagal memuat watchlist: ' + e.message);
  }
}

// ── ADD ───────────────────────────────────────────────
export async function addToWatchlist(assetId, notes = null) {
  if (!isLoggedIn()) { showLoginModal('login'); showToast('Login untuk menambah favorit', 'warn'); return false; }
  try {
    const res = await api.addWatchlist(assetId, notes);
    showToast(res.message || 'Ditambahkan ke watchlist!', 'ok');
    await loadWatchlist();
    return true;
  } catch (e) {
    showToast(e.message || 'Gagal tambah watchlist', 'err');
    return false;
  }
}

// ── REMOVE ───────────────────────────────────────────
export async function removeFromWatchlist(watchlistId, name = '') {
  try {
    await api.removeWatchlist(watchlistId);
    showToast(`${name} dihapus dari watchlist`, 'ok');
    await loadWatchlist();
  } catch (e) {
    showToast(e.message || 'Gagal hapus', 'err');
  }
}

// ── UPDATE NOTES ──────────────────────────────────────
export async function updateWatchlistNotes(watchlistId, notes) {
  try {
    await api.updateNotes(watchlistId, notes);
    showToast('Catatan diperbarui', 'ok');
    await loadWatchlist();
  } catch (e) {
    showToast(e.message || 'Gagal update', 'err');
  }
}

// ── CHECK IF IN WATCHLIST ─────────────────────────────
export function isInWatchlist(assetId) {
  return _list.some(w => w.asset_id === assetId);
}

export function getWatchlistItem(assetId) {
  return _list.find(w => w.asset_id === assetId);
}

// ── RENDER ───────────────────────────────────────────
function renderWatchlist() {
  const container = document.getElementById('watchlistContent');
  if (!container) return;

  if (_list.length === 0) {
    renderEmpty('Belum ada aset favorit.\nCari aset dan klik ⭐ untuk menambahkan.');
    return;
  }

  container.innerHTML = _list.map(w => {
    const pct    = w.change_pct;
    const dir    = pct == null ? '' : pct >= 0 ? 'up' : 'dn';
    const pctStr = pct != null ? fmtPct(pct) : '—';
    const price  = w.price != null ? fmtPrice(w.price, w.currency) : '—';
    return `
    <div class="watch-item" data-wid="${w.id}" data-aid="${w.asset_id}" data-sym="${w.symbol}">
      <div class="wi-sym">${w.symbol}</div>
      <div style="flex:1;min-width:0">
        <div class="wi-name">${w.name}</div>
        ${w.notes ? `<div class="wi-notes">📝 ${w.notes}</div>` : ''}
      </div>
      <div class="wi-price" onclick="event.stopPropagation()">${price}</div>
      <div class="wi-chg ${dir}" onclick="event.stopPropagation()">${pctStr}</div>
      <button class="wi-note-btn icon-btn" title="Edit catatan" onclick="event.stopPropagation(); promptNotes(${w.id}, '${(w.notes||'').replace(/'/g,"\\'")}')">
        <svg viewBox="0 0 16 16"><path d="M12 2l2 2-9 9H3v-2L12 2z"/></svg>
      </button>
      <button class="wi-del" title="Hapus dari watchlist" onclick="event.stopPropagation(); removeFromWatchlist(${w.id},'${w.name}')">
        <svg viewBox="0 0 10 10"><line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/></svg>
      </button>
    </div>`;
  }).join('');

  // Row click → open detail
  container.querySelectorAll('.watch-item').forEach(row => {
    row.addEventListener('click', () => {
      openAssetDetail(row.dataset.sym);
    });
  });

  // Count badge
  const badge = document.getElementById('watchlistBadge');
  if (badge) badge.textContent = _list.length;
}

function renderEmpty(msg) {
  const container = document.getElementById('watchlistContent');
  if (!container) return;
  container.innerHTML = `
    <div class="watchlist-empty">
      <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      <div style="font-size:12px;white-space:pre-line;line-height:1.7">${msg}</div>
    </div>`;
  const badge = document.getElementById('watchlistBadge');
  if (badge) badge.textContent = '0';
}

// ── PROMPT NOTES ──────────────────────────────────────
window.promptNotes = async (watchlistId, currentNotes) => {
  const notes = prompt('Catatan untuk aset ini (kosongkan untuk hapus):', currentNotes || '');
  if (notes === null) return; // user cancel
  await updateWatchlistNotes(watchlistId, notes.trim() || null);
};

window.removeFromWatchlist = removeFromWatchlist;
window.addToWatchlist = addToWatchlist;
