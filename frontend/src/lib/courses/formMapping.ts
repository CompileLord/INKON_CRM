import { AuthApiError, NetworkError } from "../auth/errors";
import type { CourseCreate, CourseExamType, CourseResponse, CourseStatus, CourseUpdate } from "./types";

export interface CourseScheduleFormRow {
  day_of_week: string;
  time_start: string;
  time_end: string;
}

export interface CourseFormValues {
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  exam_type: CourseExamType;
  price: string;
  mentor_id: string;
  status: CourseStatus;
  schedules: CourseScheduleFormRow[];
}

export const emptyScheduleRow: CourseScheduleFormRow = {
  day_of_week: "0",
  time_start: "",
  time_end: "",
};

export const courseFormDefaults: CourseFormValues = {
  title: "",
  description: "",
  start_date: "",
  end_date: "",
  exam_type: "weekly",
  price: "",
  mentor_id: "",
  status: "active",
  schedules: [{ ...emptyScheduleRow }],
};

export function buildCourseFormValues(course: CourseResponse): CourseFormValues {
  return {
    title: course.title,
    description: course.description,
    start_date: course.start_date,
    end_date: course.end_date,
    exam_type: course.exam_type,
    price: course.price,
    mentor_id: String(course.mentor_id),
    status: course.status,
    schedules: [{ ...emptyScheduleRow }],
  };
}

function toTimeOfDay(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

export function buildCourseCreatePayload(values: CourseFormValues): CourseCreate {
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    start_date: values.start_date,
    end_date: values.end_date,
    exam_type: values.exam_type,
    price: values.price.trim(),
    mentor_id: Number(values.mentor_id),
    schedules: values.schedules.map((row) => ({
      day_of_week: Number(row.day_of_week),
      time_start: toTimeOfDay(row.time_start),
      time_end: toTimeOfDay(row.time_end),
    })),
  };
}

type EditableField = "title" | "description" | "start_date" | "end_date" | "mentor_id" | "status";

const FIELD_TO_API_KEY: Record<EditableField, keyof CourseUpdate> = {
  title: "title",
  description: "description",
  start_date: "start_date",
  end_date: "end_date",
  mentor_id: "mentor_id",
  status: "status",
};

export function buildCourseUpdatePayload(
  values: CourseFormValues,
  dirtyFields: Partial<Record<keyof CourseFormValues, unknown>>,
): CourseUpdate {
  const update: CourseUpdate = {};

  for (const field of Object.keys(dirtyFields) as (keyof CourseFormValues)[]) {
    if (!dirtyFields[field]) continue;
    if (!(field in FIELD_TO_API_KEY)) continue;
    const editableField = field as EditableField;
    const apiKey = FIELD_TO_API_KEY[editableField];

    if (editableField === "mentor_id") {
      update.mentor_id = Number(values.mentor_id);
    } else {
      (update as Record<string, unknown>)[apiKey] = values[editableField];
    }
  }

  return update;
}

const API_KEY_TO_FIELD: Record<string, keyof CourseFormValues> = {
  title: "title",
  description: "description",
  start_date: "start_date",
  end_date: "end_date",
  exam_type: "exam_type",
  price: "price",
  mentor_id: "mentor_id",
  status: "status",
};

export function applyCourseFieldErrors(
  fieldErrors: Record<string, string>,
  setError: (field: string, error: { type: string; message: string }) => void,
  translator?: (key: string) => string,
): boolean {
  const t = translator ?? ((key: string) => key);
  let applied = false;
  for (const [apiKey, rawMessage] of Object.entries(fieldErrors)) {
    const normalizedKey = apiKey.replace(/\[(\d+)\]/g, ".$1");
    const field = API_KEY_TO_FIELD[normalizedKey] || (normalizedKey.startsWith("schedules") ? normalizedKey : undefined);
    if (field) {
      const lower = (rawMessage || "").toLowerCase();
      let translatedMessage = t("courses:form.requiredFieldError");
      if (lower.includes("already exists") || lower.includes("duplicate")) {
        translatedMessage = t("courses:form.errors.titleAlreadyExists");
      } else if (lower.includes("mentor") && lower.includes("not found")) {
        translatedMessage = t("courses:form.errors.mentorNotFound");
      } else if (lower.includes("not found")) {
        translatedMessage = t("courses:form.errors.notFound");
      } else if (lower.includes("greater than") || lower.includes("positive") || lower.includes("price")) {
        translatedMessage = t("courses:form.positivePriceError");
      } else if (normalizedKey === "end_date" && lower.includes("start_date") && lower.includes("before")) {
        translatedMessage = t("courses:form.dateOrderError");
      } else if (lower.includes("after") || lower.includes("order") || lower.includes("end time")) {
        translatedMessage = t("courses:form.timeOrderError");
      }
      setError(field, { type: "server", message: translatedMessage });
      applied = true;
    }
  }
  return applied;
}

export function describeCourseApiError(
  err: unknown,
  translator?: (key: string) => string,
): string {
  const t = translator ?? ((key: string) => key);
  if (err instanceof AuthApiError) {
    if (err.status === 403) return t("courses:form.errors.forbidden");
    if (err.status === 404) return t("courses:form.errors.notFound");
    if (err.status === 409) return t("courses:form.errors.conflict");
    if (err.status >= 500) return t("courses:form.errors.serverError");

    const lower = (err.message || "").toLowerCase();
    if (lower.includes("already exists") || lower.includes("duplicate")) {
      return t("courses:form.errors.titleAlreadyExists");
    }
    if (lower.includes("mentor") && lower.includes("not found")) {
      return t("courses:form.errors.mentorNotFound");
    }
    return t("courses:form.errors.generic");
  }
  if (err instanceof NetworkError) {
    return t("courses:form.errors.networkError");
  }
  return t("courses:form.errors.generic");
}
