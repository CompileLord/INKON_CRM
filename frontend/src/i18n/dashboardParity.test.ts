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
    const enKeys = getKeys(enDashboard).sort();
    const ruKeys = getKeys(ruDashboard).sort();
    const tgKeys = getKeys(tgDashboard).sort();

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
    expect(enDashboard.title).toBe("Admin Dashboard");
    expect(ruDashboard.title).toBe("Панель администратора");
    expect(tgDashboard.title).toBe("Панели маъмур");

    expect(enDashboard.dueToday).toBe("Due today");
    expect(ruDashboard.dueToday).toBe("Срок сегодня");
    expect(tgDashboard.dueToday).toBe("Мӯҳлат имрӯз");
  });
});
