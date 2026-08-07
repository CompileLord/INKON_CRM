import MockAdapter from "axios-mock-adapter";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./tokenStorage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tokenStorage")>();
  return { ...actual, tokenStorage: actual.createMemoryTokenStorage() };
});

const { httpClient } = await import("./httpClient");
const { tokenStorage } = await import("./tokenStorage");
const {
  login,
  refresh,
  logout,
  verifyCode,
  resendCode,
  setPassword,
  passwordResetRequest,
  passwordResetVerify,
  passwordResetConfirm,
} = await import("./endpoints");

const mock = new MockAdapter(httpClient);

beforeEach(() => {
  mock.reset();
  tokenStorage.clear();
});

afterEach(() => {
  mock.resetHistory();
});

const tokenPair = {
  access_token: "access-123",
  refresh_token: "refresh-123",
  token_type: "bearer",
  must_set_password: false,
};

describe("login", () => {
  it("posts credentials without an Authorization header and returns the token pair", async () => {
    mock.onPost("/auth/login").reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ email: "a@b.com", password: "secret" });
      expect(config.headers?.Authorization).toBeUndefined();
      return [200, tokenPair];
    });

    await expect(login("a@b.com", "secret")).resolves.toEqual(tokenPair);
  });
});

describe("refresh", () => {
  it("posts the refresh token without an Authorization header", async () => {
    mock.onPost("/auth/refresh").reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ refresh_token: "refresh-123" });
      expect(config.headers?.Authorization).toBeUndefined();
      return [200, tokenPair];
    });

    await expect(refresh("refresh-123")).resolves.toEqual(tokenPair);
  });
});

describe("logout", () => {
  it("posts the refresh token and resolves on 204", async () => {
    mock.onPost("/auth/logout", { refresh_token: "refresh-123" }).reply(204);

    await expect(logout("refresh-123")).resolves.toBeUndefined();
  });
});

describe("verifyCode", () => {
  it("posts email + code and returns the token pair", async () => {
    mock.onPost("/auth/verify-code", { email: "a@b.com", code: "123456" }).reply(200, tokenPair);

    await expect(verifyCode("a@b.com", "123456")).resolves.toEqual(tokenPair);
  });
});

describe("resendCode", () => {
  it("posts email and resolves on 204", async () => {
    mock.onPost("/auth/resend-code", { email: "a@b.com" }).reply(204);

    await expect(resendCode("a@b.com")).resolves.toBeUndefined();
  });
});

describe("setPassword", () => {
  it("attaches the Authorization header from the stored access token", async () => {
    tokenStorage.setTokens({ accessToken: "temp-access-token", refreshToken: null });

    mock.onPost("/auth/set-password").reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ new_password: "newSecret1" });
      expect(config.headers?.Authorization).toBe("Bearer temp-access-token");
      return [200, tokenPair];
    });

    await expect(setPassword("newSecret1")).resolves.toEqual(tokenPair);
  });
});

describe("passwordResetRequest", () => {
  it("posts email without an Authorization header", async () => {
    mock.onPost("/auth/password-reset/request").reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ email: "a@b.com" });
      expect(config.headers?.Authorization).toBeUndefined();
      return [200, { message: "code sent" }];
    });

    await expect(passwordResetRequest("a@b.com")).resolves.toEqual({ message: "code sent" });
  });
});

describe("passwordResetVerify", () => {
  it("posts email + code and returns the reset token", async () => {
    mock
      .onPost("/auth/password-reset/verify", { email: "a@b.com", code: "654321" })
      .reply(200, { reset_token: "reset-abc" });

    await expect(passwordResetVerify("a@b.com", "654321")).resolves.toEqual({
      reset_token: "reset-abc",
    });
  });
});

describe("passwordResetConfirm", () => {
  it("posts the reset token + new password without an Authorization header", async () => {
    mock.onPost("/auth/password-reset/confirm").reply((config) => {
      expect(JSON.parse(config.data)).toEqual({
        reset_token: "reset-abc",
        new_password: "newSecret1",
      });
      expect(config.headers?.Authorization).toBeUndefined();
      return [200, tokenPair];
    });

    await expect(passwordResetConfirm("reset-abc", "newSecret1")).resolves.toEqual(tokenPair);
  });
});

describe("error shape", () => {
  it("surfaces the 422 validation array as AuthApiError.fieldErrors", async () => {
    const { AuthApiError } = await import("./errors");
    mock.onPost("/auth/login").reply(422, {
      detail: [{ loc: ["body", "email"], msg: "value is not a valid email address", type: "value_error" }],
    });

    const err = await login("bad", "secret").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthApiError);
    expect((err as InstanceType<typeof AuthApiError>).status).toBe(422);
    expect((err as InstanceType<typeof AuthApiError>).fieldErrors).toEqual({
      email: "value is not a valid email address",
    });
  });

  it("throws NetworkError when there is no response", async () => {
    const { NetworkError } = await import("./errors");
    mock.onPost("/auth/login").networkError();

    await expect(login("a@b.com", "secret")).rejects.toBeInstanceOf(NetworkError);
  });
});
