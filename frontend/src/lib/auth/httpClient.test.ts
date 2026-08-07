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
const { login } = await import("./endpoints");

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
