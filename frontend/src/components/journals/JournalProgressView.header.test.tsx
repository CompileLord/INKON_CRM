import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import i18n from "../../i18n";
import { JournalProgressView } from "./JournalProgressView";
import { data, manyStudents, mockProgress } from "./JournalProgressTestSupport";

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
});

afterEach((): void => cleanup());

describe("performance trend card header", (): void => {
  it("uses the compact header classes only while the card is open", (): void => {
    mockProgress(data);
    render(<JournalProgressView courseId={1} />);
    const toggle: HTMLElement = screen.getByTestId("progress-collapse-toggle");
    const card: HTMLElement = screen.getByTestId("journal-progress").querySelector("section") as HTMLElement;
    const title: HTMLElement = screen.getByRole("heading", { name: "Performance trend" });
    expect(card.className).toContain("pt-0");
    expect(card.className).not.toContain("md:p-5");
    expect(title.className).toContain("text-sm");
    expect(toggle.className).toContain("min-h-11");
    fireEvent.click(toggle);
    expect(card.className).not.toContain("pt-0");
    expect(card.className).toContain("md:p-5");
    expect(title.className).toContain("text-base");
    expect(card.className).toContain("motion-safe:duration-150");
  });
});

describe("legend series picker", (): void => {
  it("renders in a body portal above the table stacking context and flips inside the viewport", (): void => {
    mockProgress(manyStudents);
    render(<JournalProgressView courseId={1} />);
    fireEvent.click(screen.getByTestId("legend-more"));
    const popover: HTMLElement = screen.getByTestId("legend-more-popover");
    expect(screen.getByTestId("journal-progress").contains(popover)).toBe(false);
    const overlay: HTMLElement = popover.parentElement as HTMLElement;
    expect(overlay.parentElement).toBe(document.body);
    expect(overlay.className).toContain("z-50");
    expect(overlay.style.position).toBe("fixed");
  });

  it("does not put a redundant native title on picker rows", (): void => {
    mockProgress(manyStudents);
    render(<JournalProgressView courseId={1} />);
    fireEvent.click(screen.getByTestId("legend-more"));
    const options: HTMLElement[] = within(screen.getByTestId("legend-more-popover")).getAllByRole("option");
    expect(options.length).toBeGreaterThan(0);
    options.forEach((option: HTMLElement): void => {
      expect(option.querySelector("[title]")).toBeNull();
    });
  });
});
