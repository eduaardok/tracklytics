// ── Toast notifications ───────────────────────────────────────────────────────
// Standalone module (no deps on api.js/components.js) so both can import it
// without creating a circular import between components.js → favorites.js →
// api.js → components.js.

function _container() {
  let el = document.getElementById('toast-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-root';
    el.className = 'toast-root';
    document.body.appendChild(el);
  }
  return el;
}

/**
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} type
 * @param {number} durationMs
 */
export function showToast(message, type = 'info', durationMs = 4000) {
  const root = _container();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  root.appendChild(el);

  requestAnimationFrame(() => el.classList.add('toast-visible'));

  setTimeout(() => {
    el.classList.remove('toast-visible');
    setTimeout(() => el.remove(), 250);
  }, durationMs);
}
