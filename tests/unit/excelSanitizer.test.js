import { describe, it, expect } from 'vitest';

const { sanitizeExcelCell } = require('../../src/utils/excelSanitizer');

describe('sanitizeExcelCell', () => {
  describe('formula-trigger prefixes', () => {
    it.each([
      '=1+1',
      '=HYPERLINK("http://evil.example","Click me")',
      '+1+1',
      '-2+3',
      '@SUM(A1:A2)',
      '\t=1+1',
      '\r=1+1',
      '\n=1+1',
      '=',
      '-',
    ])('prefixes %j with a single quote', (value) => {
      expect(sanitizeExcelCell(value)).toBe(`'${value}`);
    });
  });

  // Security fix #10: importers may trim padding before deciding a cell is a
  // formula, and some locales/IMEs turn full-width operators into ASCII.
  describe('padded and full-width triggers', () => {
    it.each([
      ' =1+1',
      '   +cmd',
      ' @SUM(A1:A2)',
      '\u0000=cmd|" /C calc"!A0',
      '\u000B-1',
      '﻿=1+1',
      ' \t \r\n=1+1',
      '＝1+1',
      '＋1',
      '－1',
      '＠SUM(A1)',
      ' ＝1+1',
    ])('prefixes %j with a single quote', (value) => {
      expect(sanitizeExcelCell(value)).toBe(`'${value}`);
    });
  });

  describe('safe values', () => {
    it.each([
      'https://example.com/',
      'http://example.com/path?a=-1&b=+2&c==3',
      'https://example.com/@user',
      'http://sho.rt/abc1234',
      'plain text',
      '   ',
      "'=already-escaped",
    ])('leaves %j untouched', (value) => {
      expect(sanitizeExcelCell(value)).toBe(value);
    });

    it('is idempotent', () => {
      const once = sanitizeExcelCell('=1+1');
      expect(sanitizeExcelCell(once)).toBe(once);
    });
  });

  describe('non-string values', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');

    it.each([[''], [0], [-5], [42], [null], [undefined], [true], [date]])(
      'returns %j unchanged',
      (value) => {
        expect(sanitizeExcelCell(value)).toBe(value);
      }
    );
  });
});
