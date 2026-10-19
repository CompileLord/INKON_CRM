import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../store/authStore";
import { AuthApiError, NetworkError } from "./auth/errors";
import { tokenStorage } from "./auth/tokenStorage";
import * as endpoints from "./auth/endpoints";
import { bootstrapAuth } from "./authBootstrap";

function buildAccessToken(): string {
  const payload: string = btoa(JSON.stringify({ sub: "7", role: "mentor", exp: Math.floor(Date.now() / 1000) + 600 }));
  return `h.${payload}.s`;
}

describe("bootstrapAuth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    tokenStorage.setTokens({ accessToken: "old", refreshToken: "stored-refresh" });
    useAuthStore.setState({ status: "initializing", mustSetPassword: false, role: null, userId: null });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps the refresh token and retries when the network fails transiently", async () => {
    const refreshSpy = vi
      .spyOn(endpoints, "refresh")
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValueOnce({ access_token: buildAccessToken(), refresh_token: "rotated", must_set_password: false });
    const bootstrap: Promise<void> = bootstrapAuth();
    await vi.runAllTimersAsync();
    await bootstrap;
    expect(refreshSpy).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState().status).toBe("authenticated");
    expect(tokenStorage.getRefreshToken()).toBe("rotated");
  });

  it("does not wipe the stored refresh token when retries are exhausted", async () => {
    vi.spyOn(endpoints, "refresh").mockRejectedValue(new NetworkError());
    const bootstrap: Promise<void> = bootstrapAuth();
    await vi.runAllTimersAsync();
    await bootstrap;
    expect(useAuthStore.getState().status).toBe("unauthenticated");
    expect(tokenStorage.getRefreshToken()).toBe("stored-refresh");
  });

  it("clears the refresh token when the server rejects it", async () => {
    vi.spyOn(endpoints, "refresh").mockRejectedValue(new AuthApiError(401, "Invalid refresh token"));
    await bootstrapAuth();
    expect(useAuthStore.getState().status).toBe("unauthenticated");
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });
});
