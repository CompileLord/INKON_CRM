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
  it("maps API field names onto form field names with translated error messages", () => {
    const setError = vi.fn();
    const applied = applyCourseFieldErrors(
      { title: "Course with this title already exists", mentor_id: "Mentor not found" },
      setError,
    );

    expect(applied).toBe(true);
    expect(setError).toHaveBeenCalledWith("title", {
      type: "server",
      message: "courses:form.errors.titleAlreadyExists",
    });
    expect(setError).toHaveBeenCalledWith("mentor_id", {
      type: "server",
      message: "courses:form.errors.mentorNotFound",
    });
  });

  it("maps nested schedule errors including dot and bracket notations", () => {
    const setError = vi.fn();
    const applied = applyCourseFieldErrors(
      {
        "schedules.0.time_start": "Required field",
        "schedules[0].time_end": "End time must be after start time",
      },
      setError,
    );

    expect(applied).toBe(true);
    expect(setError).toHaveBeenCalledWith("schedules.0.time_start", {
      type: "server",
      message: "courses:form.requiredFieldError",
    });
    expect(setError).toHaveBeenCalledWith("schedules.0.time_end", {
      type: "server",
      message: "courses:form.timeOrderError",
    });
  });

  it("maps the create date contract error to the date order message", () => {
    const setError = vi.fn();
    applyCourseFieldErrors({ end_date: "start_date must be before end_date" }, setError);

    expect(setError).toHaveBeenCalledWith("end_date", {
      type: "server",
      message: "courses:form.dateOrderError",
    });
  });

  it("returns false when no API key matches a known form field", () => {
    const setError = vi.fn();
    const applied = applyCourseFieldErrors({ unknown_field: "oops" }, setError);
    expect(applied).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });
});

describe("describeCourseApiError", () => {
  it("never exposes raw backend sentinels or details in error messages", () => {
    for (const status of [400, 403, 404, 409, 422, 500, 502, 503]) {
      const result = describeCourseApiError(new AuthApiError(status, "RAW_INTERNAL_EXCEPTION_DETAIL"));
      expect(result).not.toContain("RAW_INTERNAL_EXCEPTION_DETAIL");
    }
  });

  it("maps status codes and known details to correct localized error keys", () => {
    expect(describeCourseApiError(new AuthApiError(403, "Forbidden"))).toBe("courses:form.errors.forbidden");
    expect(describeCourseApiError(new AuthApiError(404, "Not Found"))).toBe("courses:form.errors.notFound");
    expect(describeCourseApiError(new AuthApiError(409, "Conflict"))).toBe("courses:form.errors.conflict");
    expect(describeCourseApiError(new AuthApiError(500, "Internal Server Error"))).toBe("courses:form.errors.serverError");
    expect(describeCourseApiError(new AuthApiError(400, "course already exists"))).toBe("courses:form.errors.titleAlreadyExists");
    expect(describeCourseApiError(new AuthApiError(400, "mentor not found in database"))).toBe("courses:form.errors.mentorNotFound");
  });
});
