import type { Role } from "../users/types";

interface AccessTokenPayload {
  user_id: number;
  role: Role;
  exp: number;
  [key: string]: unknown;
}

/** Decodes the unsigned JWT payload (base64url) — no signature check, the server already vouches for it. */
export function decodeAccessToken(accessToken: string): AccessTokenPayload | null {
  const parts = accessToken.split(".");
  if (parts.length !== 3) return null;

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    return JSON.parse(json) as AccessTokenPayload;
  } catch {
    return null;
  }
}
