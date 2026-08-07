import { AuthApiError, NetworkError } from "../auth/errors";
import type { CourseCreate, CourseExamType, CourseResponse, CourseStatus, CourseUpdate } from "./types";

export interface CourseScheduleFormRow {
  day_of_week: string; // "0".."6", string because it's a <select> value
  time_start: string; // "HH:MM" from <input type="time">
  time_end: string;
}

/**
 * One shape covers both create and edit — `exam_type`/`price`/`schedules`
 * are only ever collected (and only ever sent) on create; CourseUpdate has
 * no such fields, so the edit form renders them read-only and
 * buildCourseUpdatePayload never looks at them.
 *
 * photo_path is intentionally excluded: images are uploaded via the
 * dedicated POST /courses/{id}/image/ endpoint, not via the JSON form body.
 */
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

// Default to Monday (0) to match the ScheduleEditor DAYS[0] = "Пн" convention
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
    schedules: [{ ...emptyScheduleRow }], // not editable here — shown separately from live schedule data
  };
}

function toTimeOfDay(value: string): string {
  // <input type="time"> yields "HH:MM"; the API's `time` field wants seconds.
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

/** Builds a PATCH payload containing only the keys react-hook-form marked dirty, restricted to the fields CourseUpdate actually supports. */
export function buildCourseUpdatePayload(
  values: CourseFormValues,
  dirtyFields: Partial<Record<keyof CourseFormValues, unknown>>,
): CourseUpdate {
  const update: CourseUpdate = {};

  for (const field of Object.keys(dirtyFields) as (keyof CourseFormValues)[]) {
    if (!dirtyFields[field]) continue;
    if (!(field in FIELD_TO_API_KEY)) continue; // price/exam_type/schedules aren't patchable
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

/** Maps AuthApiError.fieldErrors (API key names) onto react-hook-form's setError. Returns whether any field matched. */
export function applyCourseFieldErrors(
  fieldErrors: Record<string, string>,
  setError: (field: keyof CourseFormValues, error: { type: string; message: string }) => void,
): boolean {
  let applied = false;
  for (const [apiKey, message] of Object.entries(fieldErrors)) {
    const field = API_KEY_TO_FIELD[apiKey];
    if (field) {
      setError(field, { type: "server", message });
      applied = true;
    }
  }
  return applied;
}

export function describeCourseApiError(err: unknown): string {
  if (err instanceof AuthApiError) {
    if (err.status === 403) return "Недостаточно прав для этого действия";
    if (err.status >= 500) return "Сервер недоступен, попробуйте позже";
    return err.message;
  }
  if (err instanceof NetworkError) return "Не удалось подключиться к серверу";
  return "Что-то пошло не так. Попробуйте ещё раз.";
}
