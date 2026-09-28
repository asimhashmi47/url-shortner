import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createTestContext, expectApiError, TEST_BASE_URL } from '../helpers/testApp.js';

const request = require('supertest');

const BULK_MAX_URLS = 100;
const INVALID_URL_REASON = 'Please provide a valid HTTP or HTTPS URL.';

let ctx;

beforeAll(() => {
  ctx = createTestContext({ BULK_MAX_URLS: String(BULK_MAX_URLS) });
});

afterAll(() => {
  ctx.cleanup();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function bulkCreate(body) {
  return request(ctx.app).post('/api/urls/bulk').send(body);
}

describe('POST /api/urls/bulk', () => {
  it('creates every URL in an all-valid batch', async () => {
    const urls = ['https://google.com/', 'https://github.com/', 'http://example.org/path'];

    const res = await bulkCreate({ urls });

    expect(res.status).toBe(200);
    expect(res.body.invalid).toEqual([]);
    expect(res.body.created).toHaveLength(3);
    expect(res.body.created.map((u) => u.originalUrl).sort()).toEqual([...urls].sort());
    for (const url of res.body.created) {
      expect(url).toEqual({
        id: expect.any(Number),
        shortCode: expect.stringMatching(/^[A-Za-z0-9_-]{7}$/),
        shortUrl: `${TEST_BASE_URL}/${url.shortCode}`,
        originalUrl: expect.any(String),
        clickCount: 0,
        createdAt: expect.any(String),
      });
    }
  });

  it('persists created URLs so they are listed and redirect', async () => {
    const res = await bulkCreate({ urls: ['https://example.com/persisted'] });
    const [created] = res.body.created;

    const fetched = await request(ctx.app).get(`/api/urls/${created.id}`);
    expect(fetched.body).toEqual(created);
    await request(ctx.app)
      .get(`/${created.shortCode}`)
      .expect(302)
      .expect('Location', 'https://example.com/persisted');
  });

  it('creates the valid URLs and reports the invalid ones in a mixed batch', async () => {
    const res = await bulkCreate({
      urls: ['https://valid.example/', 'not-a-url', 'javascript:alert(1)', 'http://also-valid.example/'],
    });

    expect(res.status).toBe(200);
    expect(res.body.created.map((u) => u.originalUrl).sort()).toEqual([
      'http://also-valid.example/',
      'https://valid.example/',
    ]);
    expect(res.body.invalid).toEqual([
      { url: 'not-a-url', reason: INVALID_URL_REASON },
      { url: 'javascript:alert(1)', reason: INVALID_URL_REASON },
    ]);
  });

  it('returns 200 with nothing created when every entry is invalid', async () => {
    const before = ctx.countRows();
    const res = await bulkCreate({ urls: ['nope', 'ftp://example.com'] });

    expect(res.status).toBe(200);
    expect(res.body.created).toEqual([]);
    expect(res.body.invalid).toHaveLength(2);
    expect(ctx.countRows()).toBe(before);
  });

  it.each([
    ['an empty array', { urls: [] }],
    ['a missing urls field', {}],
    ['a string instead of an array', { urls: 'https://example.com' }],
    ['an object instead of an array', { urls: { 0: 'https://example.com' } }],
  ])('rejects %s with 400 EMPTY_BATCH', async (_label, body) => {
    expectApiError(await bulkCreate(body), 400, 'EMPTY_BATCH');
  });

  it('creates duplicate URLs only once and reports the repeats', async () => {
    const res = await bulkCreate({
      urls: ['https://dup.example/', 'https://dup.example/', '  https://DUP.example  ', 'https://unique.example/'],
    });

    expect(res.status).toBe(200);
    expect(res.body.created.map((u) => u.originalUrl).sort()).toEqual([
      'https://dup.example/',
      'https://unique.example/',
    ]);
    expect(res.body.invalid).toEqual([
      { url: 'https://dup.example/', reason: 'Duplicate URL in this batch.' },
      { url: 'https://dup.example/', reason: 'Duplicate URL in this batch.' },
    ]);
  });

  it(`handles a full batch of ${BULK_MAX_URLS} URLs with unique short codes`, async () => {
    const urls = Array.from({ length: BULK_MAX_URLS }, (_, i) => `https://example.com/item/${i}`);

    const res = await bulkCreate({ urls });

    expect(res.status).toBe(200);
    expect(res.body.invalid).toEqual([]);
    expect(res.body.created).toHaveLength(BULK_MAX_URLS);
    expect(new Set(res.body.created.map((u) => u.shortCode)).size).toBe(BULK_MAX_URLS);
    expect(new Set(res.body.created.map((u) => u.id)).size).toBe(BULK_MAX_URLS);
  });

  it(`rejects a batch over ${BULK_MAX_URLS} URLs with 400 BATCH_TOO_LARGE and inserts nothing`, async () => {
    const before = ctx.countRows();
    const urls = Array.from({ length: BULK_MAX_URLS + 1 }, (_, i) => `https://example.com/over/${i}`);

    const res = await bulkCreate({ urls });

    expectApiError(res, 400, 'BATCH_TOO_LARGE');
    expect(res.body.error.message).toMatch(String(BULK_MAX_URLS));
    expect(ctx.countRows()).toBe(before);
  });

  it('rejects userinfo and self-referential URLs per entry', async () => {
    const res = await bulkCreate({
      urls: ['https://paypal.com@evil.example/', `${TEST_BASE_URL}/abc1234`, 'https://fine.example/'],
    });

    expect(res.status).toBe(200);
    expect(res.body.created).toHaveLength(1);
    expect(res.body.invalid).toEqual([
      {
        url: 'https://paypal.com@evil.example/',
        reason: 'URLs containing a username or password are not allowed.',
      },
      {
        url: `${TEST_BASE_URL}/abc1234`,
        reason: 'This URL is already a short link from this site.',
      },
    ]);
  });

  // Security fix #6: non-string entries used to crash String(raw) -> 500.
  it('reports malformed and non-string entries without failing the batch', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(ctx.app)
      .post('/api/urls/bulk')
      .set('Content-Type', 'application/json')
      .send(
        '{"urls":[{"toString":1},{"valueOf":null},123,null,true,["https://x.example"],"","   ","https://ok.example/"]}'
      );

    expect(res.status).toBe(200);
    expect(res.body.created.map((u) => u.originalUrl)).toEqual(['https://ok.example/']);
    expect(res.body.invalid.map((entry) => entry.url)).toEqual([
      '{"toString":1}',
      '{"valueOf":null}',
      '123',
      'null',
      'true',
      '["https://x.example"]',
      '',
      '   ',
    ]);
    for (const entry of res.body.invalid) {
      expect(entry.reason).toBe('URL is required.');
    }
    expect(errorLog).not.toHaveBeenCalled();
  });

  // Security fix #6: rejected entries are echoed back truncated, not verbatim.
  it('truncates long invalid entries in the response', async () => {
    const res = await bulkCreate({ urls: [`not-a-url-${'x'.repeat(5000)}`] });

    expect(res.status).toBe(200);
    const [entry] = res.body.invalid;
    expect(entry.url).toHaveLength(301);
    expect(entry.url.endsWith('…')).toBe(true);
    expect(entry.url.startsWith('not-a-url-')).toBe(true);
  });
});
