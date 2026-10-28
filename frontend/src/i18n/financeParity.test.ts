import { describe, it, expect } from "vitest";
import enFinance from "./locales/en/finance.json";
import ruFinance from "./locales/ru/finance.json";
import tgFinance from "./locales/tg/finance.json";

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

const pluralSuffix = /_(zero|one|two|few|many|other)$/;
const baseKeys = (source: unknown): string[] => [...new Set(getKeys(source).map((key) => key.replace(pluralSuffix, "")))].sort();

describe("finance i18n key parity", () => {
  it("ensures all finance keys match bidirectionally across en, ru, and tg", () => {
    const enKeys = baseKeys(enFinance);
    const ruKeys = baseKeys(ruFinance);
    const tgKeys = baseKeys(tgFinance);

    const missingInRu = enKeys.filter((k) => !ruKeys.includes(k));
    const missingInTg = enKeys.filter((k) => !tgKeys.includes(k));
    const strayInRu = ruKeys.filter((k) => !enKeys.includes(k));
    const strayInTg = tgKeys.filter((k) => !enKeys.includes(k));

    expect(missingInRu).toEqual([]);
    expect(missingInTg).toEqual([]);
    expect(strayInRu).toEqual([]);
    expect(strayInTg).toEqual([]);
  });

  it("defines the debtor count plural forms each language needs", () => {
    expect(getKeys(enFinance)).toEqual(expect.arrayContaining(["debtorsTab.total_one", "debtorsTab.total_other"]));
    expect(getKeys(ruFinance)).toEqual(expect.arrayContaining(["debtorsTab.total_one", "debtorsTab.total_few", "debtorsTab.total_many", "debtorsTab.total_other"]));
    expect(getKeys(tgFinance)).toEqual(expect.arrayContaining(["debtorsTab.total_one", "debtorsTab.total_other"]));
  });
});
