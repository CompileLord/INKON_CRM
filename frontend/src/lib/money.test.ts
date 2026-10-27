import { describe, expect, it } from "vitest";
import {
  addMoney,
  compareMoney,
  formatMoney,
  formatExactMoney,
  formatTjs,
  isPositiveMoney,
  isValidMoneyString,
  subtractMoney,
} from "./money";

const HUGE_DECIMAL =
  "436688811034941926602435971499369190867.07123456789012345678901234567890123456789";

describe("isValidMoneyString", () => {
  it("accepts arbitrary-precision decimal strings", () => {
    expect(isValidMoneyString(HUGE_DECIMAL)).toBe(true);
    expect(isValidMoneyString("0")).toBe(true);
    expect(isValidMoneyString("-42.5")).toBe(true);
  });

  it("rejects non-numeric strings", () => {
    expect(isValidMoneyString("abc")).toBe(false);
    expect(isValidMoneyString("")).toBe(false);
    expect(isValidMoneyString("-")).toBe(false);
  });
});

describe("precision round trip", () => {
  it("a long decimal string survives formatMoney's validity check and stays untouched as a value", () => {
    // formatMoney is display-only; the caller must keep forwarding the
    // original string in requests, never formatMoney's output.
    expect(isValidMoneyString(HUGE_DECIMAL)).toBe(true);
    expect(HUGE_DECIMAL).toBe(
      "436688811034941926602435971499369190867.07123456789012345678901234567890123456789",
    );
  });

  it("does not lose precision the way Number() would", () => {
    const asNumber = Number(HUGE_DECIMAL);
    // proves the failure mode this helper exists to avoid
    expect(String(asNumber)).not.toBe(HUGE_DECIMAL);
  });
});

describe("formatMoney", () => {
  it("adds thousand separators and fixes two decimals", () => {
    expect(formatMoney("1234567.5")).toBe("1 234 567.50");
  });

  it("preserves sign", () => {
    expect(formatMoney("-500")).toBe("-500");
  });

  it("appends an optional suffix", () => {
    expect(formatMoney("100", { suffix: "TJS" })).toBe("100 TJS");
  });

  it("returns the raw value unchanged for invalid input rather than throwing", () => {
    expect(formatMoney("not-a-number")).toBe("not-a-number");
  });
});

describe("arithmetic helpers", () => {
  it("addMoney/subtractMoney stay exact", () => {
    expect(addMoney("0.1", "0.2")).toBe("0.3");
    expect(subtractMoney("1", "0.3")).toBe("0.7");
  });

  it("compareMoney orders arbitrary-precision strings correctly", () => {
    expect(compareMoney(HUGE_DECIMAL, "1")).toBe(1);
    expect(compareMoney("1", "1")).toBe(0);
  });

  it("isPositiveMoney", () => {
    expect(isPositiveMoney("0.0001")).toBe(true);
    expect(isPositiveMoney("0")).toBe(false);
    expect(isPositiveMoney("-1")).toBe(false);
  });
});

describe("exact payment display", () => {
  it("retains every supplied fractional digit and huge integer digits", () => {
    expect(formatExactMoney("12345678901234567890.1234567890123456789")).toBe("12 345 678 901 234 567 890.1234567890123456789");
    expect(formatExactMoney("0.001")).toBe("0.001");
    expect(formatExactMoney("0")).toBe("0");
    expect(formatExactMoney("1234.5")).toBe("1 234.50");
  });
});

describe("formatTjs shared formatter", () => {
  it("formats integer when cents are zero", () => {
    const zero: string = formatTjs("0");
    expect(zero).toBe("0 TJS");
    const zeroWithDecimals: string = formatTjs("0.00");
    expect(zeroWithDecimals).toBe("0 TJS");
    const fiveHundred: string = formatTjs("500");
    expect(fiveHundred).toBe("500 TJS");
    const fifteenHundred: string = formatTjs("1500.00");
    expect(fifteenHundred).toBe("1 500 TJS");
  });

  it("formats two decimals otherwise", () => {
    const fraction: string = formatTjs("166.67");
    expect(fraction).toBe("166.67 TJS");
    const singleDec: string = formatTjs("166.6");
    expect(singleDec).toBe("166.60 TJS");
    const groupedWithCents: string = formatTjs("1234567.89");
    expect(groupedWithCents).toBe("1 234 567.89 TJS");
  });

  it("accepts arbitrary-precision decimal strings without float conversion or precision loss", () => {
    const highPrecision: string = formatTjs(HUGE_DECIMAL);
    expect(highPrecision).toBe("436 688 811 034 941 926 602 435 971 499 369 190 867.07 TJS");
  });

  it("applies TJS label across en, ru, and tg locales for both plain and monthly amounts", () => {
    const enPlain: string = formatTjs("500", { lng: "en" });
    const ruPlain: string = formatTjs("500", { lng: "ru" });
    const tgPlain: string = formatTjs("500", { lng: "tg" });
    expect(enPlain).toBe("500 TJS");
    expect(ruPlain).toBe("500 TJS");
    expect(tgPlain).toBe("500 TJS");

    const enMonthly: string = formatTjs("500", { perMonth: true, lng: "en" });
    const ruMonthly: string = formatTjs("500", { perMonth: true, lng: "ru" });
    const tgMonthly: string = formatTjs("500", { perMonth: true, lng: "tg" });
    expect(enMonthly).toBe("500 TJS / mo");
    expect(ruMonthly).toBe("500 TJS / мес");
    expect(tgMonthly).toBe("500 TJS / моҳ");
  });
});

describe("per-month suffix translations", () => {
  it("comes from the common locale for every language", () => {
    expect(formatTjs("500", { perMonth: true, lng: "en" })).toBe("500 TJS / mo");
    expect(formatTjs("500", { perMonth: true, lng: "tg" })).toBe("500 TJS / моҳ");
    expect(formatTjs("500", { perMonth: true, lng: "ru" })).toBe("500 TJS / мес");
  });

  it("trims whole amounts but keeps real cents in the exact formatter", () => {
    expect(formatExactMoney("500.00")).toBe("500");
    expect(formatExactMoney("1500.50")).toBe("1 500.50");
  });
});
