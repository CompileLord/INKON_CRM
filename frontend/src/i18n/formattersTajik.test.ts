import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "./index";
import { formatActivityTime, formatRecentRelativeTime, formatSchoolPeriodSpan } from "./formatters";

describe("Tajik period labels", () => {
  beforeEach(async () => {
    const withoutTajik = (locales: Intl.LocalesArgument): string[] => {
      const requested: string[] = typeof locales === "string" ? [locales] : Array.isArray(locales) ? locales.map(String) : [];
      return requested.filter((locale: string) => !locale.startsWith("tg"));
    };
    vi.spyOn(Intl.NumberFormat, "supportedLocalesOf").mockImplementation((locales: Intl.LocalesArgument) => withoutTajik(locales));
    vi.spyOn(Intl.DateTimeFormat, "supportedLocalesOf").mockImplementation((locales: Intl.LocalesArgument) => withoutTajik(locales));
    await i18n.changeLanguage("tg");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await i18n.changeLanguage("en");
  });

  it("writes a whole month with a Tajik month name and never a Russian one", () => {
    expect(formatSchoolPeriodSpan("2026-08-01", "2026-08-31", "tg")).toBe("Авг 2026");
    expect(formatSchoolPeriodSpan("2026-06-01", "2026-06-30", "tg")).toBe("Июн 2026");
  });

  it("writes a partial range with Tajik month names", () => {
    expect(formatSchoolPeriodSpan("2026-10-05", "2026-11-20", "tg")).toBe("5 Окт – 20 Ноя 2026");
  });

  it("writes relative activity times in Tajik and never in Russian", () => {
    const now: Date = new Date("2026-10-20T10:00:00Z");
    expect(formatActivityTime("2026-10-20T10:00:00Z", "tg", now)).toBe("ҳозир");
    expect(formatActivityTime("2026-10-20T09:55:00Z", "tg", now)).toBe("5 дақиқа пеш");
    expect(formatActivityTime("2026-10-20T07:00:00Z", "tg", now)).toBe("3 соат пеш");
    expect(formatRecentRelativeTime("2026-10-20T09:45:00Z", "tg", now)).toBe("15 дақиқа пеш");
    for (const iso of ["2026-10-20T10:00:00Z", "2026-10-20T09:55:00Z", "2026-10-20T07:00:00Z"]) {
      expect(formatActivityTime(iso, "tg", now)).not.toMatch(/минут|час|эту|назад/);
    }
  });
});
