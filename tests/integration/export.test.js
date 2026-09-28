import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext, expectApiError, binaryParser, TEST_BASE_URL } from '../helpers/testApp.js';

const request = require('supertest');
const ExcelJS = require('exceljs');

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const HEADERS = ['Original URL', 'Short URL', 'Click Count', 'Created At'];

let ctx;

beforeAll(() => {
  ctx = createTestContext({ BULK_MAX_URLS: '100' });
});

afterAll(() => {
  ctx.cleanup();
});

async function createUrl(url) {
  const res = await request(ctx.app).post('/api/urls').send({ url });
  expect(res.status).toBe(201);
  return res.body;
}

/** Downloads the export and returns the parsed `URLs` sheet as plain rows. */
async function downloadExport(query = '') {
  const res = await request(ctx.app)
    .get(`/api/urls/export${query}`)
    .buffer(true)
    .parse(binaryParser);

  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toBe(XLSX_TYPE);
  expect(res.headers['content-disposition']).toBe('attachment; filename="urls.xlsx"');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(res.body);
  const sheet = workbook.getWorksheet('URLs');
  expect(sheet).toBeDefined();

  const [header, ...rows] = sheet.getSheetValues().filter(Boolean).map((row) => row.slice(1));
  return {
    header,
    rows: rows.map(([originalUrl, shortUrl, clickCount, createdAt]) => ({
      originalUrl,
      shortUrl,
      clickCount,
      createdAt,
    })),
  };
}

describe('GET /api/urls/export', () => {
  it('exports a header-only sheet when there are no URLs', async () => {
    const { header, rows } = await downloadExport();
    expect(header).toEqual(HEADERS);
    expect(rows).toEqual([]);
  });

  it('exports every URL with the correct columns and values', async () => {
    const first = await createUrl('https://example.com/one');
    const second = await createUrl('http://example.org/two?x=1');
    await request(ctx.app).get(`/${first.shortCode}`).expect(302);
    await request(ctx.app).get(`/${first.shortCode}`).expect(302);

    const { header, rows } = await downloadExport();

    expect(header).toEqual(HEADERS);
    expect(rows).toHaveLength(2);

    const byShortUrl = Object.fromEntries(rows.map((row) => [row.shortUrl, row]));
    for (const [created, clicks] of [
      [first, 2],
      [second, 0],
    ]) {
      const row = byShortUrl[`${TEST_BASE_URL}/${created.shortCode}`];
      expect(row.originalUrl).toBe(created.originalUrl);
      expect(row.clickCount).toBe(clicks);
      expect(row.createdAt).toBeInstanceOf(Date);
      // Stored with millisecond precision; the cell is a real date, not text.
      expect(Math.abs(row.createdAt.getTime() - Date.parse(created.createdAt))).toBeLessThan(1000);
    }
  });

  it('exports only the requested ids, ignoring duplicates and junk entries', async () => {
    const a = await createUrl('https://example.com/subset-a');
    const b = await createUrl('https://example.com/subset-b');
    await createUrl('https://example.com/not-requested');

    const { rows } = await downloadExport(`?ids=${a.id},${b.id},${a.id},,abc,-3,${a.id}`);

    expect(rows.map((row) => row.originalUrl).sort()).toEqual([a.originalUrl, b.originalUrl]);
  });

  it('exports nothing for ids that do not exist', async () => {
    const { rows } = await downloadExport('?ids=999998,999999');
    expect(rows).toEqual([]);
  });

  // Security fix #3: the id list is bounded to one bulk batch.
  it('rejects more than BULK_MAX_URLS distinct ids with 400 BATCH_TOO_LARGE', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => i + 1).join(',');
    expectApiError(await request(ctx.app).get(`/api/urls/export?ids=${ids}`), 400, 'BATCH_TOO_LARGE');
  });

  it('applies the cap after de-duplicating ids', async () => {
    const a = await createUrl('https://example.com/dedupe');
    const ids = Array.from({ length: 150 }, () => a.id).join(',');

    const { rows } = await downloadExport(`?ids=${ids}`);

    expect(rows).toHaveLength(1);
  });

  // Every stored URL has passed urlValidator and therefore starts with
  // "http", so no formula-shaped value can be created through the API. To
  // prove the export route really routes string cells through the
  // sanitizer, rows are written straight to the repository here, standing in
  // for legacy or tampered data.
  it('neutralizes formula-injection payloads in exported cells', async () => {
    const payloads = [
      '=HYPERLINK("http://evil.example","Click me")',
      '+1+1',
      '-2+3',
      '@SUM(A1:A2)',
      ' =1+1',
      '＝CMD|"/C calc"!A0',
    ];
    const ids = payloads.map(
      (originalUrl, i) => ctx.urlRepository.insertUrl({ shortCode: `evil00${i}`, originalUrl }).id
    );
    const safe = await createUrl('https://example.com/harmless');

    const { rows } = await downloadExport(`?ids=${[...ids, safe.id].join(',')}`);
    const byOriginal = new Map(rows.map((row) => [row.originalUrl, row]));

    for (const payload of payloads) {
      expect(byOriginal.has(`'${payload}`)).toBe(true);
    }
    expect(byOriginal.get(safe.originalUrl).shortUrl).toBe(safe.shortUrl);
  });

  it('never writes formula cells', async () => {
    const res = await request(ctx.app).get('/api/urls/export').buffer(true).parse(binaryParser);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body);

    workbook.getWorksheet('URLs').eachRow((row) => {
      row.eachCell((cell) => {
        expect(cell.type).not.toBe(ExcelJS.ValueType.Formula);
      });
    });
  });

  it('is served by the export route, not parsed as an id', async () => {
    const res = await request(ctx.app).get('/api/urls/export').buffer(true).parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers['ratelimit-limit']).toBeDefined();
  });
});
