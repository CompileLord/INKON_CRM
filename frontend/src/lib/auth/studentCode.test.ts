import { describe, expect, it } from "vitest";
import { SmsCodeNormalizer } from "./studentCode";

describe("SmsCodeNormalizer.normalize", () => {
  it("uppercases a code whose single letter is in any position", () => {
    const codes: ReadonlyArray<readonly [string, string]> = [
      ["12345a", "12345A"],
      ["48x920", "48X920"],
      ["z74091", "Z74091"],
      ["993g05", "993G05"],
      ["9444d7", "9444D7"],
    ];
    for (const [typed, expected] of codes) {
      expect(SmsCodeNormalizer.normalize(typed)).toBe(expected);
    }
  });

  it("trims leading, trailing and inner spaces of a code", () => {
    expect(SmsCodeNormalizer.normalize("48x920 ")).toBe("48X920");
    expect(SmsCodeNormalizer.normalize(" 48X920")).toBe("48X920");
    expect(SmsCodeNormalizer.normalize("48X 920")).toBe("48X920");
  });

  it("leaves an already normalized code unchanged", () => {
    expect(SmsCodeNormalizer.normalize("48X920")).toBe("48X920");
  });

  it("never alters passwords that do not have the code shape", () => {
    const passwords: readonly string[] = ["secret123", "12345abc", "1234ab", "123456", " 123456 ", "abcdef", "Pass word1", "a b c d e 1", "pass 1x"];
    for (const password of passwords) {
      expect(SmsCodeNormalizer.normalize(password)).toBe(password);
    }
  });
});

describe("SmsCodeNormalizer.normalizeForLogin", () => {
  it("normalizes the code for a phone identifier", () => {
    expect(SmsCodeNormalizer.normalizeForLogin("+992931000005", "48x920 ")).toBe("48X920");
    expect(SmsCodeNormalizer.normalizeForLogin("931000005", "48x920")).toBe("48X920");
  });

  it("leaves the value untouched for an email identifier", () => {
    expect(SmsCodeNormalizer.normalizeForLogin("mentor@mail.com", "12345a")).toBe("12345a");
  });
});
