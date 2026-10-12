import { describe, it, expect } from "vitest";
import enEnrollments from "./locales/en/enrollments.json";
import ruEnrollments from "./locales/ru/enrollments.json";
import tgEnrollments from "./locales/tg/enrollments.json";

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

describe("enrollments i18n key parity", () => {
  it("ensures all keys match bidirectionally across en, ru, and tg", () => {
    const enKeys = getKeys(enEnrollments).sort();
    const ruKeys = getKeys(ruEnrollments).sort();
    const tgKeys = getKeys(tgEnrollments).sort();

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

  it("verifies enrollment status keys across all locales", () => {
    expect(enEnrollments.status.active).toBe("Active");
    expect(ruEnrollments.status.active).toBe("Активен");
    expect(tgEnrollments.status.active).toBe("Фаъол");

    expect(enEnrollments.status.withdrawn).toBe("Withdrawn");
    expect(ruEnrollments.status.withdrawn).toBe("Отчислен");
    expect(tgEnrollments.status.withdrawn).toBe("Хориҷшуда");

    expect(enEnrollments.status.completed).toBe("Completed");
    expect(ruEnrollments.status.completed).toBe("Завершен");
    expect(tgEnrollments.status.completed).toBe("Хатмкарда");
  });
});
