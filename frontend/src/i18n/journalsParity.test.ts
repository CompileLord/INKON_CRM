import { describe, it, expect } from "vitest";
import enJournals from "./locales/en/journals.json";
import ruJournals from "./locales/ru/journals.json";
import tgJournals from "./locales/tg/journals.json";

type JsonObject = { [key: string]: string | JsonObject };

function getKeys(obj: JsonObject, prefix = ""): string[] {
  let keys: string[] = [];
  for (const key of Object.keys(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    const child = obj[key];
    if (typeof child === "object" && child !== null) {
      keys = keys.concat(getKeys(child, fullPath));
    } else {
      keys.push(fullPath);
    }
  }
  return keys;
}

describe("journals i18n key parity", () => {
  it("ensures all keys match bidirectionally across en, ru, and tg", () => {
    const enKeys = getKeys(enJournals).sort();
    const ruKeys = getKeys(ruJournals).sort();
    const tgKeys = getKeys(tgJournals).sort();

    // Filter out plural variation keys like _one, _few, _many
    const normalize = (keys: string[]) => keys.filter((k) => !k.endsWith("_few") && !k.endsWith("_many"));

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

  it("verifies that table.sum is translated properly across all locales", () => {
    expect(enJournals.table.sum).not.toBe("Sum");
    expect(ruJournals.table.sum).toBe("Итог");
    expect(tgJournals.table.sum).toBe("Ҷамъ");
  });

  it("translates the reliability copy instead of leaving English text in ru and tg", () => {
    const reliabilityPaths = ["cellStatus", "status", "drain", "table.summaryInvalid"];
    const conflictKeys = ["yourValue", "serverValue", "useServer", "discardMine", "refetch", "entryUnavailable", "noComment"];
    const readPath = (source: JsonObject, path: string): Record<string, string> =>
      path.split(".").reduce<JsonObject>((node, part) => node[part] as JsonObject, source) as Record<string, string>;

    for (const path of reliabilityPaths) {
      const english = readPath(enJournals, path);
      for (const [locale, translated] of [["ru", readPath(ruJournals, path)], ["tg", readPath(tgJournals, path)]] as const) {
        for (const key of Object.keys(english)) {
          expect(translated[key], `${locale}.${path}.${key}`).toBeTruthy();
          expect(translated[key], `${locale}.${path}.${key} must not be English`).not.toBe(english[key]);
        }
      }
    }
    for (const key of conflictKeys) {
      expect(ruJournals.conflict[key as keyof typeof ruJournals.conflict]).not.toBe(enJournals.conflict[key as keyof typeof enJournals.conflict]);
      expect(tgJournals.conflict[key as keyof typeof tgJournals.conflict]).not.toBe(enJournals.conflict[key as keyof typeof enJournals.conflict]);
    }
  });
  it("translates every hub key instead of leaving English text in ru and tg", () => {
    const readHub = (source: JsonObject): JsonObject => source.hub as JsonObject;
    const compareLeaves = (english: JsonObject, translated: JsonObject, path: string): void => {
      for (const key of Object.keys(english)) {
        const leafPath = `${path}.${key}`;
        if (typeof english[key] === "object") {
          compareLeaves(english[key] as JsonObject, translated[key] as JsonObject, leafPath);
          continue;
        }
        expect(translated[key], `${leafPath} must exist`).toBeTruthy();
        expect(translated[key], `${leafPath} must not be English`).not.toBe(english[key]);
      }
    };
    compareLeaves(readHub(enJournals), readHub(ruJournals), "ru.hub");
    compareLeaves(readHub(enJournals), readHub(tgJournals), "tg.hub");
  });

  it("translates the workspace copy instead of leaving English text in ru and tg", () => {
    const sharedAcrossLocales = new Set(["help.keycap.arrows", "help.keycap.grade", "help.keycap.comment", "help.keycap.clear", "help.keycap.close"]);
    const workspaceSections = ["workspace", "grid", "help", "summary", "period.latest", "period.upcoming", "picker", "comment", "search", "atRisk", "bulk", "progress", "accessDenied", "accessDeniedBody", "notFound", "notFoundBody"];
    const tableKeys = ["noStudentsBody", "noStudentsAdminBody", "addStudents", "examCellLabel", "bonusCellLabel", "readOnlyCellLabel", "present", "absent", "sumMaximumTitle"];
    type JsonNode = string | { [key: string]: JsonNode };
    const readPath = (source: JsonNode, path: string): JsonNode =>
      path.split(".").reduce<JsonNode>((node, part) => (typeof node === "string" ? node : node[part]), source);
    const leavesOf = (value: JsonNode, path: string): Array<[string, string]> =>
      typeof value === "object" ? Object.entries(value).flatMap(([key, child]) => leavesOf(child, `${path}.${key}`)) : [[path, value]];

    const sections = [
      ...workspaceSections.map((path) => [path, readPath(enJournals, path)] as const),
      ...tableKeys.map((key) => [`table.${key}`, readPath(enJournals, `table.${key}`)] as const),
    ];
    for (const [path, english] of sections) {
      for (const [leafPath, englishText] of leavesOf(english, path)) {
        if (sharedAcrossLocales.has(leafPath)) continue;
        if (!/[A-Za-z]/.test(englishText.replace(/\{\{[^}]+\}\}/g, ""))) continue;
        for (const [locale, source] of [["ru", ruJournals], ["tg", tgJournals]] as const) {
          const translated = readPath(source, leafPath);
          expect(translated, `${locale}.${leafPath} must exist`).toBeTruthy();
          expect(translated, `${locale}.${leafPath} must not be English`).not.toBe(englishText);
        }
      }
    }
  });

  it("drops the retired chart-above-grid, metric card and permanent shortcut copy", () => {
    for (const source of [enJournals, ruJournals, tgJournals]) {
      expect("metrics" in source).toBe(false);
      expect("gridHelp" in source.table).toBe(false);
      expect("jumpToCurrent" in source).toBe(false);
    }
  });
});
