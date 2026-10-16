import { describe, it, expect } from "vitest";
import enMentors from "./locales/en/mentors.json";
import ruMentors from "./locales/ru/mentors.json";
import tgMentors from "./locales/tg/mentors.json";

function getKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  let keys: string[] = [];
  for (const key of Object.keys(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (typeof value === "object" && value !== null) {
      keys = keys.concat(getKeys(value as Record<string, unknown>, fullPath));
    } else {
      keys.push(fullPath);
    }
  }
  return keys;
}

describe("mentors i18n key parity", () => {
  it("ensures bidirectional key parity across en, ru, and tg for mentors.json", () => {
    const enKeys = getKeys(enMentors).sort();
    const ruKeys = getKeys(ruMentors).sort();
    const tgKeys = getKeys(tgMentors).sort();

    expect(enKeys.filter((k) => !ruKeys.includes(k))).toEqual([]);
    expect(enKeys.filter((k) => !tgKeys.includes(k))).toEqual([]);
    expect(ruKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
    expect(tgKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
  });
});
