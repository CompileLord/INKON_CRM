import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import i18n from "../../i18n";
import { CourseScheduleLine } from "./CourseScheduleLine";
import type { CourseScheduleResponse } from "../../lib/courses/types";

function schedule(day: number, start: string, end: string): CourseScheduleResponse {
  return { id: day, course_id: 1, day_of_week: day, time_start: start, time_end: end };
}

describe("CourseScheduleLine", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ru");
  });
  afterEach(cleanup);

  it("shows grouped weekday short names with the time range", () => {
    const { container } = render(
      <CourseScheduleLine schedules={[schedule(0, "14:00:00", "15:30:00"), schedule(2, "14:00:00", "15:30:00"), schedule(4, "14:00:00", "15:30:00")]} />,
    );
    expect(container.textContent).toBe("Пн, Ср, Пт · 14:00–15:30");
  });

  it("shows one line per distinct time range", () => {
    const { container } = render(
      <CourseScheduleLine schedules={[schedule(0, "14:00:00", "15:30:00"), schedule(1, "10:00:00", "11:00:00")]} />,
    );
    const lines: string[] = Array.from(container.querySelectorAll("li")).map((item) => item.textContent ?? "");
    expect(lines).toEqual(["Пн · 14:00–15:30", "Вт · 10:00–11:00"]);
  });

  it("shows the muted empty copy when there is no schedule", async () => {
    await i18n.changeLanguage("en");
    const { container } = render(<CourseScheduleLine schedules={[]} />);
    expect(container.textContent).toBe("No schedule");
  });
});
