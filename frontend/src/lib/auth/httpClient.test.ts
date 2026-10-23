import MockAdapter from "axios-mock-adapter";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./tokenStorage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tokenStorage")>();
  return { ...actual, tokenStorage: actual.createMemoryTokenStorage() };
});

const { httpClient } = await import("./httpClient");
const { tokenStorage } = await import("./tokenStorage");
const { onLogout } = await import("./session");
const { AuthApiError } = await import("./errors");
const { login, logout, changePassword } = await import("./endpoints");

const mock = new MockAdapter(httpClient);

const freshTokenPair = {
  access_token: "fresh-token",
  refresh_token: "rotated-refresh",
  token_type: "bearer",
  must_set_password: false,
};

beforeEach(() => {
  mock.reset();
  tokenStorage.clear();
});

afterEach(() => {
  mock.resetHistory();
});

function refreshCallCount() {
  return mock.history.post.filter((r) => r.url === "/auth/refresh").length;
}

describe("401 handling", () => {
  it("dedupes concurrent 401s into a single refresh, then retries each request once", async () => {
    tokenStorage.setTokens({ accessToken: "expired-token", refreshToken: "valid-refresh" });
    mock.onPost("/auth/refresh").reply(200, freshTokenPair);
    mock
      .onPost("/protected")
      .replyOnce(401, { detail: "expired" })
      .onPost("/protected")
      .replyOnce(401, { detail: "expired" })
      .onPost("/protected")
      .reply((config) => {
        expect(config.headers?.Authorization).toBe("Bearer fresh-token");
        return [200, { ok: true }];
      });

    const [a, b] = await Promise.all([
      httpClient.post("/protected", { n: 1 }),
      httpClient.post("/protected", { n: 2 }),
    ]);

    expect(a.data).toEqual({ ok: true });
    expect(b.data).toEqual({ ok: true });
    expect(refreshCallCount()).toBe(1);
    expect(tokenStorage.getAccessToken()).toBe("fresh-token");
    expect(tokenStorage.getRefreshToken()).toBe("rotated-refresh");
  });

  it("retries a request at most once and does not refresh again if it still 401s", async () => {
    tokenStorage.setTokens({ accessToken: "expired-token", refreshToken: "valid-refresh" });
    mock.onPost("/auth/refresh").reply(200, freshTokenPair);
    mock.onPost("/still-protected").reply(401, { detail: "still expired" });

    const err = await httpClient.post("/still-protected", {}).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AuthApiError);
    expect((err as InstanceType<typeof AuthApiError>).status).toBe(401);
    expect(refreshCallCount()).toBe(1);
  });

  it("clears tokens and emits a logout event when refresh itself fails", async () => {
    tokenStorage.setTokens({ accessToken: "expired-token", refreshToken: "bad-refresh" });
    mock.onPost("/auth/refresh").reply(401, { detail: "invalid refresh token" });
    mock.onPost("/protected").reply(401, { detail: "expired" });

    const logoutListener = vi.fn();
    const unsubscribe = onLogout(logoutListener);

    const err = await httpClient.post("/protected", {}).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AuthApiError);
    expect((err as InstanceType<typeof AuthApiError>).status).toBe(401);
    expect((err as InstanceType<typeof AuthApiError>).detail).toBe("expired");
    expect(tokenStorage.getAccessToken()).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
    expect(logoutListener).toHaveBeenCalledTimes(1);
    expect(refreshCallCount()).toBe(1);

    unsubscribe();
  });

  it("never attempts a refresh for a failed login call", async () => {
    mock.onPost("/auth/login").reply(401, { detail: "invalid credentials" });
    mock.onPost("/auth/refresh").reply(200, freshTokenPair);

    const err = await login("a@b.com", "wrong").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AuthApiError);
    expect(refreshCallCount()).toBe(0);
  });
});

