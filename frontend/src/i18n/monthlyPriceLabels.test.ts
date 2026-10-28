import { describe, expect, it } from "vitest";
import enCourses from "./locales/en/courses.json";
import ruCourses from "./locales/ru/courses.json";
import tgCourses from "./locales/tg/courses.json";
import enFinance from "./locales/en/finance.json";
import ruFinance from "./locales/ru/finance.json";
import tgFinance from "./locales/tg/finance.json";

describe("monthly price labels", () => {
  it("labels the course form price as a monthly price in every locale", () => {
    expect(enCourses.form.priceLabel).toBe("Monthly price");
    expect(ruCourses.form.priceLabel).toBe("Цена в месяц");
    expect(tgCourses.form.priceLabel).toBe("Нарх дар як моҳ");
  });

  it("labels the debtor price as monthly instead of a contract total in every locale", () => {
    expect(enFinance.debtorsTab.contracted).toBe("Monthly price");
    expect(ruFinance.debtorsTab.contracted).toBe("Цена в месяц");
    expect(tgFinance.debtorsTab.contracted).toBe("Нарх дар як моҳ");
  });
});
