// Characters that spreadsheet applications (Excel, LibreOffice, Google Sheets)
// may interpret as the start of a formula: the OWASP set (= + - @, tab, CR),
// line feed, and the full-width forms of = + - @ (U+FF1D, U+FF0B, U+FF0D,
// U+FF20) that some locales/IMEs convert to their ASCII equivalents.
const FORMULA_TRIGGER = /^[=+\-@\t\r\n\uFF1D\uFF0B\uFF0D\uFF20]/;

/**
 * Drops leading whitespace/control characters, which some importers trim
 * before deciding whether a cell is a formula (e.g. " =1+1", NBSP + "@SUM(...)").
 */
function stripLeadingPadding(value) {
  let i = 0;
  while (i < value.length && (value.charCodeAt(i) <= 0x20 || /\s/.test(value[i]))) {
    i += 1;
  }
  return value.slice(i);
}

/**
 * Neutralizes potential Excel/CSV formula injection in a string that will be
 * written into a spreadsheet cell. If the value (ignoring any leading
 * whitespace/control padding) begins with a formula-triggering character,
 * prefixes it with a single quote so spreadsheet apps render it as literal
 * text instead of evaluating it. Non-string values (numbers, dates) are
 * returned unchanged: they are written as typed cells, never parsed.
 */
function sanitizeExcelCell(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return value;
  }

  if (FORMULA_TRIGGER.test(stripLeadingPadding(value)) || FORMULA_TRIGGER.test(value)) {
    return `'${value}`;
  }

  return value;
}

module.exports = { sanitizeExcelCell };
