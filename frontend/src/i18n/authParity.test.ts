import { describe, it, expect } from "vitest";
import enAuth from "./locales/en/auth.json";
import ruAuth from "./locales/ru/auth.json";
import tgAuth from "./locales/tg/auth.json";

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

describe("auth i18n key parity", () => {
  it("ensures all auth keys match bidirectionally across en, ru, and tg", () => {
    const enKeys = getKeys(enAuth).sort();
    const ruKeys = getKeys(ruAuth).sort();
    const tgKeys = getKeys(tgAuth).sort();

    const missingInRu = enKeys.filter((k) => !ruKeys.includes(k));
    const missingInTg = enKeys.filter((k) => !tgKeys.includes(k));
    const strayInRu = ruKeys.filter((k) => !enKeys.includes(k));
    const strayInTg = tgKeys.filter((k) => !enKeys.includes(k));

    expect(missingInRu).toEqual([]);
    expect(missingInTg).toEqual([]);
    expect(strayInRu).toEqual([]);
    expect(strayInTg).toEqual([]);
  });

  it("verifies login editorial copy and critical error keys are localized", () => {
    expect(enAuth.editorialTitle).toBe("Open a new chapter.");
    expect(ruAuth.editorialTitle).toBe("Откройте новую главу.");
    expect(tgAuth.editorialTitle).toBe("Фасли навро оғоз кунед.");

    expect(enAuth.invalidCredentials).toBe("Invalid login or password");
    expect(ruAuth.invalidCredentials).toBe("Неверный логин или пароль");
    expect(tgAuth.invalidCredentials).toBe("Логин ё пароли нодуруст аст");
  });
});
