import { describe, expect, it } from "vitest";
import { formatPhoneDisplay, withDefaultCountryCode } from "./phone";

describe("formatPhoneDisplay", () => {
  it("groups Tajik numbers", () => {
    expect(formatPhoneDisplay("+992901110005")).toBe("+992 90 111 0005");
  });

  it("groups Uzbek, Russian and North American numbers", () => {
    expect(formatPhoneDisplay("+998901234567")).toBe("+998 90 123 45 67");
    expect(formatPhoneDisplay("+79001234567")).toBe("+7 900 123 45 67");
    expect(formatPhoneDisplay("+12025550123")).toBe("+1 202 555 0123");
  });

  it("adds the plus sign to bare digits", () => {
    expect(formatPhoneDisplay("992901110005")).toBe("+992 90 111 0005");
  });

  it("keeps unknown country codes and wrong lengths in raw E.164", () => {
    expect(formatPhoneDisplay("+441234567890")).toBe("+441234567890");
    expect(formatPhoneDisplay("+9929011100")).toBe("+9929011100");
  });

  it("returns empty text for missing values and leaves non-phone text untouched", () => {
    expect(formatPhoneDisplay(null)).toBe("");
    expect(formatPhoneDisplay(undefined)).toBe("");
    expect(formatPhoneDisplay("")).toBe("");
    expect(formatPhoneDisplay("abc")).toBe("abc");
  });
});

describe("withDefaultCountryCode", () => {
  it("adds +992 to a local nine-digit number, with or without separators", () => {
    expect(withDefaultCountryCode("901234567")).toBe("+992901234567");
    expect(withDefaultCountryCode(" 90 123-45-67 ")).toBe("+992901234567");
  });

  it("leaves emails, international numbers and other lengths unchanged", () => {
    expect(withDefaultCountryCode(" admin@example.com ")).toBe("admin@example.com");
    expect(withDefaultCountryCode("+992901234567")).toBe("+992901234567");
    expect(withDefaultCountryCode("992901234567")).toBe("992901234567");
    expect(withDefaultCountryCode("12345678")).toBe("12345678");
  });
});
