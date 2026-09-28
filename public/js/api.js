/**
 * Minimal fetch-based API client. Every method throws an Error whose
 * `.payload` carries the parsed `{ error: { code, message } }` envelope
 * when the server returned one, so callers can show a friendly message.
 */
/* exported Api */
const Api = (() => {
  async function request(path, options = {}) {
    const res = await fetch(path, {
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      ...options,
    });

    if (res.status === 204) {
      return null;
    }

    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await res.json().catch(() => null) : null;

    if (!res.ok) {
      const message =
        (data && data.error && data.error.message) || `Request failed (${res.status}).`;
      const err = new Error(message);
      err.payload = data;
      err.status = res.status;
      throw err;
    }

    return data;
  }

  return {
    createUrl: (url) => request('/api/urls', { method: 'POST', body: JSON.stringify({ url }) }),
    listUrls: () => request('/api/urls'),
    deleteUrl: (id) => request(`/api/urls/${id}`, { method: 'DELETE' }),
    bulkCreate: (urls) =>
      request('/api/urls/bulk', { method: 'POST', body: JSON.stringify({ urls }) }),
    exportUrl: (ids) => `/api/urls/export${ids && ids.length ? `?ids=${ids.join(',')}` : ''}`,
  };
})();
