import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatTime,
  formatSchoolLessonDateTime,
  formatSchoolLessonDate,
  formatSchoolLessonTime,
  formatSchoolLessonWeekday,
  formatPercentage,
  getActiveLocale,
  SCHOOL_TIMEZONE,
  getSchoolCalendarDate,
  formatNumber,
  schoolCalendarDateToTimestamp,
  getSchoolMonthRange,
  getSchoolWeekdayIndex,
} from "./formatters";

describe("formatters with timezone support", () => {
  const sampleInstant = "2026-10-12T04:00:00Z";

  it("exports SCHOOL_TIMEZONE as Asia/Dushanbe", () => {
    expect(SCHOOL_TIMEZONE).toBe("Asia/Dushanbe");
  });

  it("formats school lesson datetime in Dushanbe timezone (UTC+5)", () => {
    const formattedRu = formatSchoolLessonDateTime(sampleInstant, "ru");
    expect(formattedRu).toContain("12.10.2026");
    expect(formattedRu).toContain("09:00");

    const formattedEn = formatSchoolLessonDateTime(sampleInstant, "en");
    expect(formattedEn).toBe("12.10.2026 09:00");

    const formattedTg = formatSchoolLessonDateTime(sampleInstant, "tg");
    expect(formattedTg).toMatch(/12[./]10[./]2026/);
    expect(formattedTg).toContain("09:00");
  });

  it("formats school lesson date in Dushanbe timezone across midnight UTC boundary", () => {
    const midnightUtcBoundaryInstant = "2026-10-11T20:30:00Z";
    const formatted = formatSchoolLessonDate(midnightUtcBoundaryInstant, "ru");
    expect(formatted).toBe("12.10.2026");
  });

  it("formats school lesson time in Dushanbe timezone", () => {
    const formatted = formatSchoolLessonTime(sampleInstant, "ru");
    expect(formatted).toBe("09:00");
  });

  it("formats school lesson weekday in Dushanbe timezone across midnight UTC boundary", () => {
    const midnightUtcBoundaryInstant = "2026-10-11T20:30:00Z";
    const formattedRu = formatSchoolLessonWeekday(midnightUtcBoundaryInstant, "ru");
    expect(formattedRu.toLowerCase()).toMatch(/пн/);
    const formattedEn = formatSchoolLessonWeekday(midnightUtcBoundaryInstant, "en");
    expect(formattedEn.toLowerCase()).toMatch(/mon/);
  });

  it("preserves backward compatibility for standard date, time, and datetime formatting", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
    expect(formatDateTime(null)).toBe("");
    expect(formatTime(null)).toBe("");
    expect(formatTime("14:30:00")).toBe("14:30");
    expect(formatTime("09:15")).toBe("09:15");
  });

  it("formats dates as dd.MM.yyyy and times as 24h HH:mm in every locale", () => {
    const instant: string = "2026-10-21T14:05:00Z";
    for (const language of ["en", "ru", "tg"]) {
      expect(formatDate(instant, language, "UTC")).toBe("21.10.2026");
      expect(formatTime(instant, language, "UTC")).toBe("14:05");
      expect(formatDateTime(instant, language, "UTC")).toBe("21.10.2026 14:05");
      expect(formatDateTime(instant, language, "UTC")).not.toMatch(/AM|PM/i);
    }
  });

  it("formats afternoon and midnight hours in 24h form without AM/PM", () => {
    expect(formatTime("2026-10-21T00:30:00Z", "en", "UTC")).toBe("00:30");
    expect(formatTime("2026-10-21T23:59:00Z", "en", "UTC")).toBe("23:59");
    expect(formatDateTime("2026-10-21T18:00:00Z", "en", "UTC")).toBe("21.10.2026 18:00");
  });

  it("handles explicit timezone parameter in base formatters", () => {
    const formattedNewYork = formatDateTime(sampleInstant, "en", "America/New_York");
    expect(formattedNewYork).toBe("12.10.2026 00:00");

    const formattedDushanbe = formatDateTime(sampleInstant, "ru", "Asia/Dushanbe");
    expect(formattedDushanbe).toBe("12.10.2026 09:00");

    const formattedUtc = formatDate(sampleInstant, "ru", "UTC");
    const expectedUtc = new Intl.DateTimeFormat("ru-RU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "UTC",
    }).format(new Date(sampleInstant));
    expect(formattedUtc).toBe(expectedUtc);
  });

  it("returns raw string representation when invalid date is provided", () => {
    expect(formatDate("not-a-valid-date")).toBe("not-a-valid-date");
    expect(formatDateTime("not-a-valid-date")).toBe("not-a-valid-date");
    expect(formatTime("not-a-valid-date")).toBe("not-a-valid-date");
  });
});


describe("school calendar and localized changing numbers", () => {
  it("uses the school calendar day across the UTC midnight boundary", () => {
    expect(getSchoolCalendarDate(new Date("2026-05-31T20:30:00Z"))).toBe("2026-06-01");
    expect(getSchoolCalendarDate(new Date("2026-05-31T18:30:00Z"))).toBe("2026-05-31");
  });
  it("retains valid zero and formats percentages for each active locale", () => {
    expect(formatNumber(0, "en")).toBe("0");
    expect(formatNumber(1.25, "ru", { style: "percent" })).toContain("125");
    expect(formatNumber(1234, "tg")).toBe(new Intl.NumberFormat("tg-TJ").format(1234));
  });
});

