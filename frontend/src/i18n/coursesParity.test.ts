import { describe, it, expect } from "vitest";
import enCourses from "./locales/en/courses.json";
import ruCourses from "./locales/ru/courses.json";
import tgCourses from "./locales/tg/courses.json";

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

describe("courses i18n key parity", () => {
  it("ensures all keys match bidirectionally across en, ru, and tg", () => {
    const enKeys = getKeys(enCourses).sort();
    const ruKeys = getKeys(ruCourses).sort();
    const tgKeys = getKeys(tgCourses).sort();

    const normalize = (keys: string[]) =>
      keys.filter((k) => !k.endsWith("_few") && !k.endsWith("_many"));

    const normEn = normalize(enKeys);
    const normRu = normalize(ruKeys);
    const normTg = normalize(tgKeys);

    const missingInRu = normEn.filter((k) => !normRu.includes(k));
    const missingInTg = normEn.filter((k) => !normTg.includes(k));
    const strayInRu = normRu.filter((k) => !normEn.includes(k));
    const strayInTg = normTg.filter((k) => !normEn.includes(k));

    expect(missingInRu).toEqual([]);
    expect(missingInTg).toEqual([]);
    expect(strayInRu).toEqual([]);
    expect(strayInTg).toEqual([]);
  });

  it("verifies essential Group 02 course directory keys across all locales", () => {
    expect(enCourses.searchPageScope).toContain("{{count}}");
    expect(ruCourses.searchPageScope).toContain("{{count}}");
    expect(tgCourses.searchPageScope).toContain("{{count}}");

    expect(enCourses.filters).toBe("Filters");
    expect(ruCourses.filters).toBe("Фильтры");
    expect(tgCourses.filters).toBe("Филтрҳо");

    expect(enCourses.emptyCatalogAdmin).not.toBe("");
    expect(ruCourses.emptyCatalogAdmin).not.toBe("");
    expect(tgCourses.emptyCatalogAdmin).not.toBe("");

    expect(enCourses.emptyCatalogMentor).not.toBe("");
    expect(ruCourses.emptyCatalogMentor).not.toBe("");
    expect(tgCourses.emptyCatalogMentor).not.toBe("");
  });
});
