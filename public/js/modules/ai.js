/**
 * public/js/modules/ai.js
 * AI chat panel — calls /api/ai/chat (server proxy).
 */
import { api, isLoggedIn } from './api.js';
import { showToast } from './ui.js';
import { showLoginModal } from './auth.js';

let open = false;
let loading = false;
let sugHidden = false;
let currentSymbol = null;

export function setAIContext(symbol) { currentSymbol = symbol; }

export function toggleAI() {
  if (!isLoggedIn()) { showLoginModal('login'); showToast('Login untuk menggunakan AI Analisis', 'warn'); return; }
  open = !open;
  document.getElementById('aiPanel')?.classList.toggle('open', open);
  document.getElementById('aiToggle')?.classList.toggle('open', open);
}

export function openAI() { if (!open) toggleAI(); }

export function askAI(question, symbol = null) {
  if (!isLoggedIn()) { showLoginModal('login'); return; }
  if (symbol) currentSymbol = symbol;
  openAI();
  setTimeout(() => _send(question), open ? 0 : 380);
}

export function sendMsg() {
  const inp = document.getElementById('aiInput');
  const q = inp?.value.trim();
  if (!q || loading) return;
  inp.value = ''; inp.style.height = '';
  _send(q);
}

export function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
}

export function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 90) + 'px';
}

async function _send(question) {
  if (loading) return;
  loading = true;
  if (!sugHidden) {
    const s = document.getElementById('aiSugs');
    if (s) s.style.display = 'none';
    sugHidden = true;
  }
  _appendMsg('user', question);
  const thinking = _appendThinking();
  try {
    const { answer } = await api.askAI(question, currentSymbol);
    thinking.remove();
    _appendMsg('assistant', answer);
  } catch (e) {
    thinking.remove();
    const msg = e.status === 503
      ? '⚙️ AI belum dikonfigurasi. Tambahkan ANTHROPIC_API_KEY di file .env server.'
      : '⚠️ ' + (e.message || 'Gagal mendapat respons AI.');
    _appendMsg('assistant', msg);
  } finally { loading = false; }
}

function _appendMsg(role, text) {
  const msgs = document.getElementById('aiMsgs');
  if (!msgs) return;
  const d = document.createElement('div');
  d.className = 'ai-msg ' + role;
  // Render line breaks
  d.innerHTML = text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
  return d;
}

function _appendThinking() {
  const msgs = document.getElementById('aiMsgs');
  const d = document.createElement('div');
  d.className = 'ai-msg thinking';
  d.innerHTML = 'Menganalisis <span class="think-dots"><span></span><span></span><span></span></span>';
  msgs?.appendChild(d);
  msgs && (msgs.scrollTop = msgs.scrollHeight);
  return d;
}
