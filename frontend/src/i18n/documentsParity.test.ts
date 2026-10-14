import { describe, expect, it } from "vitest";
import en from "./locales/en/documents.json";
import ru from "./locales/ru/documents.json";
import tg from "./locales/tg/documents.json";

describe("documents locale parity", () => {
  it("keeps all namespace keys synchronized bidirectionally", () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(tg).sort()).toEqual(Object.keys(en).sort());
  });
});
