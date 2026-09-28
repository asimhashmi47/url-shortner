import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext } from '../helpers/testApp.js';

const request = require('supertest');

let ctx;

beforeAll(() => {
  ctx = createTestContext();
});

afterAll(() => {
  ctx.cleanup();
});

async function createUrl(url) {
  const res = await request(ctx.app).post('/api/urls').send({ url });
  expect(res.status).toBe(201);
  return res.body;
}

async function clickCountOf(id) {
  const res = await request(ctx.app).get(`/api/urls/${id}`);
  expect(res.status).toBe(200);
  return res.body.clickCount;
}

function expectNotFoundPage(res) {
  expect(res.status).toBe(404);
  expect(res.headers['content-type']).toMatch(/text\/html/);
  expect(res.text).toMatch(/Short URL not found/);
}

describe('GET /:shortCode', () => {
  it('redirects a known code with 302 and the original URL in Location', async () => {
    const created = await createUrl('https://example.com/destination?ref=abc');

    const res = await request(ctx.app).get(`/${created.shortCode}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://example.com/destination?ref=abc');
    // Destinations must not learn which short link sent the visitor.
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });

  it('renders the HTML 404 page for an unknown code', async () => {
    expectNotFoundPage(await request(ctx.app).get('/zzzzzzz'));
  });

  it('renders the HTML 404 page for a path that is not shaped like a short code', async () => {
    expectNotFoundPage(await request(ctx.app).get('/not.a.code!'));
    expectNotFoundPage(await request(ctx.app).get(`/${'a'.repeat(33)}`));
  });

  it('is case-sensitive', async () => {
    const created = await createUrl('https://example.com/case');
    const swapped = created.shortCode.replace(/[a-zA-Z]/g, (c) =>
      c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()
    );
    if (swapped === created.shortCode) return; // all digits/symbols: nothing to swap

    const res = await request(ctx.app).get(`/${swapped}`);
    expect(res.status).toBe(404);
  });

  it('increments click_count on each redirect', async () => {
    const created = await createUrl('https://example.com/counted');
    expect(await clickCountOf(created.id)).toBe(0);

    await request(ctx.app).get(`/${created.shortCode}`).expect(302);
    expect(await clickCountOf(created.id)).toBe(1);

    await request(ctx.app).get(`/${created.shortCode}`).expect(302);
    expect(await clickCountOf(created.id)).toBe(2);
  });

  it('accumulates many clicks and only for the visited link', async () => {
    const visited = await createUrl('https://example.com/popular');
    const untouched = await createUrl('https://example.com/quiet');

    for (let i = 0; i < 10; i += 1) {
      await request(ctx.app).get(`/${visited.shortCode}`).expect(302);
    }

    expect(await clickCountOf(visited.id)).toBe(10);
    expect(await clickCountOf(untouched.id)).toBe(0);
  });

  it('does not count misses against any link', async () => {
    const before = (await request(ctx.app).get('/api/urls')).body.stats.totalClicks;
    await request(ctx.app).get('/zzzzzzz').expect(404);
    const after = (await request(ctx.app).get('/api/urls')).body.stats.totalClicks;
    expect(after).toBe(before);
  });

  it('reports total clicks across all links in the list stats', async () => {
    const res = await request(ctx.app).get('/api/urls');
    const summed = res.body.urls.reduce((sum, url) => sum + url.clickCount, 0);
    expect(res.body.stats.totalClicks).toBe(summed);
    expect(summed).toBeGreaterThanOrEqual(12);
  });

  it('stops redirecting once the link is deleted', async () => {
    const created = await createUrl('https://example.com/short-lived');
    await request(ctx.app).delete(`/api/urls/${created.id}`).expect(204);

    expectNotFoundPage(await request(ctx.app).get(`/${created.shortCode}`));
  });

  it('never lets the redirect route shadow the API', async () => {
    const res = await request(ctx.app).get('/api');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});
