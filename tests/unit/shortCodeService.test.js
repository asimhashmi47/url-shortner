import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyTestEnv } from '../helpers/testApp.js';

applyTestEnv();

// shortCodeService destructures `nanoid` at load time, so the spy must be in
// place before the service is required. It passes through to the real
// generator unless a test queues a fixed value.
const nanoidModule = require('nanoid');
const nanoidSpy = vi.spyOn(nanoidModule, 'nanoid');

const urlRepository = require('../../src/repositories/urlRepository');
const { generateUniqueShortCode, CODE_LENGTH } = require('../../src/services/shortCodeService');

const MAX_ATTEMPTS = 5;
const URL_SAFE_CODE = /^[A-Za-z0-9_-]+$/;

describe('generateUniqueShortCode', () => {
  let shortCodeExists;

  beforeEach(() => {
    // No DB in unit tests: the repository lookup is stubbed.
    shortCodeExists = vi.spyOn(urlRepository, 'shortCodeExists').mockReturnValue(false);
  });

  afterEach(() => {
    shortCodeExists.mockRestore();
  });

  it('uses a 7-character code', () => {
    expect(CODE_LENGTH).toBe(7);
  });

  it('returns codes of the configured length from the URL-safe alphabet', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateUniqueShortCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect(code).toMatch(URL_SAFE_CODE);
    }
  });

  it('produces distinct codes across calls', () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateUniqueShortCode()));
    expect(codes.size).toBe(500);
  });

  it('checks each candidate against the database', () => {
    const code = generateUniqueShortCode();
    expect(shortCodeExists).toHaveBeenCalledTimes(1);
    expect(shortCodeExists).toHaveBeenCalledWith(code);
  });

  it('retries when a candidate already exists in the database', () => {
    shortCodeExists.mockReturnValueOnce(true).mockReturnValueOnce(true);

    const code = generateUniqueShortCode();

    expect(shortCodeExists).toHaveBeenCalledTimes(3);
    expect(shortCodeExists).toHaveBeenLastCalledWith(code);
  });

  it('retries when a candidate collides with a code already used in the batch', () => {
    nanoidSpy.mockReturnValueOnce('TAKEN01').mockReturnValueOnce('FRESH01');

    const code = generateUniqueShortCode(new Set(['TAKEN01']));

    expect(code).toBe('FRESH01');
    // The in-batch collision short-circuits before the DB lookup.
    expect(shortCodeExists).toHaveBeenCalledTimes(1);
    expect(shortCodeExists).toHaveBeenCalledWith('FRESH01');
  });

  it('ignores a non-Set exclude argument', () => {
    nanoidSpy.mockReturnValueOnce('TAKEN01');
    expect(generateUniqueShortCode(['TAKEN01'])).toBe('TAKEN01');
  });

  it(`gives up loudly after ${MAX_ATTEMPTS} colliding attempts`, () => {
    shortCodeExists.mockReturnValue(true);

    expect(() => generateUniqueShortCode()).toThrow(/unique short code/);
    expect(shortCodeExists).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });
});
