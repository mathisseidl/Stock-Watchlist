export type NumberFormat = "us" | "eu";

/**
 * "us" gives 1,234.56 and "eu" gives 1.234,56. Both render the same digits —
 * only the grouping and decimal separators differ — so a German reader is not
 * misreading a thousands separator as a decimal point.
 */
const LOCALES: Record<NumberFormat, string> = {
  us: "en-US",
  eu: "de-DE",
};

export function localeFor(format: NumberFormat) {
  return LOCALES[format] ?? LOCALES.us;
}

export function formatMoney(
  value: number,
  format: NumberFormat,
  fractionDigits = 2,
) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(localeFor(format), {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatNumber(
  value: number,
  format: NumberFormat,
  fractionDigits = 2,
) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(localeFor(format), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Always carries an explicit sign, since a delta without one is ambiguous. */
export function formatSignedPercent(value: number, format: NumberFormat) {
  if (!Number.isFinite(value)) return "—";
  const body = new Intl.NumberFormat(localeFor(format), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  return `${value >= 0 ? "+" : "−"}${body}%`;
}

export function formatPercent(value: number, format: NumberFormat) {
  if (!Number.isFinite(value)) return "—";
  return `${formatNumber(Math.abs(value), format)}%`;
}
