import { AuthApiError } from "./auth/errors";

export class QueryRetryPolicy {
  static readonly MAXIMUM_ATTEMPTS: number = 3;
  private static readonly PERMANENT_STATUSES: readonly number[] = [401, 403, 404, 422];

  static shouldRetry(failureCount: number, error: unknown): boolean {
    const status: number | undefined = QueryRetryPolicy.statusOf(error);
    if (status !== undefined && QueryRetryPolicy.PERMANENT_STATUSES.includes(status)) return false;
    return failureCount < QueryRetryPolicy.MAXIMUM_ATTEMPTS;
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
