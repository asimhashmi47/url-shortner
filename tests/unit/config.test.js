import { describe, it, expect, afterEach } from 'vitest';
import { applyTestEnv } from '../helpers/testApp.js';

const CONFIG_PATH = require.resolve('../../src/config');

/** Loads a fresh copy of src/config under the given env overrides. */
function loadConfig(overrides) {
  delete require.cache[CONFIG_PATH];
  applyTestEnv(overrides);
  return require(CONFIG_PATH);
}

afterEach(() => {
  delete require.cache[CONFIG_PATH];
});

// Security fix #8: TRUST_PROXY is a hop count, off by default, and a bare
// "true" (trust any X-Forwarded-For, i.e. spoofable) is narrowed to 1 hop.
describe('config.trustProxy', () => {
  it.each([
    ['', false],
    ['false', false],
    ['0', false],
    ['true', 1],
    ['1', 1],
    ['2', 2],
    ['loopback', 'loopback'],
  ])('TRUST_PROXY=%j -> %j', (value, expected) => {
    expect(loadConfig({ TRUST_PROXY: value }).trustProxy).toBe(expected);
  });
});

describe('config defaults', () => {
  it('strips a trailing slash from BASE_URL', () => {
    expect(loadConfig({ BASE_URL: 'https://sho.rt/' }).baseUrl).toBe('https://sho.rt');
  });

  it('falls back to the documented rate-limit and bulk defaults', () => {
    const config = loadConfig({
      RATE_LIMIT_MAX: '',
      RATE_LIMIT_EXPORT_MAX: '',
      RATE_LIMIT_WINDOW_MS: '',
      BULK_MAX_URLS: '',
    });
    expect(config.rateLimit).toEqual({ windowMs: 60_000, max: 30, exportMax: 10 });
    expect(config.bulkMaxUrls).toBe(100);
    expect(config.maxUrlLength).toBe(2048);
  });
});
