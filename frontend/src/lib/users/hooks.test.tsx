import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError, NetworkError } from "../auth/errors";
import * as endpoints from "./endpoints";
import { shouldRetryProfileRequest, useMentorAnalytics, useMentorProfile, useStudentProfile } from "./hooks";

vi.mock("./endpoints");

function createWrapper(): ({ children }: { children: ReactNode }) => ReactNode {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } });
  return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("profile request retry policy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("does not retry client errors whatever the client default is", () => {
    for (const status of [400, 403, 404, 422, 499]) {
      for (const clientDefault of [undefined, true, 5, () => true]) {
        expect(shouldRetryProfileRequest(clientDefault, 0, new AuthApiError(status, "denied"))).toBe(false);
      }
    }
  });

  it("retries server and network failures a bounded number of times by default", () => {
    expect(shouldRetryProfileRequest(undefined, 0, new AuthApiError(503, "down"))).toBe(true);
    expect(shouldRetryProfileRequest(undefined, 2, new NetworkError())).toBe(true);
    expect(shouldRetryProfileRequest(undefined, 3, new AuthApiError(503, "down"))).toBe(false);
  });

  it("honours an explicit client retry default for server failures", () => {
    expect(shouldRetryProfileRequest(false, 0, new AuthApiError(503, "down"))).toBe(false);
    expect(shouldRetryProfileRequest(1, 0, new AuthApiError(503, "down"))).toBe(true);
    expect(shouldRetryProfileRequest(1, 1, new AuthApiError(503, "down"))).toBe(false);
    expect(shouldRetryProfileRequest(() => true, 9, new NetworkError())).toBe(true);
  });

  it("requests a forbidden student profile exactly once and reaches the error state", async () => {
    vi.mocked(endpoints.getStudentProfile).mockRejectedValue(new AuthApiError(403, "Forbidden"));
    const { result } = renderHook(() => useStudentProfile(27), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(endpoints.getStudentProfile).toHaveBeenCalledTimes(1);
  });

  it("requests a missing mentor profile and its analytics exactly once", async () => {
    vi.mocked(endpoints.getMentorProfile).mockRejectedValue(new AuthApiError(404, "Not found"));
    vi.mocked(endpoints.getMentorAnalytics).mockRejectedValue(new AuthApiError(404, "Not found"));
    const profile = renderHook(() => useMentorProfile(9), { wrapper: createWrapper() });
    const analytics = renderHook(() => useMentorAnalytics(9), { wrapper: createWrapper() });
    await waitFor(() => expect(profile.result.current.isError).toBe(true));
    await waitFor(() => expect(analytics.result.current.isError).toBe(true));
    expect(endpoints.getMentorProfile).toHaveBeenCalledTimes(1);
    expect(endpoints.getMentorAnalytics).toHaveBeenCalledTimes(1);
  });

  it("still retries a transient server failure before succeeding", async () => {
    vi.mocked(endpoints.getStudentProfile)
      .mockRejectedValueOnce(new AuthApiError(503, "down"))
      .mockResolvedValue({ user: { id: 5 } } as Awaited<ReturnType<typeof endpoints.getStudentProfile>>);
    const { result } = renderHook(() => useStudentProfile(5), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(endpoints.getStudentProfile).toHaveBeenCalledTimes(2);
  });
});
