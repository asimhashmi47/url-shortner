/* exported Util */
const Util = (() => {
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for browsers/contexts without Clipboard API permission.
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      textarea.remove();
      return ok;
    }
  }

  function formatDate(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function formatNumber(n) {
    return new Intl.NumberFormat().format(n);
  }

  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  return { copyToClipboard, formatDate, formatNumber, debounce };
})();
