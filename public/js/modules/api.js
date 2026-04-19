/**
 * public/js/modules/api.js
 * HTTP client — semua fetch ke backend dikelola di sini.
 */

const BASE = '/api';

let _token = localStorage.getItem('fl_token') || null;

export function setToken(t)  { _token = t; if (t) localStorage.setItem('fl_token', t); else localStorage.removeItem('fl_token'); }
export function getToken()   { return _token; }
export function isLoggedIn() { return !!_token; }

async function req(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (_token) headers['Authorization'] = 'Bearer ' + _token;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  const data = await r.json().catch(() => ({ error: r.statusText }));
  if (!r.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: r.status, data });
  return data;
}

export const api = {
  // ── AUTH ──
  register: (email, username, password)  => req('POST', '/auth/register', { email, username, password }),
  login:    (email, password)            => req('POST', '/auth/login',    { email, password }),
  verify:   ()                           => req('GET',  '/auth/verify'),
  profile:  ()                           => req('GET',  '/auth/profile'),
  changePassword: (old_password, new_password) => req('PUT', '/auth/password', { old_password, new_password }),

  // ── MARKET ──
  getAssets:        (type)    => req('GET', `/market/assets${type ? '?type='+type : ''}`),
  searchAssets:     (q)       => req('GET', `/market/assets?q=${encodeURIComponent(q)}`),
  getAsset:         (symbol)  => req('GET', `/market/assets/${symbol}`),
  getHistory:       (symbol, days) => req('GET', `/market/assets/${symbol}/history?days=${days}`),
  getPrices:        (symbols) => req('GET', `/market/prices?symbols=${symbols.join(',')}`),
  getNews:          (cat, n)  => req('GET', `/market/news${cat ? '?category='+cat : ''}${n ? (cat ? '&' : '?')+'limit='+n : ''}`),

  // ── WATCHLIST ──
  getWatchlist:    ()              => req('GET',    '/watchlist'),
  addWatchlist:    (asset_id, notes) => req('POST', '/watchlist', { asset_id, notes }),
  removeWatchlist: (id)            => req('DELETE', `/watchlist/${id}`),
  updateNotes:     (id, notes)     => req('PUT',    `/watchlist/${id}`, { notes }),
  reorderWatchlist:(id, order)     => req('PUT',    `/watchlist/${id}/order`, { order }),

  // ── AI ──
  askAI: (question, asset_symbol = null, context = null) =>
    req('POST', '/ai/chat', { question, asset_symbol, context }),

  // ── HEALTH ──
  health: () => req('GET', '/health'),
};
