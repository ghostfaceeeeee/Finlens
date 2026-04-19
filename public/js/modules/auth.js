/**
 * public/js/modules/auth.js
 * Modal login/register, state management user.
 */
import { api, setToken, getToken, isLoggedIn } from './api.js';
import { showToast } from './ui.js';

let currentUser = null;
const listeners = [];

export function getUser()    { return currentUser; }
export function onAuthChange(fn) { listeners.push(fn); }
function emit() { listeners.forEach(fn => fn(currentUser)); }

// ── INIT ──────────────────────────────────────────────
export async function initAuth() {
  const token = getToken();
  if (!token) { emit(); return; }
  try {
    const { user } = await api.verify();
    currentUser = user;
  } catch {
    setToken(null);
  }
  emit();
}

// ── LOGOUT ────────────────────────────────────────────
export function logout() {
  setToken(null);
  currentUser = null;
  emit();
  showToast('Berhasil logout', 'ok');
}

// ── AFTER LOGIN/REGISTER ──────────────────────────────
function handleAuthSuccess(data) {
  setToken(data.token);
  currentUser = data.user;
  emit();
  hideModal();
  showToast(data.message || 'Login berhasil!', 'ok');
}

// ── MODAL ─────────────────────────────────────────────
let modalEl = null;

export function showLoginModal(defaultTab = 'login') {
  if (modalEl) modalEl.remove();
  modalEl = document.createElement('div');
  modalEl.className = 'modal-overlay';
  modalEl.innerHTML = buildModal(defaultTab);
  document.body.appendChild(modalEl);
  modalEl.querySelector('.modal-overlay-bg')?.addEventListener('click', hideModal);
  bindModal();
}

export function hideModal() {
  if (modalEl) { modalEl.remove(); modalEl = null; }
}

function buildModal(tab) {
  return `
  <div style="position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:100%">
    <div class="modal-overlay-bg" style="position:absolute;inset:0"></div>
    <div class="modal-box" style="position:relative;z-index:1">
      <div id="modal-login" style="display:${tab==='login'?'block':'none'}">
        <div class="modal-title">Masuk ke <em>FinLens</em></div>
        <div class="modal-sub">Pantau portofolio & analisis AI real-time</div>
        <div class="form-group">
          <label class="form-label">EMAIL</label>
          <input id="li-email" type="email" class="form-input" placeholder="nama@email.com" autocomplete="email">
        </div>
        <div class="form-group">
          <label class="form-label">PASSWORD</label>
          <input id="li-pass" type="password" class="form-input" placeholder="••••••••" autocomplete="current-password">
          <div class="form-error" id="li-err"></div>
        </div>
        <button class="btn btn-primary" id="li-btn">Masuk</button>
        <button class="btn btn-ghost" onclick="document.getElementById('modal-login').style.display='none';document.getElementById('modal-reg').style.display='block'">Daftar akun baru</button>
        <div class="modal-switch">Demo: <strong style="color:var(--teal2)">demo@finlens.id</strong> / <strong style="color:var(--teal2)">demo1234</strong></div>
      </div>
      <div id="modal-reg" style="display:${tab==='register'?'block':'none'}">
        <div class="modal-title">Daftar <em>FinLens</em></div>
        <div class="modal-sub">Buat akun gratis sekarang</div>
        <div class="form-group">
          <label class="form-label">EMAIL</label>
          <input id="rg-email" type="email" class="form-input" placeholder="nama@email.com" autocomplete="email">
        </div>
        <div class="form-group">
          <label class="form-label">USERNAME</label>
          <input id="rg-user" type="text" class="form-input" placeholder="username (3-20 karakter)" autocomplete="username">
        </div>
        <div class="form-group">
          <label class="form-label">PASSWORD</label>
          <input id="rg-pass" type="password" class="form-input" placeholder="Min. 8 karakter" autocomplete="new-password">
          <div class="form-error" id="rg-err"></div>
        </div>
        <button class="btn btn-primary" id="rg-btn">Buat Akun</button>
        <button class="btn btn-ghost" onclick="document.getElementById('modal-reg').style.display='none';document.getElementById('modal-login').style.display='block'">Sudah punya akun? Masuk</button>
      </div>
    </div>
  </div>`;
}

function bindModal() {
  // Login
  const liBtn = modalEl.querySelector('#li-btn');
  liBtn?.addEventListener('click', async () => {
    const email = modalEl.querySelector('#li-email').value.trim();
    const pass  = modalEl.querySelector('#li-pass').value;
    const err   = modalEl.querySelector('#li-err');
    if (!email || !pass) { err.textContent = 'Isi semua field.'; return; }
    liBtn.disabled = true; liBtn.textContent = 'Masuk...';
    try {
      const data = await api.login(email, pass);
      handleAuthSuccess(data);
    } catch (e) {
      err.textContent = e.message;
      liBtn.disabled = false; liBtn.textContent = 'Masuk';
    }
  });

  // Register
  const rgBtn = modalEl.querySelector('#rg-btn');
  rgBtn?.addEventListener('click', async () => {
    const email = modalEl.querySelector('#rg-email').value.trim();
    const user  = modalEl.querySelector('#rg-user').value.trim();
    const pass  = modalEl.querySelector('#rg-pass').value;
    const err   = modalEl.querySelector('#rg-err');
    if (!email || !user || !pass) { err.textContent = 'Isi semua field.'; return; }
    rgBtn.disabled = true; rgBtn.textContent = 'Membuat akun...';
    try {
      const data = await api.register(email, user, pass);
      handleAuthSuccess(data);
    } catch (e) {
      err.textContent = e.message;
      rgBtn.disabled = false; rgBtn.textContent = 'Buat Akun';
    }
  });

  // Enter key
  modalEl.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const liVisible = modalEl.querySelector('#modal-login')?.style.display !== 'none';
    if (liVisible) liBtn?.click(); else rgBtn?.click();
  });

  // Esc
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { hideModal(); document.removeEventListener('keydown', esc); }
  });
}
