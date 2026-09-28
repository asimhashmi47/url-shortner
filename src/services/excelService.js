const ExcelJS = require('exceljs');
const { sanitizeExcelCell } = require('../utils/excelSanitizer');

/**
 * Builds an .xlsx workbook buffer from serialized URL records
 * ({ originalUrl, shortUrl, clickCount, createdAt }[]).
 */
async function buildUrlsWorkbook(urls) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'URLShortener';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('URLs', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Original URL', key: 'originalUrl', width: 50 },
    { header: 'Short URL', key: 'shortUrl', width: 32 },
    { header: 'Click Count', key: 'clickCount', width: 14 },
    { header: 'Created At', key: 'createdAt', width: 22 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF6366F1' },
  };
  headerRow.alignment = { vertical: 'middle' };

  for (const url of urls) {
    sheet.addRow({
      originalUrl: sanitizeExcelCell(url.originalUrl),
      shortUrl: sanitizeExcelCell(url.shortUrl),
      clickCount: url.clickCount,
      createdAt: new Date(url.createdAt),
    });
  }

  sheet.getColumn('createdAt').numFmt = 'yyyy-mm-dd hh:mm';
  sheet.autoFilter = { from: 'A1', to: 'D1' };

  return workbook.xlsx.writeBuffer();
}

module.exports = { buildUrlsWorkbook };
