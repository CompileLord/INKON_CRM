import { describe, expect, it } from "vitest";
import { PaymentAmountParser } from "./paymentAmountParser";

describe("payment amount parser", () => {
  it("accepts a comma or a dot as the only decimal separator and serializes a canonical dot", () => {
    expect(PaymentAmountParser.parse("750,50")).toEqual({ canonical: "750.50", problem: null });
    expect(PaymentAmountParser.parse("750.50")).toEqual({ canonical: "750.50", problem: null });
    expect(PaymentAmountParser.parse(" 1 250,5 ")).toEqual({ canonical: "1250.5", problem: null });
  });

  it("keeps digits beyond float precision exactly but allows at most two decimals", () => {
    expect(PaymentAmountParser.parse("12345678901234567890,12")).toEqual({ canonical: "12345678901234567890.12", problem: null });
    for (const tooPrecise of ["0.005", "12.345", "0.1000000000000000055511151231257827"]) expect(PaymentAmountParser.parse(tooPrecise).problem).toBe("invalid");
  });

  it("distinguishes empty, invalid and non-positive input", () => {
    expect(PaymentAmountParser.parse("   ").problem).toBe("empty");
    for (const invalid of ["abc", "750,5,0", "1,234.50", "-5", "+5", ".5", "5.", "1e3"]) expect(PaymentAmountParser.parse(invalid).problem).toBe("invalid");
    for (const zero of ["0", "0,00", "000.00"]) expect(PaymentAmountParser.parse(zero).problem).toBe("notPositive");
  });
});
