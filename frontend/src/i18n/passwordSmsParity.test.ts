import { describe, it, expect } from "vitest";
import en from "./locales/en/passwordSms.json";
import ru from "./locales/ru/passwordSms.json";
import tg from "./locales/tg/passwordSms.json";

function getKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.keys(obj).flatMap((key) => {
    const value = obj[key];
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "object" && value !== null ? getKeys(value as Record<string, unknown>, path) : [path];
  });
}

describe("passwordSms i18n key parity", () => {
  it("has the same keys in en, ru and tg in both directions", () => {
    const enKeys = getKeys(en).sort();
    const ruKeys = getKeys(ru).sort();
    const tgKeys = getKeys(tg).sort();
    expect(enKeys.filter((key) => !ruKeys.includes(key))).toEqual([]);
    expect(enKeys.filter((key) => !tgKeys.includes(key))).toEqual([]);
    expect(ruKeys.filter((key) => !enKeys.includes(key))).toEqual([]);
    expect(tgKeys.filter((key) => !enKeys.includes(key))).toEqual([]);
  });

  it("leaves no empty translation values", () => {
    for (const locale of [en, ru, tg]) {
      for (const key of getKeys(locale)) {
        const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], locale);
        expect(String(value).trim(), key).not.toBe("");
      }
    }
  });
});
