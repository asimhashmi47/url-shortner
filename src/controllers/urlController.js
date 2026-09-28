const path = require('path');
const config = require('../config');
const urlService = require('../services/urlService');
const excelService = require('../services/excelService');
const urlRepository = require('../repositories/urlRepository');
const { serializeUrl } = require('../utils/serializeUrl');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

const create = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const result = urlService.createShortUrl(body.url);
  res.status(201).json(result);
});

const list = asyncHandler(async (req, res) => {
  const result = urlService.listUrls();
  res.status(200).json(result);
});

const getById = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const result = urlService.getUrlById(id);
  res.status(200).json(result);
});

const remove = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  urlService.deleteUrl(id);
  res.status(204).send();
});

const bulkCreate = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const result = urlService.bulkCreate(body.urls);
  res.status(200).json(result);
});

const exportExcel = asyncHandler(async (req, res) => {
  const idsParam = req.query.ids;
  // `ids` stays undefined when the query param is absent entirely (export
  // everything). Once the param is present, every entry must be a strict
  // positive integer (same rule as parseId below) — non-numeric junk is
  // dropped rather than silently coerced, and if that leaves nothing valid
  // we export an empty workbook rather than quietly falling back to "all".
  let ids;
  if (typeof idsParam === 'string' && idsParam.trim().length > 0) {
    ids = [
      ...new Set(
        idsParam
          .split(',')
          .map((v) => v.trim())
          .filter((v) => /^\d{1,15}$/.test(v))
          .map(Number)
      ),
    ];
    // The frontend only ever exports one bulk batch; bound the IN (...) list
    // (and the resulting workbook) to that same size.
    if (ids.length > config.bulkMaxUrls) {
      throw new AppError(
        400,
        'BATCH_TOO_LARGE',
        `A maximum of ${config.bulkMaxUrls} URLs can be exported by id at once.`
      );
    }
  }

  const rows = urlRepository.findAll(ids ? { ids } : undefined);
  const urls = rows.map(serializeUrl);
  const buffer = await excelService.buildUrlsWorkbook(urls);

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="urls.xlsx"');
  res.send(buffer);
});

const redirectToOriginal = asyncHandler(async (req, res) => {
  const { shortCode } = req.params;
  const row = urlRepository.findByShortCode(shortCode);

  if (!row) {
    res.status(404).sendFile(path.join(__dirname, '..', '..', 'public', '404.html'));
    return;
  }

  urlRepository.incrementClickCount(shortCode);
  res.redirect(302, row.original_url);
});

function parseId(rawId) {
  // Strict: "1abc" or "1e3" must not silently resolve to (and delete) id 1.
  const id = /^\d{1,15}$/.test(rawId) ? Number(rawId) : NaN;
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(404, 'NOT_FOUND', 'URL not found.');
  }
  return id;
}

module.exports = {
  create,
  list,
  getById,
  remove,
  bulkCreate,
  exportExcel,
  redirectToOriginal,
};
