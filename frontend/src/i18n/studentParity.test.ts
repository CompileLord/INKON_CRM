import { describe, it, expect } from "vitest";
import enStudent from "./locales/en/student.json";
import ruStudent from "./locales/ru/student.json";
import tgStudent from "./locales/tg/student.json";

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

describe("student i18n key parity", () => {
  it("ensures bidirectional key parity across en, ru, and tg for student.json", () => {
    const enKeys = getKeys(enStudent).sort();
    const ruKeys = getKeys(ruStudent).sort();
    const tgKeys = getKeys(tgStudent).sort();

    expect(enKeys.filter((k) => !ruKeys.includes(k))).toEqual([]);
    expect(enKeys.filter((k) => !tgKeys.includes(k))).toEqual([]);
    expect(ruKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
    expect(tgKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
  });
});
