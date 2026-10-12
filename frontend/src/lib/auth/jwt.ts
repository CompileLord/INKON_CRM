import type { Role } from "../users/types";

export interface AccessTokenIdentity {
  userId: number;
  role: Role;
  expiresAt: number;
  mustSetPassword: boolean;
}

export function decodeAccessToken(accessToken: string): AccessTokenIdentity | null {
  const parts = accessToken.split(".");
  if (parts.length !== 3) return null;

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64).split("").map((character) => `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""),
    );
    const decoded: unknown = JSON.parse(json);
    if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) return null;
    const payload = decoded as Record<string, unknown>;
    if (typeof payload.sub !== "string" || !/^[1-9]\d*$/.test(payload.sub)) return null;
    const userId = Number(payload.sub);
    if (!Number.isSafeInteger(userId)) return null;
    const role = payload.role;
    if (role !== "superadmin" && role !== "mentor" && role !== "student" && role !== "accountant") return null;
    if (typeof payload.exp !== "number" || !Number.isSafeInteger(payload.exp) || payload.exp <= Date.now() / 1000) return null;
    if (payload.scope !== undefined && payload.scope !== "must_set_password") return null;
    return { userId, role, expiresAt: payload.exp, mustSetPassword: payload.scope === "must_set_password" };
  } catch {
    return null;
  }
}
