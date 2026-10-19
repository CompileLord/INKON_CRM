import { describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../i18n";
import { formatNumber } from "../i18n/formatters";
import * as userHooks from "../lib/users/hooks";
import { mockStudentUser, mockProfileResponse, renderStudentProfile, registerStudentProfileHooks } from "./StudentProfileTestSupport";

registerStudentProfileHooks();

describe("StudentProfile Component", () => {
  it("renders superadmin identity row, summary strip, and authorized course links", () => {
    renderStudentProfile();

    expect(screen.getAllByText("Rustam Karimov").length).toBeGreaterThan(0);
    expect(screen.getAllByText("student42@example.com").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /\+992900000042/ }).getAttribute("href")).toBe("tel:+992900000042");
    expect(screen.queryByText("+992900000043")).toBeNull();
    expect(screen.queryByText(/Guardian phone:/i)).toBeNull();
    expect(screen.queryByText(/Parent phone:/i)).toBeNull();

    const backLink = screen.getByRole("link", { name: /Back to Students/i });
    expect(backLink).toBeDefined();
    expect(backLink.getAttribute("href")).toBe("/students");
    expect(document.querySelectorAll("[data-page-back]")).toHaveLength(1);

    const editBtn = screen.getByRole("button", { name: /^Edit$/i });
    expect(editBtn).toBeDefined();

    expect(screen.getByText("87.5")).toBeDefined();
    expect(screen.getByText("Average")).toBeDefined();
    expect(screen.queryByText(/unverified/i)).toBeNull();

    const mathLink = screen.getByRole("link", { name: "Advanced Mathematics" });
    expect(mathLink.getAttribute("href")).toBe("/courses/101");

    const englishLink = screen.getByRole("link", { name: "English Literature" });
    expect(englishLink.getAttribute("href")).toBe("/courses/102");
  });

  it.each([
    [0, "0.0"],
    [87.5, "87.5"],
    [123.456, "123.5"],
  ])("shows the stored raw score %s with one localized decimal", (rawAverage, expected) => {
    const response = { ...mockProfileResponse, performance: { ...mockProfileResponse.performance!, raw_avg_percentage: rawAverage } };
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({
      data: response,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    renderStudentProfile();
    expect(screen.getByText(expected)).toBeDefined();
    expect(screen.getByText("Average")).toBeDefined();
  });

  it("preserves a stored zero when the recorded maximum-score count is zero", () => {
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({
      data: {
        ...mockProfileResponse,
        performance: { ...mockProfileResponse.performance!, raw_avg_percentage: 0, periods_with_max_score_count: 0, period_summaries_count: 1 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    renderStudentProfile();
    expect(screen.getByText("0.0")).toBeDefined();
    expect(screen.getByText("Average")).toBeDefined();
  });

  it.each(["en", "ru", "tg"] as const)("localizes profile metrics and translated values for locale %s", async (locale) => {
    const user = userEvent.setup();
    const response = {
      ...mockProfileResponse,
      performance: { ...mockProfileResponse.performance!, raw_avg_percentage: 1234.5, absences: 0, total_lessons: 0, attendance_denominator: 0 },
    };
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({
      data: response,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    await i18n.changeLanguage(locale);
    renderStudentProfile();
    const localizedScore = formatNumber(1234.5, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace(/\u00a0/g, " ");
    expect(screen.getAllByText((_content, element) => element?.tagName === "P" && (element.textContent ?? "").replace(/\u00a0/g, " ") === localizedScore).length).toBeGreaterThan(0);
    const absencesLabel = i18n.t("students:stats.absencesOf", { lng: locale, absences: formatNumber(0, locale), total: formatNumber(0, locale) });
    expect(screen.getAllByText(absencesLabel).length).toBeGreaterThan(0);
    const currencySuffix = i18n.t("students:currencyTjs", { lng: locale });
    expect(screen.getAllByText((_content, element) => element?.tagName === "SPAN" && (element.textContent ?? "").includes(currencySuffix)).length).toBeGreaterThan(0);
    expect(screen.getByText(i18n.t("students:stats.attendance", { lng: locale })).closest("div")?.parentElement?.textContent).toContain(i18n.t("students:attendanceUnavailable", { lng: locale }));
    await user.click(screen.getByRole("tab", { name: i18n.t("students:performanceTab", { lng: locale }) }));
    expect(await screen.findByRole("heading", { name: i18n.t("students:progress.title", { lng: locale }) })).toBeDefined();
    await i18n.changeLanguage("en");
  });

  it("uses unavailable labels when the profile has no stored performance contract", () => {
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({
      data: { ...mockProfileResponse, performance: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    renderStudentProfile();
    expect(screen.getByText("Score unavailable", { selector: ".sr-only" }).parentElement?.querySelector('[aria-hidden="true"]')?.textContent).toBe("—");
    expect(screen.getAllByText("Attendance unavailable").length).toBeGreaterThan(0);
  });

  it.each(["en", "ru", "tg"] as const)("distinguishes compact missing score from true zero and bonus scores in %s", async (locale) => {
    await i18n.changeLanguage(locale);
    for (const rawAverage of [null, 0, 123.456]) {
      vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({ data: { ...mockProfileResponse, performance: { ...mockProfileResponse.performance!, raw_avg_percentage: rawAverage } }, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
      renderStudentProfile();
      if (rawAverage === null) {
        const missingValue = screen.getByText(i18n.t("students:scoreUnavailable"), { selector: ".sr-only" }).parentElement?.querySelector('[aria-hidden="true"]');
        expect(missingValue?.textContent).toBe(i18n.t("students:missingScoreValue"));
        expect(missingValue?.textContent).not.toBe(formatNumber(0, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
      } else {
        const expectedScore = formatNumber(rawAverage, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        expect(screen.getByText(expectedScore)).toBeDefined();
        expect(screen.queryByText(i18n.t("students:scoreUnavailable"), { selector: ".sr-only" })).toBeNull();
      }
      expect(screen.getByText(i18n.t("students:stats.average"))).toBeDefined();
      cleanup();
    }
  });

  it("handles contextual edit trigger opening StudentFormPanel", async () => {
    const user = userEvent.setup();
    renderStudentProfile();

    const editBtn = screen.getByRole("button", { name: /^Edit$/i });
    await user.click(editBtn);

    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("shows the guardian phone only in the header popover and renders one compact meta line", async () => {
    const user = userEvent.setup();
    renderStudentProfile();
    expect(screen.queryByText("+992900000043")).toBeNull();
    const trigger = screen.getByRole("button", { name: "Guardian phone" });
    await user.click(trigger);
    const guardianLink = await screen.findByRole("link", { name: "+992900000043" });
    expect(guardianLink.getAttribute("href")).toBe("tel:+992900000043");
    expect(screen.getByRole("link", { name: /student42@example.com/ }).getAttribute("href")).toBe("mailto:student42@example.com");
  });

  it("shows the archived pill beside the name only when the student is not active", () => {
    renderStudentProfile();
    expect(screen.getByRole("heading", { name: "Rustam Karimov" }).parentElement?.textContent).not.toContain("Archived");
    cleanup();
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({ data: { ...mockProfileResponse, user: { ...mockStudentUser, is_deleted: true } }, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    renderStudentProfile();
    expect(screen.getByRole("heading", { name: "Rustam Karimov" }).parentElement?.textContent).toContain("Archived");
  });

  it("renders three stat tiles with the average provenance in an info tooltip and absences as a ratio", async () => {
    const user = userEvent.setup();
    renderStudentProfile();
    const tiles = document.querySelector("[data-profile-summary]") as HTMLElement;
    expect(tiles.children).toHaveLength(3);
    expect(tiles.textContent).toContain("Average");
    expect(tiles.textContent).toContain("92%");
    expect(tiles.textContent).toContain("2 of 24");
    expect(tiles.textContent).not.toContain("/100");
    expect(tiles.textContent).not.toContain("unverified");

    await user.click(screen.getByRole("button", { name: "Average" }));
    expect((await screen.findByRole("tooltip")).textContent).toContain("unverified");
  });

  it("marks attendance unavailable when the stored attendance denominator is zero", () => {
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => ({ data: { ...mockProfileResponse, performance: { ...mockProfileResponse.performance!, attendance_denominator: 0, attendance_percentage: 91.6 } }, isLoading: false, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof userHooks.useStudentProfile>));
    renderStudentProfile();
    const tiles = document.querySelector("[data-profile-summary]") as HTMLElement;
    expect(tiles.textContent).not.toContain("92%");
    expect(screen.getByText("Attendance unavailable", { selector: ".sr-only" })).toBeDefined();
  });

  it("renders loading state skeleton with matching geometry", () => {
    vi.spyOn(userHooks, "useStudentProfile").mockImplementation(() => {
      return {
        data: undefined,
        isLoading: true,
        isError: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof userHooks.useStudentProfile>;
    });

    renderStudentProfile();
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText(i18n.t("common:loading"))).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Rustam Karimov" })).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("link", { name: "Advanced Mathematics" })).toBeNull();
  });
});
