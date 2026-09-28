import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext, expectApiError } from '../helpers/testApp.js';

const request = require('supertest');

// Tiny budgets keep the exhaustion tests fast. The limiters' in-memory store
// lives for the whole file, so the tests below run in order and build on it.
const WRITE_MAX = 3;
const EXPORT_MAX = 2;

let ctx;

beforeAll(() => {
  ctx = createTestContext({
    RATE_LIMIT_MAX: String(WRITE_MAX),
    RATE_LIMIT_EXPORT_MAX: String(EXPORT_MAX),
  });
});

afterAll(() => {
  ctx.cleanup();
});

function expectRateLimited(res) {
  expectApiError(res, 429, 'RATE_LIMITED');
  expect(res.headers['retry-after']).toBeDefined();
}

describe('rate limiting', () => {
  it('shares one write budget across create, delete and bulk, then returns 429', async () => {
    const created = await request(ctx.app).post('/api/urls').send({ url: 'https://example.com/' });
    expect(created.status).toBe(201);
    expect(created.headers['ratelimit-limit']).toBe(String(WRITE_MAX));
    expect(created.headers['ratelimit-remaining']).toBe(String(WRITE_MAX - 1));

    // Failed requests count too, so probing ids burns the same budget.
    await request(ctx.app).delete('/api/urls/999999').expect(404);
    await request(ctx.app).post('/api/urls/bulk').send({ urls: ['https://example.org/'] }).expect(200);

    // Security fix #2: DELETE is limited, so ids can't be swept in a loop.
    expectRateLimited(await request(ctx.app).delete(`/api/urls/${created.body.id}`));
    expectRateLimited(await request(ctx.app).post('/api/urls').send({ url: 'https://example.net/' }));
    expectRateLimited(await request(ctx.app).post('/api/urls/bulk').send({ urls: ['https://example.net/'] }));

    // The limited delete never reached the controller.
    expect((await request(ctx.app).get(`/api/urls/${created.body.id}`)).status).toBe(200);
  });

  // Security fix #8: with TRUST_PROXY unset, X-Forwarded-For is ignored, so a
  // client can't mint a fresh rate-limit bucket by spoofing it.
  it('ignores a spoofed X-Forwarded-For header by default', async () => {
    expect(ctx.app.get('trust proxy')).toBe(false);

    const res = await request(ctx.app)
      .post('/api/urls')
      .set('X-Forwarded-For', '203.0.113.7')
      .send({ url: 'https://example.com/spoofed' });

    expectRateLimited(res);
  });

  it('never limits reads or redirects', async () => {
    const [url] = (await request(ctx.app).get('/api/urls')).body.urls;

    for (let i = 0; i < WRITE_MAX + 2; i += 1) {
      await request(ctx.app).get('/api/urls').expect(200);
      await request(ctx.app).get(`/api/urls/${url.id}`).expect(200);
      await request(ctx.app).get(`/${url.shortCode}`).expect(302);
    }
  });

  // Security fix #3: export has its own, smaller budget, independent of writes.
  it('limits export on a separate budget', async () => {
    for (let i = 0; i < EXPORT_MAX; i += 1) {
      const res = await request(ctx.app).get('/api/urls/export');
      expect(res.status).toBe(200);
      expect(res.headers['ratelimit-limit']).toBe(String(EXPORT_MAX));
    }

    expectRateLimited(await request(ctx.app).get('/api/urls/export'));
  });
});
