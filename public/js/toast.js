/** Simple accessible toast notifications appended to #toast-region. */
/* exported Toast */
const Toast = (() => {
  let region;

  function ensureRegion() {
    if (!region) {
      region = document.getElementById('toast-region');
    }
    return region;
  }

  function show(message, type = 'success', duration = 3200) {
    const el = ensureRegion();
    if (!el) return;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const icon = document.createElement('span');
    icon.className = 'toast__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = type === 'success' ? '✓' : '⚠';

    const text = document.createElement('span');
    text.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(text);
    el.appendChild(toast);

    window.setTimeout(() => {
      toast.classList.add('is-leaving');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, duration);
  }

  return {
    success: (msg) => show(msg, 'success'),
    error: (msg) => show(msg, 'error'),
  };
})();
