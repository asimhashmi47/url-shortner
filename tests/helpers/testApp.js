import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect } from 'vitest';

export const TEST_BASE_URL = 'http://sho.rt';

const CONFIG_PATH = require.resolve('../../src/config');

/**
 * Pins every env var src/config reads. It must run before anything under src/
 * is required, because config (and the validator / rate limiters built from
 * it) is read once at module load. Vitest runs each test file in its own
 * process, so each file gets fresh modules and its own settings.
 *
 * BASE_URL is always set explicitly: Vite pre-populates it with "/", which
 * would otherwise leave config.baseUrl empty.
 */
export function applyTestEnv(overrides = {}) {
  if (require.cache[CONFIG_PATH]) {
    throw new Error('src/config was loaded before applyTestEnv(); env overrides would be ignored.');
  }
  Object.assign(process.env, {
    NODE_ENV: 'test',
    BASE_URL: TEST_BASE_URL,
    DATABASE_PATH: ':memory:',
    BULK_MAX_URLS: '100',
    RATE_LIMIT_WINDOW_MS: '60000',
    // Generous by default so ordinary tests never trip the limiters;
    // rateLimit.test.js lowers these to exercise them.
    RATE_LIMIT_MAX: '10000',
    RATE_LIMIT_EXPORT_MAX: '10000',
    TRUST_PROXY: '',
    ...overrides,
  });
}

/**
 * Boots the app against a fresh temp SQLite file. Call from beforeAll and
 * pair with cleanup() in afterAll so the connection is closed (releasing the
 * WAL/SHM files on Windows) before the temp directory is removed.
 */
export function createTestContext(envOverrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urlshortener-test-'));
  applyTestEnv({ DATABASE_PATH: path.join(dir, 'test.db'), ...envOverrides });

  const db = require('../../src/database/db');
  const createApp = require('../../src/app');
  db.initDb();

  return {
    app: createApp(),
    getDb: db.getDb,
    urlRepository: require('../../src/repositories/urlRepository'),
    countRows: () => db.getDb().prepare('SELECT COUNT(*) AS n FROM urls').get().n,
    cleanup() {
      db.closeDb();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Asserts the standard `{ error: { code, message } }` failure envelope. */
export function expectApiError(res, status, code) {
  expect(res.status).toBe(status);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(res.body).toEqual({
    error: { code, message: expect.any(String) },
  });
  expect(res.body.error.message.length).toBeGreaterThan(0);
}

/** Supertest parser that collects a binary (xlsx) response into a Buffer. */
export function binaryParser(res, callback) {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}
