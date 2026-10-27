import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import MockAdapter from "axios-mock-adapter";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/tokenStorage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/tokenStorage")>();
  return { ...actual, tokenStorage: actual.createMemoryTokenStorage() };
});

const { httpClient } = await import("../auth/httpClient");
const { tokenStorage } = await import("../auth/tokenStorage");
const { useCourseEnrollmentsCount } = await import("./hooks");

const mock = new MockAdapter(httpClient);

beforeEach(() => {
  mock.reset();
  tokenStorage.clear();
  tokenStorage.setTokens({ accessToken: "token-abc", refreshToken: "refresh-abc" });
});

afterEach(() => {
  mock.resetHistory();
});

describe("useCourseEnrollmentsCount", () => {
  it("requests only active enrollments of the course and returns the total", async () => {
    let capturedParams: Record<string, unknown> | undefined;
    mock.onGet("/enrollments/").reply((config) => {
      capturedParams = config.params as Record<string, unknown>;
      return [200, { items: [], total: 6, page: 1, page_size: 1, total_pages: 6 }];
    });
    const queryClient: QueryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCourseEnrollmentsCount(7), { wrapper });

    await waitFor(() => expect(result.current.data).toBe(6));
    expect(capturedParams).toEqual({ course_id: 7, status: "active", page: 1, page_size: 1 });
  });
});
