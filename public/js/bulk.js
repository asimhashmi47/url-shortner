/* global Util, Api, Toast */
(function () {
  const bulkInput = document.getElementById('bulk-input');
  const bulkError = document.getElementById('bulk-error');
  const submitBtn = document.getElementById('bulk-submit');
  const submitLabel = document.getElementById('bulk-submit-label');
  const clearBtn = document.getElementById('bulk-clear');

  const resultsPanel = document.getElementById('bulk-results-panel');
  const emptyState = document.getElementById('bulk-empty-state');
  const summarySuccess = document.getElementById('summary-success');
  const summaryInvalid = document.getElementById('summary-invalid');
  const resultsTbody = document.getElementById('bulk-results-tbody');
  const invalidList = document.getElementById('bulk-invalid-list');
  const downloadBtn = document.getElementById('bulk-download-btn');

  let lastCreatedIds = [];

  emptyState.classList.remove('is-hidden');

  function parseLines(text) {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  function showError(message) {
    bulkError.textContent = message;
    bulkError.classList.toggle('is-visible', Boolean(message));
  }

  function setSubmitting(isSubmitting) {
    submitBtn.disabled = isSubmitting;
    if (isSubmitting) {
      submitLabel.textContent = '';
      const spinner = document.createElement('span');
      spinner.className = 'spinner spinner--dark';
      spinner.id = 'bulk-submit-spinner';
      submitBtn.insertBefore(spinner, submitLabel);
    } else {
      const existing = document.getElementById('bulk-submit-spinner');
      if (existing) existing.remove();
      submitLabel.textContent = 'Shorten URLs';
    }
  }

  function renderResultRow(url) {
    const tr = document.createElement('tr');

    const tdOriginal = document.createElement('td');
    tdOriginal.className = 'cell-url';
    const span = document.createElement('span');
    span.className = 'cell-url__text';
    span.textContent = url.originalUrl;
    span.title = url.originalUrl;
    tdOriginal.appendChild(span);

    const tdShort = document.createElement('td');
    const link = document.createElement('a');
    link.className = 'cell-short';
    link.href = url.shortUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = url.shortUrl.replace(/^https?:\/\//, '');
    tdShort.appendChild(link);

    const tdClicks = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = Util.formatNumber(url.clickCount);
    tdClicks.appendChild(badge);

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
    const openLink = document.createElement('a');
    openLink.className = 'btn btn--ghost btn--sm';
    openLink.textContent = 'Open';
    openLink.href = url.shortUrl;
    openLink.target = '_blank';
    openLink.rel = 'noopener noreferrer';
    tdActions.append(copyBtn, openLink);

    tr.append(tdOriginal, tdShort, tdClicks, tdActions);
    return tr;
  }

  function renderInvalidItem(entry) {
    const li = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = entry.url;
    li.appendChild(code);
    li.appendChild(document.createTextNode(` — ${entry.reason}`));
    return li;
  }

  async function submitBatch() {
    showError('');
    const urls = parseLines(bulkInput.value);

    if (urls.length === 0) {
      showError('Please paste at least one URL.');
      bulkInput.focus();
      return;
    }
    if (urls.length > 100) {
      showError('A maximum of 100 URLs can be submitted at once.');
      return;
    }

    setSubmitting(true);
    try {
      const { created, invalid } = await Api.bulkCreate(urls);
      lastCreatedIds = created.map((u) => u.id);

      emptyState.classList.add('is-hidden');
      resultsPanel.classList.remove('is-hidden');

      summarySuccess.textContent = `${created.length} shortened`;
      summaryInvalid.textContent = `${invalid.length} invalid`;
      summaryInvalid.classList.toggle('is-hidden', invalid.length === 0);

      resultsTbody.innerHTML = '';
      const fragment = document.createDocumentFragment();
      created.forEach((url) => fragment.appendChild(renderResultRow(url)));
      resultsTbody.appendChild(fragment);

      invalidList.innerHTML = '';
      if (invalid.length > 0) {
        const invalidFragment = document.createDocumentFragment();
        invalid.forEach((entry) => invalidFragment.appendChild(renderInvalidItem(entry)));
        invalidList.appendChild(invalidFragment);
        invalidList.classList.remove('is-hidden');
      } else {
        invalidList.classList.add('is-hidden');
      }

      downloadBtn.disabled = created.length === 0;

      if (created.length > 0) {
        Toast.success(`Shortened ${created.length} URL${created.length === 1 ? '' : 's'}!`);
      } else {
        Toast.error('No valid URLs were found in your batch.');
      }
    } catch (err) {
      showError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  submitBtn.addEventListener('click', submitBatch);

  clearBtn.addEventListener('click', () => {
    bulkInput.value = '';
    showError('');
    bulkInput.focus();
  });

  downloadBtn.addEventListener('click', () => {
    if (lastCreatedIds.length === 0) return;
    window.location.href = Api.exportUrl(lastCreatedIds);
  });
})();
