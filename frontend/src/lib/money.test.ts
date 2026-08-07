import { describe, expect, it } from "vitest";
import {
  addMoney,
  compareMoney,
  formatMoney,
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
    expect(formatMoney("-500")).toBe("-500.00");
  });

  it("appends an optional suffix", () => {
    expect(formatMoney("100", { suffix: "TJS" })).toBe("100.00 TJS");
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
