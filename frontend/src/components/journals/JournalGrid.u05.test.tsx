import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type { JournalCellRejectionCode, JournalStudentResponse } from "../../lib/journals/types";
import { DATES, STUDENTS, cellOf, mountGrid, registerGridHooks, student } from "./JournalGridTestSupport";

registerGridHooks();

afterEach(() => {
  vi.useRealTimers();
});

function freezeSchoolDate(isoInstant: string): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(isoInstant));
}

describe("JournalGrid not graded versus graded zero", () => {
  it("shows a dash for an ungraded cell and 0 for a cell graded zero", () => {
    const base: JournalStudentResponse = student(1, "Anvar");
    const gradedZero: JournalStudentResponse = {
      ...base,
      entries: base.entries.map((entry, index) => (index === 1 ? { ...entry, is_graded: true, attendance: true } : entry)),
    };
    mountGrid({ students: [gradedZero] });
    const zeroCell: HTMLElement = cellOf("Anvar", DATES[1]);
    const dashCell: HTMLElement = cellOf("Anvar", DATES[0]);
    expect(within(zeroCell).getByRole("button", { name: "0" }).getAttribute("data-graded")).toBe("true");
    expect(within(dashCell).getByRole("button", { name: "—" }).getAttribute("data-graded")).toBe("false");
  });
});

describe("JournalGrid future lessons", () => {
  it("disables the cells and hides the bulk menu of lessons after today in school time", () => {
    freezeSchoolDate("2026-10-13T09:00:00+05:00");
    mountGrid();
    expect(screen.getAllByTestId("future-cell")).toHaveLength(STUDENTS.length);
    expect(cellOf("Anvar", DATES[1]).getAttribute("aria-disabled")).toBeNull();
    expect(document.querySelectorAll('[data-control="column-menu"]')).toHaveLength(2);
  });

  it("reveals each column menu on hover or focus only, while keeping it keyboard and touch reachable", () => {
    freezeSchoolDate("2026-10-13T09:00:00+05:00");
    mountGrid();
    const menus: HTMLElement[] = Array.from(document.querySelectorAll<HTMLElement>('[data-control="column-menu"]'));
    expect(menus.length).toBeGreaterThan(0);
    for (const menu of menus) {
      expect(menu.className).toContain("opacity-0");
      expect(menu.className).toContain("group-hover/column:opacity-100");
      expect(menu.className).toContain("group-focus-within/column:opacity-100");
      expect(menu.className).toContain("pointer-coarse:opacity-100");
      expect(menu.className).toContain("has-[[data-popup-open]]:opacity-100");
      expect(menu.closest("th")?.className).toContain("group/column");
      const trigger: HTMLElement = within(menu).getByRole("button");
      expect(trigger.getAttribute("tabindex")).not.toBe("-1");
      expect(menu.hasAttribute("hidden")).toBe(false);
    }
  });

  it("uses the school calendar date, not the browser date, at the day boundary", () => {
    freezeSchoolDate("2026-10-13T20:30:00Z");
    mountGrid();
    expect(screen.queryAllByTestId("future-cell")).toHaveLength(0);
  });
});

describe("JournalGrid Exam and Bonus headers", () => {
  it("shows each maximum once, in the column header, and not on any row", () => {
    mountGrid({ examMaximum: 24 });
    expect(screen.getByTestId("exam-maximum").textContent).toBe("/ 24");
    expect(screen.getByTestId("bonus-maximum").textContent).toBe("/ 20");
    expect(screen.getAllByText("/ 24")).toHaveLength(1);
  });
});

describe("JournalGrid server rejection messages", () => {
  it("shows the translated message of the rejection code on the cell", () => {
    const rejections: Map<string, JournalCellRejectionCode> = new Map([[`1:${DATES[0]}`, "future_lesson"]]);
    mountGrid({ cellRejections: rejections });
    expect(within(cellOf("Anvar", DATES[0])).getByRole("alert").textContent).toBe(
      "The lesson has not happened yet. Your entry is kept.",
    );
    expect(within(cellOf("Bahor", DATES[0])).queryByRole("alert")).toBeNull();
  });
});
