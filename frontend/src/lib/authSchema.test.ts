import { describe, expect, it } from "vitest";
import i18n from "../i18n";
import {
  countUnicodeCodepoints,
  createSetPasswordFormSchema,
  hasPythonDigit,
  setPasswordFormSchema,
} from "./authSchema";

describe("authSchema setPassword validation and Python digit semantics", () => {
  it("rejects Roman numerals and fractions as backend does", () => {
    const schema = createSetPasswordFormSchema(i18n.t);
    for (const newPassword of ["abcdefghⅧ", "abcdefgh½", "passⅣword", "pass¼word"]) {
      expect(schema.safeParse({ newPassword, confirmPassword: newPassword }).success).toBe(false);
      expect(setPasswordFormSchema.safeParse({ newPassword, confirmPassword: newPassword }).success).toBe(false);
    }
  });

  it("rejects newer Unicode digits such as Garay U+10D40 not in deployed Python 3.12 Unicode 15", () => {
    const garayChar = String.fromCodePoint(0x10d40);
    expect(hasPythonDigit(garayChar)).toBe(false);

    const schema = createSetPasswordFormSchema(i18n.t);
    const candidate = `abcdefgh${garayChar}`;
    expect(schema.safeParse({ newPassword: candidate, confirmPassword: candidate }).success).toBe(false);
  });

  it("counts codepoints for backend minimum rather than UTF-16 code units", () => {
    const schema = createSetPasswordFormSchema(i18n.t);
    const shortAstralPassword = "💡💡💡💡1";
    expect(countUnicodeCodepoints(shortAstralPassword)).toBe(5);
    expect(schema.safeParse({ newPassword: shortAstralPassword, confirmPassword: shortAstralPassword }).success).toBe(false);

    const validAstralPassword = "💡💡💡💡💡💡💡1";
    expect(countUnicodeCodepoints(validAstralPassword)).toBe(8);
    expect(schema.safeParse({ newPassword: validAstralPassword, confirmPassword: validAstralPassword }).success).toBe(true);
  });

  it("accepts genuine Unicode digits matching Python isdigit semantics", () => {
    const schema = createSetPasswordFormSchema(i18n.t);
    const validInputs = [
      "password123",
      "secretpass١",
      "exponent²pass",
      "subscript₀pass",
      "circled①pass",
    ];
    for (const newPassword of validInputs) {
      expect(hasPythonDigit(newPassword)).toBe(true);
      expect(schema.safeParse({ newPassword, confirmPassword: newPassword }).success).toBe(true);
    }
  });

  it("enforces matching confirmPassword", () => {
    const schema = createSetPasswordFormSchema(i18n.t);
    const result = schema.safeParse({
      newPassword: "ValidPassword123",
      confirmPassword: "DifferentPassword123",
    });
    expect(result.success).toBe(false);
  });
});
