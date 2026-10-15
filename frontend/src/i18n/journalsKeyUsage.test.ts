import { describe, expect, it } from "vitest";
import enJournals from "./locales/en/journals.json";

type JsonNode = string | { [key: string]: JsonNode };

const sourceModules = import.meta.glob(["../components/**/*.{ts,tsx}", "../pages/**/*.{ts,tsx}", "../lib/**/*.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const combinedSource: string = Object.entries(sourceModules)
  .filter(([path]) => !/\.test\.tsx?$/.test(path) && !path.endsWith("TestSupport.ts"))
  .map(([, source]) => source)
  .join("\n");

const dynamicPrefixes: string[] = Array.from(combinedSource.matchAll(/`(?:journals:)?([A-Za-z.]+)\.\$\{/g)).map((match) => match[1]);

function leafKeysOf(node: JsonNode, prefix: string): string[] {
  if (typeof node === "string") return [prefix];
  return Object.entries(node).flatMap(([key, child]) => leafKeysOf(child, prefix ? `${prefix}.${key}` : key));
}

function withoutPluralSuffix(key: string): string {
  return key.replace(/_(zero|one|two|few|many|other)$/, "");
}

function isReferenced(key: string): boolean {
  const base: string = withoutPluralSuffix(key);
  const quoted: boolean = [`"${base}"`, `'${base}'`, `\`${base}\``, `:${base}"`].some((needle) => combinedSource.includes(needle));
  return quoted || dynamicPrefixes.some((prefix) => base.startsWith(`${prefix}.`));
}

describe("journals locale keys are all used", () => {
  it("finds the application sources it scans", () => {
    expect(combinedSource.length).toBeGreaterThan(50_000);
    expect(isReferenced("workspace.periodSettings")).toBe(true);
  });

  it("has no key that no component, page or hook references", () => {
    const unused: string[] = leafKeysOf(enJournals as JsonNode, "").filter((key) => !isReferenced(key));
    expect(unused).toEqual([]);
  });

  it("detects a key nothing references", () => {
    expect(isReferenced("save.allSaved")).toBe(false);
  });
});
