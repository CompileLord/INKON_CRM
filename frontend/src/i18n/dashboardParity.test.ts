import { describe, it, expect } from "vitest";
import enDashboard from "./locales/en/dashboard.json";
import ruDashboard from "./locales/ru/dashboard.json";
import tgDashboard from "./locales/tg/dashboard.json";

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

describe("dashboard i18n key parity", () => {
  it("ensures all dashboard keys match bidirectionally across en, ru, and tg", () => {
    const pluralSuffix = /_(zero|one|two|few|many|other)$/;
    const baseKeys = (source: unknown): string[] => [...new Set(getKeys(source).map((key) => key.replace(pluralSuffix, "")))].sort();
    const enKeys = baseKeys(enDashboard);
    const ruKeys = baseKeys(ruDashboard);
    const tgKeys = baseKeys(tgDashboard);

    const missingInRu = enKeys.filter((k) => !ruKeys.includes(k));
    const missingInTg = enKeys.filter((k) => !tgKeys.includes(k));
    const strayInRu = ruKeys.filter((k) => !enKeys.includes(k));
    const strayInTg = tgKeys.filter((k) => !enKeys.includes(k));

    expect(missingInRu).toEqual([]);
    expect(missingInTg).toEqual([]);
    expect(strayInRu).toEqual([]);
    expect(strayInTg).toEqual([]);
  });

  it("verifies superadmin dashboard operational copy is localized across all three languages", () => {
    expect(enDashboard.greeting.morning).toBe("Good morning");
    expect(ruDashboard.greeting.afternoon).toBe("Добрый день");
    expect(tgDashboard.greeting.evening).toBe("Бегоҳи хуш");

    expect(enDashboard.dueToday).toBe("Due today");
    expect(ruDashboard.dueToday).toBe("Срок сегодня");
    expect(tgDashboard.dueToday).toBe("Мӯҳлат имрӯз");
  });

  it("defines the plural forms each language needs for the attention overdue duration", () => {
    expect(getKeys(enDashboard)).toEqual(expect.arrayContaining(["overdueDays_one", "overdueDays_other"]));
    expect(getKeys(ruDashboard)).toEqual(expect.arrayContaining(["overdueDays_one", "overdueDays_few", "overdueDays_many", "overdueDays_other"]));
    expect(getKeys(tgDashboard)).toEqual(expect.arrayContaining(["overdueDays_one", "overdueDays_other"]));
  });

  it("defines the ordinal absence streak forms each language needs", () => {
    expect(getKeys(enDashboard)).toEqual(expect.arrayContaining(["absenceStreak_ordinal_one", "absenceStreak_ordinal_two", "absenceStreak_ordinal_few", "absenceStreak_ordinal_other"]));
    expect(getKeys(ruDashboard)).toContain("absenceStreak_ordinal_other");
    expect(getKeys(tgDashboard)).toContain("absenceStreak_ordinal_other");
  });
});
