import { describe, expect, it } from "vitest";
import { courseEditFormSchema, courseFormSchema } from "./courseFormSchema";
import { emptyScheduleRow } from "./courses/formMapping";

/**
 * Reproduces the edit-form values react-hook-form actually holds when
 * editing an existing course: buildCourseFormValues seeds `schedules` with
 * a placeholder row (empty time_start/time_end) since real schedule data
 * isn't editable there — see formMapping.ts.
 */
const editModeValues = {
  title: "begginerw",
  description: "1 month",
  photo_path: "https://m.media-amazon.com/images/I/614wamiMNL._AC_UF894,1000_QL80_.jpg",
  start_date: "2000-02-10",
  end_date: "2000-02-20",
  exam_type: "monthly" as const,
  price: "800.00",
  mentor_id: "3",
  status: "archived" as const,
  schedules: [{ ...emptyScheduleRow }],
};

describe("courseFormSchema (create)", () => {
  it("rejects the placeholder schedules row edit forms actually submit", () => {
    // This is the bug: using the create schema in edit mode silently blocks
    // submit because the placeholder schedule row fails validation, and
    // ScheduleEditor (the only place that error would render) isn't mounted
    // when editing — so the user sees nothing happen on save.
    expect(courseFormSchema.safeParse(editModeValues).success).toBe(false);
  });
});

describe("courseEditFormSchema", () => {
  it("accepts real edit-mode values with the placeholder schedules row", () => {
    expect(courseEditFormSchema.safeParse(editModeValues).success).toBe(true);
  });

  it("still requires the fields actually editable in edit mode", () => {
    expect(courseEditFormSchema.safeParse({ ...editModeValues, title: "" }).success).toBe(false);
    expect(courseEditFormSchema.safeParse({ ...editModeValues, mentor_id: "" }).success).toBe(false);
    expect(
      courseEditFormSchema.safeParse({ ...editModeValues, start_date: "2000-03-01" }).success,
    ).toBe(false); // end_date now before start_date
  });
});
