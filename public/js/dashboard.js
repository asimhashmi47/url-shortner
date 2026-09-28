/* global Util, Api, Toast */
(function () {
  const form = document.getElementById('shorten-form');
  const urlInput = document.getElementById('url-input');
  const urlError = document.getElementById('url-error');
  const submitBtn = document.getElementById('shorten-submit');
  const submitLabel = document.getElementById('shorten-submit-label');

  const resultCard = document.getElementById('result-card');
  const resultShortUrl = document.getElementById('result-short-url');
  const resultOriginalUrl = document.getElementById('result-original-url');
  const resultCopyBtn = document.getElementById('result-copy-btn');
  const resultOpenLink = document.getElementById('result-open-link');

  const statTotalUrls = document.getElementById('stat-total-urls');
  const statTotalClicks = document.getElementById('stat-total-clicks');

  const tbody = document.getElementById('urls-tbody');
  const loadingState = document.getElementById('loading-state');
  const emptyState = document.getElementById('empty-state');
  const errorState = document.getElementById('error-state');
  const errorStateDesc = document.getElementById('error-state-desc');
  const refreshBtn = document.getElementById('refresh-btn');

  const deleteModal = document.getElementById('delete-modal');
  const deleteCancelBtn = document.getElementById('delete-cancel-btn');
  const deleteConfirmBtn = document.getElementById('delete-confirm-btn');
  let pendingDeleteId = null;

  function setTableState(state) {
    loadingState.classList.toggle('is-visible', state === 'loading');
    emptyState.classList.toggle('is-visible', state === 'empty');
    errorState.classList.toggle('is-visible', state === 'error');
    document.getElementById('urls-table').classList.toggle('is-hidden', state !== 'data');
  }

  function renderRow(url) {
    const tr = document.createElement('tr');

    const tdOriginal = document.createElement('td');
    tdOriginal.className = 'cell-url';
    const originalSpan = document.createElement('span');
    originalSpan.className = 'cell-url__text';
    originalSpan.textContent = url.originalUrl;
    originalSpan.title = url.originalUrl;
    tdOriginal.appendChild(originalSpan);

    const tdShort = document.createElement('td');
    const shortLink = document.createElement('a');
    shortLink.className = 'cell-short';
    shortLink.href = url.shortUrl;
    shortLink.target = '_blank';
    shortLink.rel = 'noopener noreferrer';
    shortLink.textContent = url.shortUrl.replace(/^https?:\/\//, '');
    tdShort.appendChild(shortLink);

    const tdClicks = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = Util.formatNumber(url.clickCount);
    tdClicks.appendChild(badge);

    const tdCreated = document.createElement('td');
    tdCreated.textContent = Util.formatDate(url.createdAt);

    const tdActions = document.createElement('td');
    tdActions.className = 'cell-actions';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn btn--ghost btn--sm';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', async () => {
      const ok = await Util.copyToClipboard(url.shortUrl);
      Toast[ok ? 'success' : 'error'](ok ? 'Short URL copied!' : 'Could not copy URL.');
    });

    const openBtn = document.createElement('a');
    openBtn.className = 'btn btn--ghost btn--sm';
    openBtn.textContent = 'Open';
    openBtn.href = url.shortUrl;
    openBtn.target = '_blank';
    openBtn.rel = 'noopener noreferrer';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn--ghost btn--sm';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => openDeleteModal(url.id));

    tdActions.append(copyBtn, openBtn, deleteBtn);
    tr.append(tdOriginal, tdShort, tdClicks, tdCreated, tdActions);
    return tr;
  }

  async function loadUrls() {
    setTableState('loading');
    try {
      const { urls, stats } = await Api.listUrls();
      statTotalUrls.textContent = Util.formatNumber(stats.totalUrls);
      statTotalClicks.textContent = Util.formatNumber(stats.totalClicks);

      tbody.innerHTML = '';
      if (urls.length === 0) {
        setTableState('empty');
        return;
      }
      const fragment = document.createDocumentFragment();
      urls.forEach((url) => fragment.appendChild(renderRow(url)));
      tbody.appendChild(fragment);
      setTableState('data');
    } catch (err) {
      errorStateDesc.textContent = err.message || 'Something went wrong. Please try again.';
      setTableState('error');
    }
  }

  function showFieldError(message) {
    urlError.textContent = message;
    urlError.classList.toggle('is-visible', Boolean(message));
    urlInput.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function setSubmitting(isSubmitting) {
    submitBtn.disabled = isSubmitting;
    if (isSubmitting) {
      submitLabel.textContent = '';
      const spinner = document.createElement('span');
      spinner.className = 'spinner';
      spinner.id = 'submit-spinner';
      submitBtn.insertBefore(spinner, submitLabel);
    } else {
      const existing = document.getElementById('submit-spinner');
      if (existing) existing.remove();
      submitLabel.textContent = 'Shorten URL';
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFieldError('');
    const value = urlInput.value.trim();

    if (!value) {
      showFieldError('Please enter a URL.');
      urlInput.focus();
      return;
    }

    setSubmitting(true);
    try {
      const created = await Api.createUrl(value);
      resultShortUrl.textContent = created.shortUrl.replace(/^https?:\/\//, '');
      resultOpenLink.href = created.shortUrl;
      resultOriginalUrl.textContent = created.originalUrl;
      resultCard.classList.add('is-visible');
      urlInput.value = '';
      Toast.success('Short URL created!');
      await loadUrls();
    } catch (err) {
      showFieldError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  });

  resultCopyBtn.addEventListener('click', async () => {
    const ok = await Util.copyToClipboard(resultOpenLink.href);
    Toast[ok ? 'success' : 'error'](ok ? 'Short URL copied!' : 'Could not copy URL.');
  });

  function openDeleteModal(id) {
    pendingDeleteId = id;
    deleteModal.classList.add('is-visible');
    deleteConfirmBtn.focus();
  }

  function closeDeleteModal() {
    pendingDeleteId = null;
    deleteModal.classList.remove('is-visible');
  }

  deleteCancelBtn.addEventListener('click', closeDeleteModal);
  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) closeDeleteModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && deleteModal.classList.contains('is-visible')) closeDeleteModal();
  });

  deleteConfirmBtn.addEventListener('click', async () => {
    if (pendingDeleteId === null) return;
    const id = pendingDeleteId;
    closeDeleteModal();
    try {
      await Api.deleteUrl(id);
      Toast.success('URL deleted.');
      await loadUrls();
    } catch (err) {
      Toast.error(err.message || 'Could not delete URL.');
    }
  });

  refreshBtn.addEventListener('click', loadUrls);

  loadUrls();
})();
