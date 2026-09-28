import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createTestContext, expectApiError } from '../helpers/testApp.js';

const request = require('supertest');

let ctx;

beforeAll(() => {
  ctx = createTestContext();
});

afterAll(() => {
  ctx.cleanup();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createUrl(url) {
  return request(ctx.app).post('/api/urls').send({ url });
}

function urlsTableExists() {
  return Boolean(
    ctx.getDb().prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'urls'").get()
  );
}

describe('SQL injection', () => {
  const payloads = [
    "' OR '1'='1",
    "'; DROP TABLE urls; --",
    '1; DELETE FROM urls',
    "https://example.com' OR 1=1 --",
    'https://example.com"); DROP TABLE urls; --',
  ];

  it.each(payloads)('rejects %j as an invalid URL', async (payload) => {
    expectApiError(await createUrl(payload), 400, 'INVALID_URL');
  });

  it('stores SQL-looking text inside a valid URL as inert, encoded data', async () => {
    const before = ctx.countRows();
    const res = await createUrl("https://example.com/?id=1'; DROP TABLE urls; --");

    expect(res.status).toBe(201);
    expect(res.body.originalUrl).toBe('https://example.com/?id=1%27;%20DROP%20TABLE%20urls;%20--');
    expect(urlsTableExists()).toBe(true);
    expect(ctx.countRows()).toBe(before + 1);
  });

  it('treats SQL in bulk entries as invalid data', async () => {
    const res = await request(ctx.app)
      .post('/api/urls/bulk')
      .send({ urls: payloads });

    expect(res.status).toBe(200);
    expect(res.body.created).toEqual([]);
    expect(res.body.invalid.map((entry) => entry.url)).toEqual(payloads);
  });

  it('does not execute SQL smuggled through path params or query strings', async () => {
    const created = await createUrl('https://example.com/survivor');
    const before = ctx.countRows();

    expectApiError(
      await request(ctx.app).delete(`/api/urls/${encodeURIComponent('1 OR 1=1')}`),
      404,
      'NOT_FOUND'
    );
    expectApiError(
      await request(ctx.app).get(`/api/urls/${encodeURIComponent("1' OR '1'='1")}`),
      404,
      'NOT_FOUND'
    );
    expect((await request(ctx.app).get(`/${encodeURIComponent("x' OR '1'='1")}`)).status).toBe(404);
    const exported = await request(ctx.app).get(
      `/api/urls/export?ids=${encodeURIComponent('0) OR (1=1')}`
    );
    expect(exported.status).toBe(200);

    expect(urlsTableExists()).toBe(true);
    expect(ctx.countRows()).toBe(before);
    expect((await request(ctx.app).get(`/api/urls/${created.body.id}`)).status).toBe(200);
  });
});

describe('XSS', () => {
  const scriptPayload = '<script>alert(document.cookie)</script>';

  it('rejects a bare script tag without reflecting it', async () => {
    const res = await createUrl(scriptPayload);
    expectApiError(res, 400, 'INVALID_URL');
    expect(res.text).not.toContain('<script');
  });

  it.each([
    'javascript:alert(document.cookie)',
    `data:text/html,${scriptPayload}`,
    '<img src=x onerror=alert(1)>',
    '"><svg/onload=alert(1)>',
  ])('rejects %j', async (payload) => {
    const res = await createUrl(payload);
    expectApiError(res, 400, 'INVALID_URL');
    expect(res.text).not.toMatch(/<script|<img|<svg/i);
  });

  it('stores markup inside a valid URL percent-encoded, never as raw HTML', async () => {
    const res = await createUrl(`https://example.com/"><script>alert(1)</script>`);

    expect(res.status).toBe(201);
    expect(res.body.originalUrl).not.toMatch(/[<>"]/);

    const listed = await request(ctx.app).get('/api/urls');
    expect(listed.text).not.toContain('<script');

    const redirect = await request(ctx.app).get(`/${res.body.shortCode}`).set('Accept', 'text/html');
    expect(redirect.status).toBe(302);
    expect(redirect.headers.location).not.toMatch(/[<>"]/);
    expect(redirect.text).not.toContain('<script');
  });

  it('echoes rejected bulk entries only as JSON that browsers will not sniff as HTML', async () => {
    const res = await request(ctx.app).post('/api/urls/bulk').send({ urls: [scriptPayload] });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.body.invalid[0].url).toBe(scriptPayload);
  });

  it('does not reflect script payloads in 404 responses', async () => {
    const page = await request(ctx.app).get(`/${encodeURIComponent(scriptPayload)}`);
    expect(page.status).toBe(404);
    expect(page.text).not.toContain('<script');
    expect(page.text).not.toContain('%3Cscript');

    const api = await request(ctx.app).get(`/api/${encodeURIComponent(scriptPayload)}`);
    expectApiError(api, 404, 'NOT_FOUND');
    expect(api.text).not.toContain('script');
  });

  it('serves a CSP that forbids inline script and framing', async () => {
    const res = await request(ctx.app).get('/');
    const csp = res.headers['content-security-policy'];
    expect(csp).toMatch(/script-src 'self'/);
    expect(csp).toMatch(/script-src-attr 'none'/);
    expect(csp).toMatch(/object-src 'none'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
  });
});

describe('malicious URL schemes', () => {
  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    ' \tjavascript:alert(1)',
    'java\nscript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'file:///etc/passwd',
    'file://C:/Windows/win.ini',
    'vbscript:msgbox(1)',
    'ftp://example.com/',
    'blob:https://example.com/uuid',
  ])('rejects %j on single and bulk create', async (payload) => {
    expectApiError(await createUrl(payload), 400, 'INVALID_URL');

    const bulk = await request(ctx.app).post('/api/urls/bulk').send({ urls: [payload] });
    expect(bulk.status).toBe(200);
    expect(bulk.body.created).toEqual([]);
    expect(bulk.body.invalid).toHaveLength(1);
  });
});

// Security fix #7: client-caused Express errors must be a clean 4xx, with no
// stack trace in the response and no stack-trace log spam.
describe('malformed requests', () => {
  it.each([
    ['GET', '/api/urls/%E0%A4%A'],
    ['DELETE', '/api/urls/%E0%A4%A'],
    ['GET', '/api/urls/%'],
  ])('%s %s returns 400 BAD_REQUEST without logging a stack', async (method, path) => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(ctx.app)[method.toLowerCase()](path);

    expectApiError(res, 400, 'BAD_REQUEST');
    expect(res.text).not.toMatch(/URIError|at .*\.js|stack/i);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('returns the HTML 404 page for malformed encoding outside the API', async () => {
    const res = await request(ctx.app).get('/%E0%A4%A');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).not.toMatch(/URIError|stack/i);
  });

  it('never leaks internals on unexpected server errors', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(ctx.urlRepository, 'findAll').mockImplementation(() => {
      throw new Error('SQLITE_CORRUPT: secret internal detail');
    });

    const res = await request(ctx.app).get('/api/urls');

    expectApiError(res, 500, 'INTERNAL_ERROR');
    expect(res.text).not.toContain('SQLITE_CORRUPT');
    expect(res.text).not.toContain('secret');
    expect(errorLog).toHaveBeenCalledTimes(1);
  });
});
