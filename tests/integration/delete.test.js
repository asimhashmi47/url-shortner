import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestContext, expectApiError } from '../helpers/testApp.js';

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

describe('DELETE /api/urls/:id', () => {
  it('deletes an existing URL with 204 and an empty body', async () => {
    const created = await createUrl('https://example.com/delete-me');

    const res = await request(ctx.app).delete(`/api/urls/${created.id}`);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expectApiError(await request(ctx.app).get(`/api/urls/${created.id}`), 404, 'NOT_FOUND');
  });

  it('only deletes the targeted record', async () => {
    const keep = await createUrl('https://example.com/keep');
    const drop = await createUrl('https://example.com/drop');

    await request(ctx.app).delete(`/api/urls/${drop.id}`).expect(204);

    const res = await request(ctx.app).get(`/api/urls/${keep.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(keep);
  });

  it('returns 404 NOT_FOUND for an id that does not exist', async () => {
    expectApiError(await request(ctx.app).delete('/api/urls/999999'), 404, 'NOT_FOUND');
  });

  it('returns 404 NOT_FOUND when deleting the same id twice', async () => {
    const created = await createUrl('https://example.com/twice');
    await request(ctx.app).delete(`/api/urls/${created.id}`).expect(204);

    expectApiError(await request(ctx.app).delete(`/api/urls/${created.id}`), 404, 'NOT_FOUND');
  });

  // Security fix #9: parseInt("1abc") === 1 used to delete the wrong record.
  it.each(['abc', '.0', 'e3', '%20', '-1'])(
    'does not resolve "<id>%s" to <id>',
    async (suffix) => {
      const target = await createUrl(`https://example.com/strict/${encodeURIComponent(suffix)}`);
      const before = ctx.countRows();

      const res = await request(ctx.app).delete(`/api/urls/${target.id}${suffix}`);

      expectApiError(res, 404, 'NOT_FOUND');
      expect(ctx.countRows()).toBe(before);
      expect((await request(ctx.app).get(`/api/urls/${target.id}`)).status).toBe(200);
    }
  );

  it.each(['abc', '0', '-1', '0x1', '9999999999999999'])(
    'returns 404 NOT_FOUND for the malformed id %j',
    async (id) => {
      expectApiError(await request(ctx.app).delete(`/api/urls/${id}`), 404, 'NOT_FOUND');
    }
  );

  // Security fix #2: DELETE is behind the write rate limiter. Exhausting it is
  // covered in rateLimit.test.js; here we just confirm it is wired in.
  it('is rate limited', async () => {
    const res = await request(ctx.app).delete('/api/urls/999999');
    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBeDefined();
  });
});
