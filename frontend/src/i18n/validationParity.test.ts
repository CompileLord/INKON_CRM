import { describe, it, expect } from "vitest";
import enValidation from "./locales/en/validation.json";
import ruValidation from "./locales/ru/validation.json";
import tgValidation from "./locales/tg/validation.json";

function getKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [];
  let keys: string[] = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null) {
      keys = keys.concat(getKeys(value, fullPath));
    } else {
      keys.push(fullPath);
    }
  }
  return keys;
}

describe("validation i18n key parity", () => {
  it("ensures all validation keys match bidirectionally across en, ru, and tg", () => {
    const enKeys = getKeys(enValidation).sort();
    const ruKeys = getKeys(ruValidation).sort();
    const tgKeys = getKeys(tgValidation).sort();

    const missingInRu = enKeys.filter((k) => !ruKeys.includes(k));
    const missingInTg = enKeys.filter((k) => !tgKeys.includes(k));
    const strayInRu = ruKeys.filter((k) => !enKeys.includes(k));
    const strayInTg = tgKeys.filter((k) => !enKeys.includes(k));

    expect(missingInRu).toEqual([]);
    expect(missingInTg).toEqual([]);
    expect(strayInRu).toEqual([]);
    expect(strayInTg).toEqual([]);
  });

  it("verifies password requirement keys are present and localized", () => {
    expect(enValidation.passwordRequiresDigit).toBe("Password must contain at least 1 digit");
    expect(ruValidation.passwordRequiresDigit).toBe("Пароль должен содержать хотя бы одну цифру");
    expect(tgValidation.passwordRequiresDigit).toBe("Парол бояд ҳадди ақал як рақам дошта бошад");
  });
});
