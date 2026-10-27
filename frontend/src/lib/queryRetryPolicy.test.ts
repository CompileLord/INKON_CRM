import { describe, expect, it } from "vitest";
import { AuthApiError, NetworkError } from "./auth/errors";
import { QueryRetryPolicy } from "./queryRetryPolicy";

describe("QueryRetryPolicy", () => {
  it("does not retry permission and missing-resource failures", () => {
    const forbidden: boolean = QueryRetryPolicy.shouldRetry(0, new AuthApiError(403, "Not enough permissions"));
    const missing: boolean = QueryRetryPolicy.shouldRetry(0, new AuthApiError(404, "Not found"));
    expect(forbidden).toBe(false);
    expect(missing).toBe(false);
  });

  it("retries transient failures up to the attempt limit", () => {
    expect(QueryRetryPolicy.shouldRetry(0, new NetworkError())).toBe(true);
    expect(QueryRetryPolicy.shouldRetry(2, new AuthApiError(503, "Unavailable"))).toBe(true);
    expect(QueryRetryPolicy.shouldRetry(3, new AuthApiError(503, "Unavailable"))).toBe(false);
  });
});
