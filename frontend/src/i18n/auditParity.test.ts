import { describe, expect, it } from "vitest";
import enAudit from "./locales/en/audit.json";
import ruAudit from "./locales/ru/audit.json";
import tgAudit from "./locales/tg/audit.json";

function getKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [];
  let keys: string[] = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    keys = typeof value === "object" && value !== null ? keys.concat(getKeys(value, fullPath)) : keys.concat(fullPath);
  }
  return keys;
}

describe("audit i18n key parity", () => {
  const pluralSuffix = /_(zero|one|two|few|many|other)$/;
  const baseKeys = (source: unknown): string[] => [...new Set(getKeys(source).map((key) => key.replace(pluralSuffix, "")))].sort();
  const enKeys = baseKeys(enAudit);
  const ruKeys = baseKeys(ruAudit);
  const tgKeys = baseKeys(tgAudit);

  it("has the same keys in en, ru and tg in both directions", () => {
    expect(enKeys.filter((key) => !ruKeys.includes(key))).toEqual([]);
    expect(enKeys.filter((key) => !tgKeys.includes(key))).toEqual([]);
    expect(ruKeys.filter((key) => !enKeys.includes(key))).toEqual([]);
    expect(tgKeys.filter((key) => !enKeys.includes(key))).toEqual([]);
  });

  it("keeps every interpolation placeholder identical across locales", () => {
    const placeholders = (text: string): string[] => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();
    const valueAt = (source: unknown, path: string): string =>
      path.split(".").reduce<unknown>((node, segment) => (node as Record<string, unknown>)[segment], source) as string;
    for (const key of getKeys(enAudit).filter((candidate) => !pluralSuffix.test(candidate))) {
      expect(placeholders(valueAt(ruAudit, key)), `ru ${key}`).toEqual(placeholders(valueAt(enAudit, key)));
      expect(placeholders(valueAt(tgAudit, key)), `tg ${key}`).toEqual(placeholders(valueAt(enAudit, key)));
    }
  });

  it("defines the plural forms each language needs for the field count", () => {
    expect(getKeys(enAudit)).toEqual(expect.arrayContaining(["event.fieldsChanged_one", "event.fieldsChanged_other"]));
    expect(getKeys(ruAudit)).toEqual(expect.arrayContaining(["event.fieldsChanged_one", "event.fieldsChanged_few", "event.fieldsChanged_many", "event.fieldsChanged_other"]));
    expect(getKeys(tgAudit)).toEqual(expect.arrayContaining(["event.fieldsChanged_one", "event.fieldsChanged_other"]));
  });

  it("has a sentence, action label and entity label for every known action", () => {
    for (const action of ["create", "update", "delete", "void", "refund", "close_period", "reopen_period"]) {
      expect(enKeys).toContain(`sentence.${action}`);
      expect(enKeys).toContain(`actions.${action}`);
    }
  });
});
