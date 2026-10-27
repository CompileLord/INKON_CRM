import Big from "big.js";
import i18n from "../i18n";

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

const MONEY_PATTERN: RegExp = /^(?!^[-+.]*$)[+-]?0*\d*\.?\d*$/;

export function isValidMoneyString(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const str: string = typeof value === "string" ? value.trim() : typeof value === "number" ? value.toString() : "";
  if (!str) return false;
  return MONEY_PATTERN.test(str);
}

export function getPerMonthSuffix(lng?: string): string {
  const current: string = lng || i18n.language || "ru";
  if (current.startsWith("en")) return "/ mo";
  if (current.startsWith("tg")) return "/ моҳ";
  return "/ мес";
}

export interface FormatMoneyOptions {
  suffix?: string;
  perMonth?: boolean;
  trimZeroCents?: boolean;
  lng?: string;
}

/**
 * Display-only formatting: thousands separators + a fixed 2-decimal tail.
 * Never feed this output back into a request — always resend the original
 * server string untouched.
 */
export function formatMoney(value: unknown, options: FormatMoneyOptions = {}): string {
  if (value === null || value === undefined) {
    const zero: string = options.trimZeroCents ? "0" : "0.00";
    if (options.perMonth) {
      const suffix: string = options.suffix ?? "TJS";
      return `${zero} ${suffix} ${getPerMonthSuffix(options.lng)}`;
    }
    return options.suffix ? `${zero} ${options.suffix}` : zero;
  }
  const str: string = typeof value === "number" ? value.toString() : String(value);
  if (!isValidMoneyString(str)) return str;

  const big: Big = new Big(str);
  const parts: string[] = big.toFixed(2).split(".");
  const wholePart: string = parts[0];
  const fractionPart: string = parts[1] ?? "";
  const negative: boolean = wholePart.startsWith("-");
  const digits: string = negative ? wholePart.slice(1) : wholePart;
  const grouped: string = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  const hasCents: boolean = fractionPart !== "" && fractionPart !== "00";
  const formatted: string = options.trimZeroCents && !hasCents
    ? `${negative ? "-" : ""}${grouped}`
    : `${negative ? "-" : ""}${grouped}.${fractionPart}`;

  if (options.perMonth) {
    const suffix: string = options.suffix ?? "TJS";
    return `${formatted} ${suffix} ${getPerMonthSuffix(options.lng)}`;
  }
  return options.suffix ? `${formatted} ${options.suffix}` : formatted;
}

export function formatTjs(value: unknown, options: { perMonth?: boolean; lng?: string } = {}): string {
  return formatMoney(value, {
    suffix: "TJS",
    trimZeroCents: true,
    perMonth: options.perMonth,
    lng: options.lng,
  });
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

export function formatExactMoney(value: string): string {
  if (!isValidMoneyString(value)) return value;
  const [whole, fraction = ""] = new Big(value).toFixed().split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "." + fraction.padEnd(2, "0");
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
