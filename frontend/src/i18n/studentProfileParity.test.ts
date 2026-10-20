import { describe, expect, it } from "vitest";
import enStudentProfile from "./locales/en/studentProfile.json";
import ruStudentProfile from "./locales/ru/studentProfile.json";
import tgStudentProfile from "./locales/tg/studentProfile.json";

type JsonNode = string | { [key: string]: JsonNode };

function leafKeysOf(node: JsonNode, prefix: string): string[] {
  if (typeof node === "string") return [prefix];
  return Object.entries(node).flatMap(([key, child]) => leafKeysOf(child, prefix ? `${prefix}.${key}` : key));
}

const withoutRussianOnlyPlurals = (keys: string[]): string[] => keys.filter((key) => !key.endsWith("_few") && !key.endsWith("_many"));

const sourceModules = import.meta.glob(["../components/**/*.{ts,tsx}", "../pages/**/*.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const combinedSource: string = Object.entries(sourceModules)
  .filter(([path]) => !/\.test\.tsx?$/.test(path) && !path.endsWith("TestSupport.tsx"))
  .map(([, source]) => source)
  .join("\n");

const dynamicPrefixes: string[] = Array.from(combinedSource.matchAll(/`([A-Za-z.]+)\.\$\{/g)).map((match) => match[1]);

function isReferenced(key: string): boolean {
  const base: string = key.replace(/_(zero|one|two|few|many|other)$/, "");
  const quoted: boolean = [`"${base}"`, `'${base}'`, `\`${base}\``].some((needle) => combinedSource.includes(needle));
  return quoted || dynamicPrefixes.some((prefix) => base.startsWith(`${prefix}.`));
}

describe("studentProfile i18n key parity", () => {
  it("has the same keys in en, ru and tg in both directions", () => {
    const enKeys: string[] = withoutRussianOnlyPlurals(leafKeysOf(enStudentProfile as JsonNode, "")).sort();
    const ruKeys: string[] = withoutRussianOnlyPlurals(leafKeysOf(ruStudentProfile as JsonNode, "")).sort();
    const tgKeys: string[] = withoutRussianOnlyPlurals(leafKeysOf(tgStudentProfile as JsonNode, "")).sort();
    expect(enKeys.filter((key) => !ruKeys.includes(key))).toEqual([]);
    expect(enKeys.filter((key) => !tgKeys.includes(key))).toEqual([]);
    expect(ruKeys.filter((key) => !enKeys.includes(key))).toEqual([]);
    expect(tgKeys.filter((key) => !enKeys.includes(key))).toEqual([]);
  });

  it("has no empty translation", () => {
    for (const bundle of [enStudentProfile, ruStudentProfile, tgStudentProfile]) {
      expect(leafKeysOf(bundle as JsonNode, "").filter((key) => {
        const value: string = key.split(".").reduce<JsonNode>((node, part) => (node as { [key: string]: JsonNode })[part], bundle as JsonNode) as string;
        return value.trim() === "";
      })).toEqual([]);
    }
  });

  it("has no key that no component or page references", () => {
    expect(combinedSource.length).toBeGreaterThan(50_000);
    expect(leafKeysOf(enStudentProfile as JsonNode, "").filter((key) => !isReferenced(key))).toEqual([]);
  });

  it("detects a key nothing references", () => {
    expect(isReferenced("definitely.notAKey")).toBe(false);
  });
});
