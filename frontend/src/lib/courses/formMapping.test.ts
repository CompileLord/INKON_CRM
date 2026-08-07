import { describe, expect, it, vi } from "vitest";
import { AuthApiError } from "../auth/errors";
import {
  applyCourseFieldErrors,
  buildCourseCreatePayload,
  buildCourseFormValues,
  buildCourseUpdatePayload,
  courseFormDefaults,
  describeCourseApiError,
} from "./formMapping";
import type { CourseResponse } from "./types";

const HUGE_PRICE =
  "436688811034941926602435971499369190867.07123456789012345678901234567890123456789";

const sampleCourse: CourseResponse = {
  id: 1,
  title: "Английский B1",
  description: "Разговорный курс",
  photo_path: null,
  start_date: "2026-01-10",
  end_date: "2026-06-10",
  exam_type: "weekly",
  price: HUGE_PRICE,
  mentor_id: 5,
  status: "active",
  is_deleted: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("buildCourseCreatePayload", () => {
  it("maps form values to CourseCreate, converting HH:MM times to HH:MM:SS", () => {
    const payload = buildCourseCreatePayload({
      ...courseFormDefaults,
      title: "  Английский B1  ",
      description: "  Разговорный курс  ",
      start_date: "2026-01-10",
      end_date: "2026-06-10",
      exam_type: "weekly",
      price: HUGE_PRICE,
      mentor_id: "5",
      schedules: [{ day_of_week: "1", time_start: "18:00", time_end: "19:30" }],
    });

    expect(payload).toEqual({
      title: "Английский B1",
      description: "Разговорный курс",
      start_date: "2026-01-10",
      end_date: "2026-06-10",
      exam_type: "weekly",
      price: HUGE_PRICE,
      mentor_id: 5,
      schedules: [{ day_of_week: 1, time_start: "18:00:00", time_end: "19:30:00" }],
    });
  });

  it("a long decimal price string survives the round trip unmodified", () => {
    const payload = buildCourseCreatePayload({ ...courseFormDefaults, price: HUGE_PRICE, mentor_id: "1" });
    expect(payload.price).toBe(HUGE_PRICE);
  });
});

describe("buildCourseUpdatePayload", () => {
  it("sends only the fields react-hook-form marked dirty", () => {
    const values = buildCourseFormValues(sampleCourse);
    const payload = buildCourseUpdatePayload(
      { ...values, title: "Английский B2" },
      { title: true },
    );

    expect(payload).toEqual({ title: "Английский B2" });
  });

  it("never includes price, exam_type, or schedules even if somehow marked dirty — CourseUpdate has no such fields", () => {
    const values = buildCourseFormValues(sampleCourse);
    const payload = buildCourseUpdatePayload(
      { ...values, price: "999", exam_type: "monthly" },
      { price: true, exam_type: true },
    );

    expect(payload).toEqual({});
  });

  it("converts mentor_id back to a number", () => {
    const values = buildCourseFormValues(sampleCourse);
    const payload = buildCourseUpdatePayload({ ...values, mentor_id: "9" }, { mentor_id: true });
    expect(payload).toEqual({ mentor_id: 9 });
  });

  it("returns an empty object when nothing is dirty", () => {
    const values = buildCourseFormValues(sampleCourse);
    expect(buildCourseUpdatePayload(values, {})).toEqual({});
  });
});

describe("applyCourseFieldErrors", () => {
  it("maps API field names onto form field names and reports whether anything matched", () => {
    const setError = vi.fn();
    const applied = applyCourseFieldErrors(
      { title: "Слишком длинное название", mentor_id: "Ментор не найден" },
      setError,
    );

    expect(applied).toBe(true);
    expect(setError).toHaveBeenCalledWith("title", { type: "server", message: "Слишком длинное название" });
    expect(setError).toHaveBeenCalledWith("mentor_id", { type: "server", message: "Ментор не найден" });
  });

  it("returns false when no API key matches a known form field", () => {
    const setError = vi.fn();
    const applied = applyCourseFieldErrors({ unknown_field: "oops" }, setError);
    expect(applied).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });
});

describe("describeCourseApiError", () => {
  it("never shows the connection-error message for a response that actually reached the browser", () => {
    for (const status of [400, 403, 404, 409, 422, 500, 502, 503]) {
      expect(describeCourseApiError(new AuthApiError(status, "some detail"))).not.toBe(
        "Не удалось подключиться к серверу",
      );
    }
  });

  it("maps 5xx to a fixed friendly message regardless of the raw detail", () => {
    expect(describeCourseApiError(new AuthApiError(500, "Internal Server Error"))).toBe(
      "Сервер недоступен, попробуйте позже",
    );
  });
});
