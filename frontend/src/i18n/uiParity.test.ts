import { describe, it, expect } from "vitest";
import enUi from "./locales/en/ui.json";
import ruUi from "./locales/ru/ui.json";
import tgUi from "./locales/tg/ui.json";

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

describe("ui i18n key parity", () => {
  it("ensures all keys match bidirectionally across en, ru, and tg", () => {
    const enKeys = getKeys(enUi).sort();
    const ruKeys = getKeys(ruUi).sort();
    const tgKeys = getKeys(tgUi).sort();

    const missingInRu = enKeys.filter((k) => !ruKeys.includes(k));
    const missingInTg = enKeys.filter((k) => !tgKeys.includes(k));
    const strayInRu = ruKeys.filter((k) => !enKeys.includes(k));
    const strayInTg = tgKeys.filter((k) => !enKeys.includes(k));

    expect(missingInRu).toEqual([]);
    expect(missingInTg).toEqual([]);
    expect(strayInRu).toEqual([]);
    expect(strayInTg).toEqual([]);
  });

});
