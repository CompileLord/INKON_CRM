import { describe, it, expect } from "vitest";
import enStudents from "./locales/en/students.json";
import ruStudents from "./locales/ru/students.json";
import tgStudents from "./locales/tg/students.json";

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

describe("students i18n key parity", () => {
  it("ensures bidirectional key parity across en, ru, and tg for students.json", () => {
    const enKeys = getKeys(enStudents).sort();
    const ruKeys = getKeys(ruStudents).sort();
    const tgKeys = getKeys(tgStudents).sort();

    expect(enKeys.filter((k) => !ruKeys.includes(k))).toEqual([]);
    expect(enKeys.filter((k) => !tgKeys.includes(k))).toEqual([]);
    expect(ruKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
    expect(tgKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
  });
});
