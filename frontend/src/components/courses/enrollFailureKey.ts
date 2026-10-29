import axios from "axios";
import { AuthApiError } from "../../lib/auth/errors";

export type EnrollFailureKey = "courseAlreadyEnded" | "duplicateConflict" | "genericError";

export function enrollFailureKey(error: unknown): EnrollFailureKey {
  let status: number | undefined;
  let detail: unknown;
  if (error instanceof AuthApiError) {
    status = error.status;
    detail = error.detail;
  } else if (axios.isAxiosError(error)) {
    status = error.response?.status;
    detail = (error.response?.data as { detail?: unknown } | undefined)?.detail;
  } else if (typeof error === "object" && error !== null && "status" in error && typeof (error as { status?: unknown }).status === "number") {
    status = (error as { status: number }).status;
    detail = (error as { detail?: unknown }).detail;
  }
  const code: unknown = typeof detail === "object" && detail !== null ? (detail as { code?: unknown }).code : detail;
  if (status === 422 && code === "course_already_ended") return "courseAlreadyEnded";
  if (status === 409) return "duplicateConflict";
  return "genericError";
}
