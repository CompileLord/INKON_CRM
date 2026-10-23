import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { useLogout } from "./useLogout";
import * as authEndpoints from "./auth/endpoints";
import { NetworkError } from "./auth/errors";
import { tokenStorage } from "./auth/tokenStorage";
import { useAuthStore } from "../store/authStore";

function accessToken(): string {
  const payload: Record<string, unknown> = { sub: "7", role: "mentor", exp: Math.floor(Date.now() / 1000) + 3600 };
  return `header.${btoa(JSON.stringify(payload))}.unit-fixture`;
}

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.getState().setUnauthenticated();
});

describe("useLogout", () => {
  it("revokes the stored refresh token and clears local state", async () => {
    useAuthStore.getState().setAuthenticated(accessToken(), "stored-refresh", false);
    const logoutSpy = vi.spyOn(authEndpoints, "logout").mockResolvedValue(undefined);
    const { result } = renderHook(() => useLogout(), { wrapper });
    await act(async () => result.current());
    expect(logoutSpy).toHaveBeenCalledWith("stored-refresh");
    expect(useAuthStore.getState().status).toBe("unauthenticated");
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });

  it("still clears local state when the request fails", async () => {
    useAuthStore.getState().setAuthenticated(accessToken(), "stored-refresh", false);
    vi.spyOn(authEndpoints, "logout").mockRejectedValue(new NetworkError());
    const { result } = renderHook(() => useLogout(), { wrapper });
    await act(async () => result.current());
    expect(useAuthStore.getState().status).toBe("unauthenticated");
    expect(tokenStorage.getRefreshToken()).toBeNull();
    expect(tokenStorage.getAccessToken()).toBeNull();
  });
});
