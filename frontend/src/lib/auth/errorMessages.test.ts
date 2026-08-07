import { describe, expect, it } from "vitest";
import { AuthApiError, NetworkError } from "./errors";
import { describeAuthError } from "./errorMessages";

describe("describeAuthError", () => {
  it("uses the caller-supplied message for 401", () => {
    const err = new AuthApiError(401, "Invalid email or password");
    expect(describeAuthError(err, "Неверный email или пароль")).toBe("Неверный email или пароль");
  });

  it("maps 403 to a fixed message regardless of the server detail", () => {
    const err = new AuthApiError(403, "forbidden");
    expect(describeAuthError(err, "x")).toBe("Доступ запрещён");
  });

  it("maps any 5xx to a fixed message", () => {
    expect(describeAuthError(new AuthApiError(500, "boom"), "x")).toBe(
      "Сервер недоступен, попробуйте позже",
    );
    expect(describeAuthError(new AuthApiError(503, "boom"), "x")).toBe(
      "Сервер недоступен, попробуйте позже",
    );
  });

  it("shows the server's own detail for other statuses (e.g. verify-code's 400)", () => {
    const err = new AuthApiError(400, "Verification code expired or not requested");
    expect(describeAuthError(err, "x")).toBe("Verification code expired or not requested");
  });

  it("maps NetworkError to the same offline message as 5xx", () => {
    expect(describeAuthError(new NetworkError(), "x")).toBe("Сервер недоступен, попробуйте позже");
  });

  it("falls back to a generic message for anything unrecognized", () => {
    expect(describeAuthError(new Error("weird"), "x")).toBe(
      "Что-то пошло не так. Попробуйте ещё раз.",
    );
  });
});
