import { describe, it, expect } from 'vitest';
import { applyTestEnv } from '../helpers/testApp.js';

applyTestEnv({ BASE_URL: 'http://localhost:3000' });
const { validateUrl } = require('../../src/utils/urlValidator');

const MAX_LENGTH = 2048;
const INVALID_URL_REASON = 'Please provide a valid HTTP or HTTPS URL.';

function urlOfLength(length) {
  const prefix = 'https://example.com/';
  return prefix + 'a'.repeat(length - prefix.length);
}

describe('validateUrl', () => {
  describe('valid URLs', () => {
    it.each([
      ['http://example.com', 'http://example.com/'],
      ['https://example.com', 'https://example.com/'],
      ['https://example.com/path?q=1&r=two#frag', 'https://example.com/path?q=1&r=two#frag'],
      ['HTTPS://EXAMPLE.COM/Path', 'https://example.com/Path'],
      ['http://127.0.0.1:8080/', 'http://127.0.0.1:8080/'],
      ['https://sub.domain.example.co.uk/a/b', 'https://sub.domain.example.co.uk/a/b'],
    ])('accepts %s and normalizes it to %s', (input, expected) => {
      expect(validateUrl(input)).toEqual({ valid: true, url: expected });
    });

    it('trims surrounding whitespace before validating', () => {
      expect(validateUrl('  \thttps://example.com/x \n')).toEqual({
        valid: true,
        url: 'https://example.com/x',
      });
    });

    it('percent-encodes characters that would be unsafe in a Location header', () => {
      const result = validateUrl('https://example.com/"><script>alert(1)</script>');
      expect(result.valid).toBe(true);
      expect(result.url).toBe('https://example.com/%22%3E%3Cscript%3Ealert(1)%3C/script%3E');
    });
  });

  describe('empty and non-string input', () => {
    it.each([[''], ['   '], ['\t\n'], [undefined], [null], [42], [{}], [['https://example.com']]])(
      'rejects %j as required',
      (input) => {
        expect(validateUrl(input)).toEqual({ valid: false, reason: 'URL is required.' });
      }
    );

    it('does not throw on objects with a hostile toString', () => {
      expect(validateUrl({ toString: 1 })).toEqual({ valid: false, reason: 'URL is required.' });
    });
  });

  describe('malformed URLs', () => {
    it.each([
      'not a url',
      'example.com',
      'www.example.com/path',
      '//example.com',
      'http://',
      'https://',
      'http://exa mple.com',
      'https://[::1',
    ])('rejects %j', (input) => {
      expect(validateUrl(input)).toEqual({ valid: false, reason: INVALID_URL_REASON });
    });
  });

  describe('unsupported schemes', () => {
    it.each([
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      '  javascript:alert(1)',
      'java\nscript:alert(1)',
      'java\tscript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'vbscript:msgbox(1)',
      'ftp://example.com/file.txt',
      'mailto:someone@example.com',
      'ws://example.com/socket',
    ])('rejects %j', (input) => {
      expect(validateUrl(input)).toEqual({ valid: false, reason: INVALID_URL_REASON });
    });
  });

  describe('length cap', () => {
    const tooLongReason = `URL must be ${MAX_LENGTH} characters or fewer.`;

    it('accepts a URL exactly at the cap', () => {
      const url = urlOfLength(MAX_LENGTH);
      expect(validateUrl(url)).toEqual({ valid: true, url });
    });

    it('rejects a URL one character over the cap', () => {
      expect(validateUrl(urlOfLength(MAX_LENGTH + 1))).toEqual({
        valid: false,
        reason: tooLongReason,
      });
    });

    it('does not count surrounding whitespace toward the cap', () => {
      const url = urlOfLength(MAX_LENGTH);
      expect(validateUrl(`   ${url}   `)).toEqual({ valid: true, url });
    });

    // Security fix #5: percent-encoding can grow the input several-fold, so
    // the cap must also hold for the normalized string that gets stored.
    it('rejects input under the cap whose normalized form exceeds it', () => {
      const input = `https://example.com/${'é'.repeat(1500)}`;
      expect(input.length).toBeLessThan(MAX_LENGTH);
      expect(validateUrl(input)).toEqual({ valid: false, reason: tooLongReason });
    });

    it('accepts non-ASCII input whose normalized form stays within the cap', () => {
      const result = validateUrl(`https://example.com/${'é'.repeat(100)}`);
      expect(result.valid).toBe(true);
      expect(result.url).toBe(`https://example.com/${'%C3%A9'.repeat(100)}`);
    });
  });

  // Security fix #1: userinfo is a phishing disguise and leaks credentials.
  describe('userinfo', () => {
    it.each([
      'https://paypal.com@evil.com',
      'https://paypal.com:443@evil.com/login',
      'https://user:pass@example.com',
      'https://user:@example.com',
      'https://:secret@example.com',
      'http://admin@127.0.0.1/',
    ])('rejects %j', (input) => {
      expect(validateUrl(input)).toEqual({
        valid: false,
        reason: 'URLs containing a username or password are not allowed.',
      });
    });

    it('accepts an "@" that is part of the path rather than userinfo', () => {
      expect(validateUrl('https://example.com/@user')).toEqual({
        valid: true,
        url: 'https://example.com/@user',
      });
    });
  });

  // Security fix #4: no short -> short chains that hide the destination.
  describe('links back to this shortener (BASE_URL http://localhost:3000)', () => {
    const selfLinkReason = 'This URL is already a short link from this site.';

    it.each([
      'http://localhost:3000/abc1234',
      'HTTP://LOCALHOST:3000/abc1234',
      'https://localhost:3000/abc1234',
      'http://localhost:3000',
      // A trailing root-label dot resolves to the same host.
      'http://localhost.:3000/abc1234',
    ])('rejects %j', (input) => {
      expect(validateUrl(input)).toEqual({ valid: false, reason: selfLinkReason });
    });

    it.each(['http://localhost:3001/abc1234', 'http://localhost/abc1234', 'http://example.com:3000/'])(
      'accepts a different host or port: %j',
      (input) => {
        expect(validateUrl(input).valid).toBe(true);
      }
    );
  });
});
