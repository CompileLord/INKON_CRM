import { describe, it, expect } from "vitest";
import enCommon from "./locales/en/common.json";
import ruCommon from "./locales/ru/common.json";
import tgCommon from "./locales/tg/common.json";

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

describe("common i18n key parity", () => {
  it("ensures all keys match bidirectionally across en, ru, and tg", () => {
    const enKeys = getKeys(enCommon).sort();
    const ruKeys = getKeys(ruCommon).sort();
    const tgKeys = getKeys(tgCommon).sort();

    const missingInRu = enKeys.filter((k) => !ruKeys.includes(k));
    const missingInTg = enKeys.filter((k) => !tgKeys.includes(k));
    const strayInRu = ruKeys.filter((k) => !enKeys.includes(k));
    const strayInTg = tgKeys.filter((k) => !enKeys.includes(k));

    expect(missingInRu).toEqual([]);
    expect(missingInTg).toEqual([]);
    expect(strayInRu).toEqual([]);
    expect(strayInTg).toEqual([]);
  });

  it("verifies brand and theme keys are present and localized", () => {
    expect(enCommon.brand.name).toBe("KITOB");
    expect(ruCommon.brand.name).toBe("КИТОБ");
    expect(tgCommon.brand.name).toBe("КИТОБ");

    expect(enCommon.theme.light).toBe("Light theme");
    expect(ruCommon.theme.light).toBe("Светлая тема");
    expect(tgCommon.theme.light).toBe("Мавзӯи равшан");
  });
});
