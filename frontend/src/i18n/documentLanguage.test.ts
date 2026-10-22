import { afterEach, describe, expect, it } from "vitest";
import i18n, { DocumentLanguage } from "./index";

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("html lang attribute", () => {
  it.each(["en", "ru", "tg"])("follows the UI language %s on switch", async (language: string) => {
    await i18n.changeLanguage(language);
    expect(document.documentElement.lang).toBe(language);
  });

  it("strips a region subtag", () => {
    DocumentLanguage.apply("ru-RU");
    expect(document.documentElement.lang).toBe("ru");
  });
});