describe("school payment calendar", () => {
  it("converts a chosen school day without using the device timezone", () => {
    expect(schoolCalendarDateToTimestamp("2026-10-11")).toBe("2026-10-10T19:00:00.000Z");
    expect(schoolCalendarDateToTimestamp("2024-02-29")).toBe("2024-02-28T19:00:00.000Z");
  });
  it("rejects malformed and nonexistent dates", () => {
    for (const invalid of ["", "2026-02-29", "2026-13-01", "2026-01-32", "2026-1-01"]) expect(schoolCalendarDateToTimestamp(invalid)).toBeNull();
  });
  it("scopes collection to the whole current school month at a UTC month boundary", () => {
    expect(getSchoolMonthRange(new Date("2026-10-31T20:00:00Z"))).toEqual({ start: "2026-11-01", end: "2026-11-30" });
    expect(getSchoolMonthRange(new Date("2024-02-15T00:00:00Z"))).toEqual({ start: "2024-02-01", end: "2024-02-29" });
  });
});

describe("Tajik locale resolution", () => {
  const sampleInstant = "2026-10-15T07:00:00Z";

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function simulateIntlWithoutTajikData(): void {
    const originalNumberSupport = Intl.NumberFormat.supportedLocalesOf.bind(Intl.NumberFormat);
    const originalDateSupport = Intl.DateTimeFormat.supportedLocalesOf.bind(Intl.DateTimeFormat);
    const withoutTajik = (locales: Intl.LocalesArgument): string[] => {
      const requested: string[] = typeof locales === "string" ? [locales] : Array.isArray(locales) ? locales.map(String) : [];
      return requested.filter(locale => !locale.startsWith("tg"));
    };
    vi.spyOn(Intl.NumberFormat, "supportedLocalesOf").mockImplementation(locales => originalNumberSupport(withoutTajik(locales)));
    vi.spyOn(Intl.DateTimeFormat, "supportedLocalesOf").mockImplementation(locales => originalDateSupport(withoutTajik(locales)));
  }

  it("uses tg-TJ when Intl supports it", () => {
    vi.spyOn(Intl.NumberFormat, "supportedLocalesOf").mockReturnValue(["tg-TJ"]);
    vi.spyOn(Intl.DateTimeFormat, "supportedLocalesOf").mockReturnValue(["tg-TJ"]);
    expect(getActiveLocale("tg")).toBe("tg-TJ");
  });

  it("falls back to day-first numeric dates, never en-US, when tg-TJ is unsupported", () => {
    simulateIntlWithoutTajikData();
    expect(getActiveLocale("tg")).toBe("ru-RU");
    expect(formatDate(sampleInstant, "tg", SCHOOL_TIMEZONE)).toBe("15.10.2026");
    expect(formatDate(sampleInstant, "tg", SCHOOL_TIMEZONE)).not.toContain("/");
  });

  it("falls back to a decimal comma when tg-TJ is unsupported", () => {
    simulateIntlWithoutTajikData();
    expect(formatNumber(37.5, "tg", { minimumFractionDigits: 1, maximumFractionDigits: 1 })).toBe("37,5");
  });

  it("shows Tajik weekday abbreviations, never Russian ones, when tg-TJ is unsupported", () => {
    simulateIntlWithoutTajikData();
    const mondayThroughSunday = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];
    const tajikAbbreviations = ["Дш", "Сш", "Чш", "Ҷш", "Ҷм", "Шн", "Як"];
    expect(mondayThroughSunday.map(date => formatSchoolLessonWeekday(date, "tg"))).toEqual(tajikAbbreviations);
    expect(formatSchoolLessonWeekday("2026-10-12", "tg")).not.toBe(formatSchoolLessonWeekday("2026-10-12", "ru"));
  });

  it("resolves the Tajik weekday on the Dushanbe calendar day across the UTC boundary", () => {
    simulateIntlWithoutTajikData();
    expect(formatSchoolLessonWeekday("2026-10-11T20:30:00Z", "tg")).toBe("Дш");
  });

  it("keeps Intl weekdays for Russian and English when Tajik data is missing", () => {
    simulateIntlWithoutTajikData();
    expect(formatSchoolLessonWeekday("2026-10-12", "ru").toLowerCase()).toMatch(/пн/);
    expect(formatSchoolLessonWeekday("2026-10-12", "en").toLowerCase()).toMatch(/mon/);
  });

  it("does not change English or Russian resolution when Tajik data is missing", () => {
    simulateIntlWithoutTajikData();
    expect(getActiveLocale("en")).toBe("en-US");
    expect(getActiveLocale("ru")).toBe("ru-RU");
  });
});

describe("formatPercentage", () => {
  it("uses up to two fraction digits and no trailing zeros", () => {
    expect(formatPercentage(0, "en")).toBe("0%");
    expect(formatPercentage(41.3, "en")).toBe("41.3%");
    expect(formatPercentage(114.49, "en")).toBe("114.49%");
    expect(formatPercentage(100, "en")).toBe("100%");
    expect(formatPercentage(43.4800001, "en")).toBe("43.48%");
  });

  it("uses the decimal comma in Russian and Tajik", () => {
    expect(formatPercentage(41.3, "ru")).toBe("41,3%");
    expect(formatPercentage(114.49, "ru")).toBe("114,49%");
    expect(formatPercentage(41.3, "tg")).toBe("41,3%");
  });
});

describe("school weekday index", () => {
  it("is Monday-first in Dushanbe time across the UTC midnight boundary", () => {
    expect(getSchoolWeekdayIndex(new Date("2026-10-19T10:00:00Z"))).toBe(0);
    expect(getSchoolWeekdayIndex(new Date("2026-10-18T20:00:00Z"))).toBe(0);
    expect(getSchoolWeekdayIndex(new Date("2026-10-18T18:59:00Z"))).toBe(6);
  });
});
