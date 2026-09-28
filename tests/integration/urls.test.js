import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext, expectApiError, TEST_BASE_URL } from '../helpers/testApp.js';

const request = require('supertest');

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

let ctx;

beforeAll(() => {
  ctx = createTestContext();
});

afterAll(() => {
  ctx.cleanup();
});

function createUrl(url) {
  return request(ctx.app).post('/api/urls').send({ url });
}

describe('POST /api/urls', () => {
  it.each([
    ['http', 'http://example.com/page', 'http://example.com/page'],
    ['https', 'https://example.com/some/very/long/path?x=1#top', 'https://example.com/some/very/long/path?x=1#top'],
  ])('creates a short URL for a valid %s URL', async (_scheme, input, expectedUrl) => {
    const res = await createUrl(input);

    expect(res.status).toBe(201);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      id: expect.any(Number),
      shortCode: expect.stringMatching(/^[A-Za-z0-9_-]{7}$/),
      shortUrl: expect.any(String),
      originalUrl: expectedUrl,
      clickCount: 0,
      createdAt: expect.stringMatching(ISO_TIMESTAMP),
    });
    expect(res.body.shortUrl).toBe(`${TEST_BASE_URL}/${res.body.shortCode}`);
  });

  it('stores the trimmed, normalized URL', async () => {
    const res = await createUrl('   HTTPS://Example.COM  ');
    expect(res.status).toBe(201);
    expect(res.body.originalUrl).toBe('https://example.com/');
  });

  it('issues a fresh short code each time the same URL is submitted', async () => {
    const first = await createUrl('https://example.com/same');
    const second = await createUrl('https://example.com/same');
    expect(first.body.shortCode).not.toBe(second.body.shortCode);
    expect(first.body.id).not.toBe(second.body.id);
  });

  it.each([
    ['an empty string', { url: '' }],
    ['a missing url field', {}],
    ['a null url', { url: null }],
  ])('rejects %s with 400 MISSING_URL', async (_label, body) => {
    const res = await request(ctx.app).post('/api/urls').send(body);
    expectApiError(res, 400, 'MISSING_URL');
  });

  it.each([
    ['whitespace only', '   '],
    ['a non-string value', 12345],
    ['an array', ['https://example.com']],
    ['plain text', 'not a url'],
    ['a scheme-less host', 'example.com'],
    ['an unsupported scheme', 'ftp://example.com/file.txt'],
    ['a javascript: URL', 'javascript:alert(1)'],
  ])('rejects %s with 400 INVALID_URL', async (_label, url) => {
    const res = await createUrl(url);
    expectApiError(res, 400, 'INVALID_URL');
  });

  it('rejects an extremely long URL', async () => {
    const res = await createUrl(`https://example.com/${'a'.repeat(5000)}`);
    expectApiError(res, 400, 'INVALID_URL');
    expect(res.body.error.message).toMatch(/2048 characters/);
  });

  // Security fix #5.
  it('rejects a URL that only exceeds the cap once percent-encoded', async () => {
    const res = await createUrl(`https://example.com/${'é'.repeat(1500)}`);
    expectApiError(res, 400, 'INVALID_URL');
  });

  // Security fix #1.
  it('rejects a URL with userinfo', async () => {
    const res = await createUrl('https://paypal.com@evil.example/login');
    expectApiError(res, 400, 'INVALID_URL');
    expect(res.body.error.message).toMatch(/username or password/);
  });

  // Security fix #4.
  it('rejects a link back to this shortener', async () => {
    const created = await createUrl('https://example.com/target');
    const res = await createUrl(created.body.shortUrl);
    expectApiError(res, 400, 'INVALID_URL');
    expect(res.body.error.message).toMatch(/already a short link/);
  });

  it('does not persist anything for rejected input', async () => {
    const before = ctx.countRows();
    await createUrl('javascript:alert(1)');
    await createUrl('');
    expect(ctx.countRows()).toBe(before);
  });

  it('rejects a body that is not valid JSON with 400 INVALID_JSON', async () => {
    const res = await request(ctx.app)
      .post('/api/urls')
      .set('Content-Type', 'application/json')
      .send('{"url": "https://example.com"');
    expectApiError(res, 400, 'INVALID_JSON');
  });

  it('ignores non-JSON bodies (treated as a missing url)', async () => {
    const res = await request(ctx.app)
      .post('/api/urls')
      .set('Content-Type', 'text/plain')
      .send('https://example.com');
    expectApiError(res, 400, 'MISSING_URL');
  });

  it('rejects a body over the 100kb limit with 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await createUrl(`https://example.com/${'a'.repeat(150 * 1024)}`);
    expectApiError(res, 413, 'PAYLOAD_TOO_LARGE');
  });
});

describe('GET /api/urls/:id', () => {
  it('returns the stored record', async () => {
    const created = await createUrl('https://example.com/lookup');
    const res = await request(ctx.app).get(`/api/urls/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created.body);
  });

  it('returns 404 NOT_FOUND for an unknown id', async () => {
    const res = await request(ctx.app).get('/api/urls/999999');
    expectApiError(res, 404, 'NOT_FOUND');
  });

  it.each(['abc', '0', '-1', '1.5', '1e3'])('returns 404 NOT_FOUND for the malformed id %j', async (id) => {
    const res = await request(ctx.app).get(`/api/urls/${id}`);
    expectApiError(res, 404, 'NOT_FOUND');
  });
});

describe('GET /api/urls', () => {
  it('lists every URL with aggregate stats', async () => {
    const res = await request(ctx.app).get('/api/urls');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.urls)).toBe(true);
    expect(res.body.urls).toHaveLength(ctx.countRows());
    expect(res.body.stats).toEqual({ totalUrls: ctx.countRows(), totalClicks: 0 });
    for (const url of res.body.urls) {
      expect(Object.keys(url).sort()).toEqual(
        ['clickCount', 'createdAt', 'id', 'originalUrl', 'shortCode', 'shortUrl'].sort()
      );
    }
  });

  it('lists the newest URL first', async () => {
    const created = await createUrl('https://example.com/newest');
    const res = await request(ctx.app).get('/api/urls');
    expect(res.body.urls[0].id).toBe(created.body.id);
  });
});

describe('API contract', () => {
  it('returns JSON 404 NOT_FOUND for unknown API routes', async () => {
    const res = await request(ctx.app).get('/api/does-not-exist');
    expectApiError(res, 404, 'NOT_FOUND');
  });

  it('returns JSON 404 for unsupported methods on API routes', async () => {
    const res = await request(ctx.app).put('/api/urls/1').send({ url: 'https://example.com' });
    expectApiError(res, 404, 'NOT_FOUND');
  });

  it('sends security headers and no X-Powered-By', async () => {
    const res = await request(ctx.app).get('/api/urls');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toMatch(/default-src 'self'/);
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
