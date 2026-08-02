import { describe, it, expect } from "vitest";
import enJournals from "./locales/en/journals.json";
import ruJournals from "./locales/ru/journals.json";
import tgJournals from "./locales/tg/journals.json";

function getKeys(obj: Record<string, any>, prefix = ""): string[] {
  let keys: string[] = [];
  for (const key of Object.keys(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === "object" && obj[key] !== null) {
      keys = keys.concat(getKeys(obj[key], fullPath));
    } else {
      keys.push(fullPath);
    }
  }
  return keys;
}

describe("journals i18n key parity", () => {
  it("ensures all keys present in en/journals.json exist in ru and tg", () => {
    const enKeys = getKeys(enJournals).sort();
    const ruKeys = getKeys(ruJournals).sort();
    const tgKeys = getKeys(tgJournals).sort();

    const missingInRu = enKeys.filter((k) => !ruKeys.includes(k));
    const missingInTg = enKeys.filter((k) => !tgKeys.includes(k));

    expect(missingInRu).toEqual([]);
    expect(missingInTg).toEqual([]);
  });

  it("verifies that table.sum is translated properly across all locales", () => {
    expect(enJournals.table.sum).not.toBe("Sum");
    expect(ruJournals.table.sum).toBe("Итог");
    expect(tgJournals.table.sum).toBe("Ҷамъ");
  });
});
