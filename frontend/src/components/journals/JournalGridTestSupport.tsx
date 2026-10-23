import { afterEach, beforeAll, beforeEach, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "../../i18n";
import i18n from "../../i18n";
import { JournalGrid } from "./JournalGrid";
import { formatSchoolLessonDate } from "../../i18n/formatters";
import type { JournalRowEditing } from "./JournalStudentRow";
import type { JournalCellRejectionCode, JournalStudentResponse } from "../../lib/journals/types";

export const DATES: string[] = ["2026-10-12", "2026-10-13", "2026-10-14"];

export function student(id: number, firstName: string, scores: Record<string, number> = {}): JournalStudentResponse {
  return {
    student_id: id,
    first_name: firstName,
    last_name: "Tester",
    email: `${firstName}@example.com`,
    color_hex: "",
    entries: DATES.map((date, index) => ({
      id: id * 10 + index,
      lesson_date: date,
      attendance: false,
      score: scores[date] ?? 0,
      comment: null,
      has_comment: false,
      is_graded: (scores[date] ?? 0) > 0,
      version: 1,
    })),
    summary: {
      id: id,
      bonus_score: 0,
      exam_score: 0,
      sum_score: 0,
      max_period_score: 100,
      percentage: 0,
      version: 1,
      homework_score: 0,
      attendance_score: 0,
      attendance_count: 0,
      total_lessons: 3,
    },
  };
}

export const STUDENTS: JournalStudentResponse[] = [student(1, "Anvar"), student(2, "Bahor"), student(3, "Chiroq")];

export interface GridHarness {
  onEntryCommand: ReturnType<typeof vi.fn>;
  onSummaryPair: ReturnType<typeof vi.fn>;
  onSelectLesson: ReturnType<typeof vi.fn>;
  rerender: (students: JournalStudentResponse[], journalId?: number) => void;
}

export function mountGrid(options: { editing?: boolean; students?: JournalStudentResponse[]; selectedLesson?: string; examMaximum?: number; cellRejections?: Map<string, JournalCellRejectionCode> } = {}): GridHarness {
  const onEntryCommand = vi.fn();
  const onSummaryPair = vi.fn();
  const onSelectLesson = vi.fn();
  const editing: JournalRowEditing | null =
    options.editing === false ? null : { onEntryCommand, onSummaryPair };
  const element = (students: JournalStudentResponse[], journalId: number) => (
    <JournalGrid
      journalId={journalId}
      periodLabel="Month 10"
      students={students}
      lessonDates={DATES}
      selectedLesson={options.selectedLesson ?? DATES[0]}
      cellStatus={new Map()}
      cellRejections={options.cellRejections}
      summaryStatus={new Map()}
      editing={editing}
      examMaximum={options.examMaximum ?? 24}
      onSelectLesson={onSelectLesson}
    />
  );
  const view = render(element(options.students ?? STUDENTS, 7));
  return {
    onEntryCommand,
    onSummaryPair,
    onSelectLesson,
    rerender: (students, journalId = 7) => view.rerender(element(students, journalId)),
  };
}

export function cellOf(name: string, date: string): HTMLElement {
  return screen.getByLabelText(`Score for ${name} Tester on ${formatSchoolLessonDate(date)}`);
}

export function registerGridHooks(): void {
  beforeAll(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({ matches: !query.includes("max-width"), addEventListener: () => {}, removeEventListener: () => {} }),
    });
  });

  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
}
