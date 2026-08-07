import { API_BASE_URL } from "../auth/env";

const API_ORIGIN = new URL(API_BASE_URL).origin;

/**
 * `photo_path`/`thumbnail_path` are server paths, not full URLs. Resolved
 * against the API's origin (static media is conventionally served from
 * root, not under /api/v1) — adjust here if the backend mounts media
 * elsewhere.
 */
export function resolveMediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(path, API_ORIGIN).toString();
}

export const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

/** Returns an error message, or null when the file is acceptable. */
export function validateAvatarFile(file: File | Blob): string | null {
  const type = "type" in file ? file.type : "";
  if (!ALLOWED_AVATAR_TYPES.includes(type as (typeof ALLOWED_AVATAR_TYPES)[number])) {
    return "Разрешены только файлы JPEG, PNG или WEBP";
  }
  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    return "Файл слишком большой (макс. 5 МБ)";
  }
  return null;
}
