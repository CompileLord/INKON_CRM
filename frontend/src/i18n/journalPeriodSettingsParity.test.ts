import { describe, it, expect } from "vitest";
import enPeriodSettings from "./locales/en/journalPeriodSettings.json";
import ruPeriodSettings from "./locales/ru/journalPeriodSettings.json";
import tgPeriodSettings from "./locales/tg/journalPeriodSettings.json";

type JsonNode = string | { [key: string]: JsonNode };

function leafPathsOf(node: JsonNode, prefix: string): string[] {
  if (typeof node === "string") return [prefix];
  return Object.entries(node).flatMap(([key, child]) => leafPathsOf(child, prefix ? `${prefix}.${key}` : key));
}

function readLeaf(source: JsonNode, path: string): string | undefined {
  const found: JsonNode | undefined = path
    .split(".")
    .reduce<JsonNode | undefined>((node, part) => (node === undefined || typeof node === "string" ? undefined : node[part]), source);
  return typeof found === "string" ? found : undefined;
}

describe("journalPeriodSettings i18n key parity", () => {
  const enKeys: string[] = leafPathsOf(enPeriodSettings, "").sort();
  const ruKeys: string[] = leafPathsOf(ruPeriodSettings, "").sort();
  const tgKeys: string[] = leafPathsOf(tgPeriodSettings, "").sort();

  it("ensures all keys match bidirectionally across en, ru, and tg", () => {
    expect(enKeys.filter((key) => !ruKeys.includes(key))).toEqual([]);
    expect(enKeys.filter((key) => !tgKeys.includes(key))).toEqual([]);
    expect(ruKeys.filter((key) => !enKeys.includes(key))).toEqual([]);
    expect(tgKeys.filter((key) => !enKeys.includes(key))).toEqual([]);
  });

  it("keeps the bonus maximum copy in every locale", () => {
    for (const source of [enPeriodSettings, ruPeriodSettings, tgPeriodSettings]) {
      expect(readLeaf(source, "bonusInputLabel")).toBeTruthy();
      expect(readLeaf(source, "currentMaximum")).toContain("{{score}}");
      expect(readLeaf(source, "invalid.bonusOutOfRange")).toBeTruthy();
    }
  });

  it("translates every key instead of leaving English text in ru and tg", () => {
    for (const path of enKeys) {
      const english: string = readLeaf(enPeriodSettings, path) ?? "";
      for (const [locale, source] of [["ru", ruPeriodSettings], ["tg", tgPeriodSettings]] as const) {
        const translated: string | undefined = readLeaf(source, path);
        expect(translated, `${locale}.${path} must exist`).toBeTruthy();
        expect(translated, `${locale}.${path} must not be English`).not.toBe(english);
      }
    }
  });
});
