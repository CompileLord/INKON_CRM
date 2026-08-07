import Big from "big.js";

/**
 * Server amounts are Python `Decimal` values serialized as strings with
 * unbounded precision (real examples run to 100+ fractional digits). Big.js
 * mirrors that: DP (division decimal places) is set generously below so a
 * live discount preview doesn't truncate precision a normal payment would
 * never hit. Values must never be parsed with Number()/parseFloat — that
 * silently rounds to a float64 and corrupts the figure.
 */
Big.DP = 100;
Big.RM = Big.roundHalfUp;

const MONEY_PATTERN = /^(?!^[-+.]*$)[+-]?0*\d*\.?\d*$/;

export function isValidMoneyString(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const str = typeof value === "string" ? value.trim() : typeof value === "number" ? value.toString() : "";
  if (!str) return false;
  return MONEY_PATTERN.test(str);
}

/**
 * Display-only formatting: thousands separators + a fixed 2-decimal tail.
 * Never feed this output back into a request — always resend the original
 * server string untouched.
 */
export function formatMoney(value: unknown, options: { suffix?: string } = {}): string {
  if (value === null || value === undefined) return "0.00";
  const str = typeof value === "number" ? value.toString() : String(value);
  if (!isValidMoneyString(str)) return str;

  const big = new Big(str);
  const [wholePart, fractionPart = ""] = big.toFixed(2).split(".");
  const negative = wholePart.startsWith("-");
  const digits = negative ? wholePart.slice(1) : wholePart;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  const formatted = `${negative ? "-" : ""}${grouped}.${fractionPart}`;
  return options.suffix ? `${formatted} ${options.suffix}` : formatted;
}

export function formatSum(value: unknown): string {
  if (value === null || value === undefined) return "0";
  const str = typeof value === "number" ? value.toString() : String(value);
  if (!isValidMoneyString(str)) return str ? str : "0";
  const big = new Big(str);
  const wholePart = big.toFixed(0);
  const negative = wholePart.startsWith("-");
  const digits = negative ? wholePart.slice(1) : wholePart;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${negative ? "-" : ""}${grouped}`;
}

export function addMoney(a: string, b: string): string {
  return new Big(a).plus(b).toString();
}

export function subtractMoney(a: string, b: string): string {
  return new Big(a).minus(b).toString();
}

export function compareMoney(a: string, b: string): number {
  return new Big(a).cmp(b);
}

export function isPositiveMoney(value: string): boolean {
  return isValidMoneyString(value) && new Big(value).gt(0);
}
