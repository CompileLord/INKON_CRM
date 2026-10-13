import i18n from "../../i18n";
import { API_BASE_URL } from "../auth/env";

const API_ORIGIN = new URL(API_BASE_URL).origin;

export function resolveMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(path, API_ORIGIN).toString();
}

export const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png"] as const;
export const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

export type AvatarValidationError = "invalid_type" | "file_too_large";

export function getAvatarValidationError(file: File | Blob): AvatarValidationError | null {
  const type = "type" in file ? file.type : "";
  if (!ALLOWED_AVATAR_TYPES.includes(type as (typeof ALLOWED_AVATAR_TYPES)[number])) {
    return "invalid_type";
  }
  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    return "file_too_large";
  }
  return null;
}

export function validateAvatarFile(file: File | Blob): string | null {
  const error = getAvatarValidationError(file);
  if (error === "invalid_type") {
    return i18n.t("avatar.invalidType", { ns: "common" });
  }
  if (error === "file_too_large") {
    return i18n.t("avatar.fileTooLarge", { ns: "common" });
  }
  return null;
}
