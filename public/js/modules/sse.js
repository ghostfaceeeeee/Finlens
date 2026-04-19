/**
 * public/js/modules/sse.js
 * Server-Sent Events — live price feed dari server.
 */
const _listeners = {};
let _src = null;

export function connectSSE() {
  if (_src) return;
  _src = new EventSource('/api/events');

  _src.addEventListener('connected', () => {
    _setDot(true);
    console.log('[SSE] Connected');
  });

  _src.addEventListener('price_update', e => {
    try {
      const data = JSON.parse(e.data);
      (_listeners['price_update'] || []).forEach(cb => cb(data));
    } catch {}
  });

  _src.onerror = () => _setDot(false);
}

export function onSSE(event, cb) {
  if (!_listeners[event]) _listeners[event] = [];
  _listeners[event].push(cb);
}

function _setDot(ok) {
  document.querySelectorAll('.sse-dot').forEach(d => d.classList.toggle('ok', ok));
}
