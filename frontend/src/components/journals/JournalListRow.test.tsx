import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import i18n from "../../i18n";
import { JournalListRow } from "./JournalListRow";
import type { CourseListItemResponse } from "../../lib/courses/types";

function buildCourse(overrides: Partial<CourseListItemResponse> = {}): CourseListItemResponse {
  return {
    id: 1,
    title: "Algebra",
    description: "",
    photo_path: null,
    start_date: "2026-01-12",
    end_date: "2026-06-30",
    exam_type: "monthly",
    price: "100.00",
    mentor_id: 5,
    status: "active",
    is_deleted: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    schedules: [],
    active_student_count: 0,
    current_period_label: "Месяц 3",
    last_graded_lesson_date: "2026-10-27",
    ungraded_lessons_count: 3,
    ...overrides,
  };
}

async function renderRow(course: CourseListItemResponse, language: string = "en"): Promise<void> {
  await i18n.changeLanguage(language);
  render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <ul>
          <JournalListRow course={course} mentorState={{ kind: "hidden" }} onNavigateOut={() => undefined} />
        </ul>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe("JournalListRow progress", () => {
  afterEach(() => cleanup());

  it("shows the period, the formatted last graded date and the ungraded pill", async () => {
    await renderRow(buildCourse());
    expect(screen.getByTestId("journal-period").textContent).toBe("Месяц 3");
    expect(screen.getByTestId("journal-last-graded").textContent).toBe("Last graded: 27.10.2026");
    expect(screen.getByTestId("journal-ungraded").textContent).toBe("3 ungraded");
  });

  it("leaves out the period and last graded date when they are null", async () => {
    await renderRow(buildCourse({ current_period_label: null, last_graded_lesson_date: null }));
    expect(screen.queryByTestId("journal-period")).toBeNull();
    expect(screen.queryByTestId("journal-last-graded")).toBeNull();
    expect(screen.getByTestId("journal-ungraded")).toBeTruthy();
  });

  it("hides the pill when nothing is ungraded and the whole line when every field is empty", async () => {
    await renderRow(buildCourse({ ungraded_lessons_count: 0 }));
    expect(screen.queryByTestId("journal-ungraded")).toBeNull();
    cleanup();
    await renderRow(buildCourse({ current_period_label: null, last_graded_lesson_date: null, ungraded_lessons_count: 0 }));
    expect(screen.queryByTestId("journal-period")).toBeNull();
    expect(screen.queryByTestId("journal-last-graded")).toBeNull();
    expect(screen.queryByTestId("journal-ungraded")).toBeNull();
  });

  it("pluralizes the ungraded pill in English", async () => {
    await renderRow(buildCourse({ ungraded_lessons_count: 1 }));
    expect(screen.getByTestId("journal-ungraded").textContent).toBe("1 ungraded");
  });

  it("renders Russian and Tajik copy with plural-safe keys", async () => {
    await renderRow(buildCourse({ ungraded_lessons_count: 5 }), "ru");
    expect(screen.getByTestId("journal-ungraded").textContent).toBe("5 без оценок");
    expect(screen.getByTestId("journal-last-graded").textContent).toBe("Последняя оценка: 27.10.2026");
    cleanup();
    await renderRow(buildCourse({ ungraded_lessons_count: 2 }), "tg");
    expect(screen.getByTestId("journal-ungraded").textContent).toBe("2 бе баҳо");
    expect(screen.getByTestId("journal-last-graded").textContent).toBe("Баҳои охирин: 27.10.2026");
  });
});
