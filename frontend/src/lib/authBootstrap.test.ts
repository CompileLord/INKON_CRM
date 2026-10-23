import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../store/authStore";
import { AuthApiError, NetworkError } from "./auth/errors";
import { tokenStorage } from "./auth/tokenStorage";
import { refreshCoordinator } from "./auth/httpClient";
import type { TokenPair } from "./auth/types";
import { bootstrapAuth, retryAuthBootstrap } from "./authBootstrap";

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
      .spyOn(refreshCoordinator, "refresh")
      .mockRejectedValueOnce(new NetworkError())
      .mockImplementationOnce(async (): Promise<TokenPair> => {
        const tokens: TokenPair = { access_token: buildAccessToken(), refresh_token: "rotated", token_type: "bearer", must_set_password: false };
        useAuthStore.getState().setAuthenticated(tokens.access_token, tokens.refresh_token, false);
        return tokens;
      });
    const bootstrap: Promise<void> = bootstrapAuth();
    await vi.runAllTimersAsync();
    await bootstrap;
    expect(refreshSpy).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState().status).toBe("authenticated");
    expect(tokenStorage.getRefreshToken()).toBe("rotated");
  });

  it("reports the server as unavailable, not logged out, when retries are exhausted", async () => {
    vi.spyOn(refreshCoordinator, "refresh").mockRejectedValue(new NetworkError());
    const bootstrap: Promise<void> = bootstrapAuth();
    await vi.runAllTimersAsync();
    await bootstrap;
    expect(useAuthStore.getState().status).toBe("unavailable");
    expect(tokenStorage.getRefreshToken()).toBe("stored-refresh");
  });

  it("reports unavailable for a 503 and recovers on retry", async () => {
    const refreshSpy = vi.spyOn(refreshCoordinator, "refresh").mockRejectedValue(new AuthApiError(503, "down"));
    const bootstrap: Promise<void> = bootstrapAuth();
    await vi.runAllTimersAsync();
    await bootstrap;
    expect(useAuthStore.getState().status).toBe("unavailable");
    refreshSpy.mockImplementation(async (): Promise<TokenPair> => {
      const tokens: TokenPair = { access_token: buildAccessToken(), refresh_token: "rotated", token_type: "bearer", must_set_password: false };
      useAuthStore.getState().setAuthenticated(tokens.access_token, tokens.refresh_token, false);
      return tokens;
    });
    await retryAuthBootstrap();
    expect(useAuthStore.getState().status).toBe("authenticated");
  });

  it("runs a single refresh when bootstrap is triggered twice (StrictMode effects)", async () => {
    const refreshSpy = vi.spyOn(refreshCoordinator, "refresh").mockRejectedValue(new AuthApiError(401, "no"));
    await Promise.all([bootstrapAuth(), bootstrapAuth()]);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it("clears the refresh token when the server rejects it", async () => {
    vi.spyOn(refreshCoordinator, "refresh").mockRejectedValue(new AuthApiError(401, "Invalid refresh token"));
    await bootstrapAuth();
    expect(useAuthStore.getState().status).toBe("unauthenticated");
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });
});
