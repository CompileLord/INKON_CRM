import { describe, expect, it } from "vitest";
import en from "./locales/en/documents.json";
import ru from "./locales/ru/documents.json";
import tg from "./locales/tg/documents.json";

function flattenKeys(value: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path: string = prefix ? `${prefix}.${key}` : key;
    return typeof child === "object" && child !== null ? flattenKeys(child as Record<string, unknown>, path) : [path];
  });
}

describe("documents locale parity", () => {
  const englishKeys: string[] = flattenKeys(en).sort();

  it("keeps every nested key identical in Russian and Tajik, in both directions", () => {
    expect(flattenKeys(ru).sort()).toEqual(englishKeys);
    expect(flattenKeys(tg).sort()).toEqual(englishKeys);
    expect(englishKeys.filter(key => !flattenKeys(ru).includes(key))).toEqual([]);
    expect(flattenKeys(tg).filter(key => !englishKeys.includes(key))).toEqual([]);
  });

  it("never mentions the removed 20 MB limit or DOC/ZIP formats", () => {
    for (const bundle of [en, ru, tg]) expect(JSON.stringify(bundle)).not.toMatch(/20\s?(MB|МБ)|\.zip|\.doc\b|ZIP/i);
  });
});
