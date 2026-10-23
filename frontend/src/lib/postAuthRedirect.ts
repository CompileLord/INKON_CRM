export function getSafeRedirect(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\") ||
    trimmed.includes("\\")
  ) {
    return fallback;
  }
  try {
    const url = new URL(trimmed, "http://localhost");
    if (url.origin !== "http://localhost") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export class RoleHome {
  static readonly PATH: string = "/";
}

export async function resolveLandingPath(): Promise<string> {
  return RoleHome.PATH;
}
