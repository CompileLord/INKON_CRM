import { AuthApiError } from "../../lib/auth/errors";

export type JournalRouteDenial = "forbidden" | "notFound";

export class JournalRouteErrors {
  static denialOf(error: unknown): JournalRouteDenial | null {
    const status: number | undefined = JournalRouteErrors.statusOf(error);
    if (status === 403) return "forbidden";
    if (status === 404) return "notFound";
    return null;
  }

  private static statusOf(error: unknown): number | undefined {
    if (error instanceof AuthApiError) return error.status;
    if (typeof error === "object" && error !== null && "status" in error) {
      const status: unknown = (error as { status: unknown }).status;
      return typeof status === "number" ? status : undefined;
    }
    return undefined;
  }
}
