import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import i18n from "../../i18n";
import { JournalProgressView } from "./JournalProgressView";
import { data, manyStudents, mockProgress } from "./JournalProgressTestSupport";
import tgJournals from "../../i18n/locales/tg/journals.json";

vi.mock("../../lib/courses/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/courses/hooks")>();
  return { ...actual, useCourseStaffProgress: vi.fn(), useCourseClassProgress: vi.fn(() => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() })), useCourseJournals: vi.fn(() => ({ data: undefined })) };
});

vi.mock("../../i18n/formatters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../i18n/formatters")>();
  return { ...actual, getSchoolCalendarDate: () => "2026-10-15" };
});

beforeEach(async (): Promise<void> => {
  window.localStorage.clear();
  await i18n.changeLanguage("en");
  mockProgress(data);
});

afterEach((): void => cleanup());

describe("compact chart legend", (): void => {
  it("renders inline items without pill borders or backgrounds, in text-xs with small gaps", (): void => {
    render(<JournalProgressView courseId={1} />);
    const legend: HTMLElement = screen.getByTestId("progress-legend");
    const buttons: HTMLElement[] = within(legend).getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    buttons.forEach((button: HTMLElement): void => {
      expect(button.className).toContain("text-xs");
      expect(button.className).not.toMatch(/\brounded-full\b|\bborder\b|\bbg-card\b|\bpx-3\b|\bmin-h-11\b/);
    });
    expect(within(legend).getByRole("list").className).toContain("gap-x-3");
    expect(within(legend).getByRole("list").className).toContain("gap-y-1");
  });

  it("keeps toggle semantics and shows a hidden series as muted with a line-through", (): void => {
    render(<JournalProgressView courseId={1} />);
    const average: HTMLElement = screen.getByRole("button", { name: "Class average" });
    expect(average.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(average);
    expect(average.getAttribute("aria-pressed")).toBe("false");
    expect(average.className).toContain("line-through");
    expect(average.className).toContain("text-muted");
  });

  it("truncates a long student name and keeps the full name in a title", (): void => {
    render(<JournalProgressView courseId={1} />);
    const bahor: HTMLElement = screen.getByRole("button", { name: /Bahor Tester/ });
    expect(bahor.getAttribute("title")).toBe("Bahor Tester");
    expect(bahor.querySelector("span.truncate")?.textContent).toBe("Bahor Tester");
  });

  it("keeps the +N more control as a compact button", (): void => {
    mockProgress(manyStudents);
    render(<JournalProgressView courseId={1} />);
    const more: HTMLElement = screen.getByTestId("legend-more");
    expect(more.className).toContain("text-xs");
    expect(more.className).not.toMatch(/\brounded-full\b|\bborder\b|\bpx-3\b/);
  });
});

describe("Tajik maximum wording", (): void => {
  it("uses Балли максималӣ for the legend entry, chart label and total title", async (): Promise<void> => {
    await i18n.changeLanguage("tg");
    render(<JournalProgressView courseId={1} />);
    expect(screen.getByTestId("legend-maximum").textContent).toBe("Балли максималӣ");
    expect(tgJournals.progress.chart.maximumLabel).toBe("Балли максималӣ {{max}}");
    expect(tgJournals.table.sumMaximumTitle).toBe("Ҷамъи балли максималӣ: {{max}}");
    expect(i18n.t("journals:progress.chart.maximumLabel", { max: 120 })).toBe("Балли максималӣ 120");
  });
});
