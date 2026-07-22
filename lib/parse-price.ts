/** Treat zero/negative/non-finite amounts as missing (APIs use 0 for "no listing"). */
export function normalizePriceAmount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

/**
 * Parse price values from Google Sheet cells (supports US and European decimal formats).
 */
export function parsePriceCell(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    return normalizePriceAmount(value);
  }

  let s = String(value).trim().replace(/[$€£\s]/g, "");
  if (!s) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      // European: 1.234,56
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // US: 1,234.56
      s = s.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    const afterComma = s.slice(lastComma + 1);
    if (/^\d{3}$/.test(afterComma)) {
      // Thousands: 1,234
      s = s.replace(/,/g, "");
    } else {
      // Decimal comma: 96,61
      s = s.replace(",", ".");
    }
  }
  // lone dot or no separator: parse as-is

  const n = parseFloat(s);
  return normalizePriceAmount(n);
}