describe("wrong credentials and outages", () => {
  const protectedChangePassword = { wrongCredentialsDetails: ["Invalid current password", "invalid_current_password"] };

  it("does not refresh or log out for a wrong current password (401)", async () => {
    tokenStorage.setTokens({ accessToken: "live-token", refreshToken: "valid-refresh" });
    mock.onPost("/auth/change-password").reply(401, { detail: "Invalid current password" });
    const logoutListener = vi.fn();
    const unsubscribe = onLogout(logoutListener);

    const err: unknown = await httpClient.post("/auth/change-password", {}, protectedChangePassword).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AuthApiError);
    expect((err as InstanceType<typeof AuthApiError>).status).toBe(401);
    expect(refreshCallCount()).toBe(0);
    expect(logoutListener).not.toHaveBeenCalled();
    expect(tokenStorage.getRefreshToken()).toBe("valid-refresh");
    unsubscribe();
  });

  it("passes a 400 invalid_current_password through untouched", async () => {
    tokenStorage.setTokens({ accessToken: "live-token", refreshToken: "valid-refresh" });
    mock.onPost("/auth/change-password").reply(400, { detail: "invalid_current_password" });
    const err: unknown = await httpClient.post("/auth/change-password", {}, protectedChangePassword).catch((e: unknown) => e);
    expect((err as InstanceType<typeof AuthApiError>).status).toBe(400);
    expect((err as InstanceType<typeof AuthApiError>).detail).toBe("invalid_current_password");
    expect(refreshCallCount()).toBe(0);
  });

  it("still refreshes when change-password fails with an expired session", async () => {
    tokenStorage.setTokens({ accessToken: "expired-token", refreshToken: "valid-refresh" });
    mock.onPost("/auth/refresh").reply(200, freshTokenPair);
    mock.onPost("/auth/change-password").replyOnce(401, { detail: "Could not validate credentials" }).onPost("/auth/change-password").reply(200, freshTokenPair);
    const res = await httpClient.post("/auth/change-password", {}, protectedChangePassword);
    expect(res.status).toBe(200);
    expect(refreshCallCount()).toBe(1);
  });

  it("keeps the session when the refresh endpoint is down (503)", async () => {
    tokenStorage.setTokens({ accessToken: "expired-token", refreshToken: "valid-refresh" });
    mock.onPost("/auth/refresh").reply(503, { detail: "unavailable" });
    mock.onPost("/protected").reply(401, { detail: "expired" });
    const logoutListener = vi.fn();
    const unsubscribe = onLogout(logoutListener);

    const err: unknown = await httpClient.post("/protected", {}).catch((e: unknown) => e);

    expect((err as InstanceType<typeof AuthApiError>).status).toBe(503);
    expect(logoutListener).not.toHaveBeenCalled();
    expect(tokenStorage.getRefreshToken()).toBe("valid-refresh");
    unsubscribe();
  });

  it("keeps the session on a network failure during refresh", async () => {
    tokenStorage.setTokens({ accessToken: "expired-token", refreshToken: "valid-refresh" });
    mock.onPost("/auth/refresh").networkError();
    mock.onPost("/protected").reply(401, { detail: "expired" });
    const logoutListener = vi.fn();
    const unsubscribe = onLogout(logoutListener);
    await httpClient.post("/protected", {}).catch((e: unknown) => e);
    expect(logoutListener).not.toHaveBeenCalled();
    expect(tokenStorage.getRefreshToken()).toBe("valid-refresh");
    unsubscribe();
  });
});

describe("logout and code-object details", () => {
  it("sends the bearer access token and the refresh token when logging out", async () => {
    tokenStorage.setTokens({ accessToken: "live-access", refreshToken: "live-refresh" });
    mock.onPost("/auth/logout").reply((config) => {
      expect(config.headers?.Authorization).toBe("Bearer live-access");
      expect(JSON.parse(config.data)).toEqual({ refresh_token: "live-refresh" });
      return [204];
    });
    await logout("live-refresh");
    expect(mock.history.post.filter((r) => r.url === "/auth/logout")).toHaveLength(1);
  });

  it("does not refresh when logout itself answers 401", async () => {
    tokenStorage.setTokens({ accessToken: "dead-access", refreshToken: "live-refresh" });
    mock.onPost("/auth/logout").reply(401, { detail: "expired" });
    mock.onPost("/auth/refresh").reply(200, freshTokenPair);
    await logout("live-refresh").catch(() => undefined);
    expect(refreshCallCount()).toBe(0);
  });

  it("passes a 400 code-object invalid_current_password through without refresh or logout", async () => {
    tokenStorage.setTokens({ accessToken: "live-access", refreshToken: "live-refresh" });
    mock.onPost("/auth/change-password").reply(400, { detail: { code: "invalid_current_password", message: "Invalid current password" } });
    const err: unknown = await changePassword("wrong", "NewPass-2026x1").catch((e: unknown) => e);
    expect((err as InstanceType<typeof AuthApiError>).code).toBe("invalid_current_password");
    expect(refreshCallCount()).toBe(0);
    expect(tokenStorage.getRefreshToken()).toBe("live-refresh");
  });

  it("signs out when a reused refresh token answers 401 after the grace window", async () => {
    tokenStorage.setTokens({ accessToken: "expired-token", refreshToken: "reused-refresh" });
    mock.onPost("/auth/refresh").reply(401, { detail: "Invalid refresh token" });
    mock.onPost("/protected").reply(401, { detail: "expired" });
    const logoutListener = vi.fn();
    const unsubscribe = onLogout(logoutListener);
    await httpClient.post("/protected", {}).catch((e: unknown) => e);
    expect(logoutListener).toHaveBeenCalledTimes(1);
    expect(tokenStorage.getRefreshToken()).toBeNull();
    unsubscribe();
  });
});
