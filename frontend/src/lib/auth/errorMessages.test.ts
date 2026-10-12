import { describe, expect, it } from "vitest";
import { AuthApiError, NetworkError } from "./errors";
import {
  describeAuthError,
  getAuthErrorKind,
  mapResendCodeError,
  mapSetPasswordError,
  mapValidationError,
  mapVerifyCodeError,
} from "./errorMessages";

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

  it("maps error statuses to structured localized error keys", () => {
    expect(getAuthErrorKind(new AuthApiError(401, "bad creds"))).toBe("invalidCredentials");
    expect(getAuthErrorKind(new AuthApiError(403, "forbidden"))).toBe("forbidden");
    expect(getAuthErrorKind(new AuthApiError(429, "too many"))).toBe("rateLimited");
    expect(getAuthErrorKind(new AuthApiError(500, "internal"))).toBe("serverError");
    expect(getAuthErrorKind(new AuthApiError(503, "unavailable"))).toBe("serverError");
    expect(getAuthErrorKind(new NetworkError())).toBe("networkError");
    expect(getAuthErrorKind(new Error("unknown"))).toBe("genericError");
  });

  it("maps 422 validation detail items to localized keys without leaking technical messages", () => {
    const verifiedEmailFormats = [
      mapValidationError([{ loc: ["body", "email"], msg: "value is not a valid email address", type: "value_error", ctx: { reason: "An email address must have an @-sign." } }]),
      mapValidationError([{ loc: ["body", "email"], msg: "email parsing error", type: "email_parsing" }]),
      mapValidationError([{ loc: ["body", "email"], msg: "email format error", type: "value_error.email" }]),
    ];
    for (const result of verifiedEmailFormats) {
      expect(result.fieldErrors).toEqual([{ field: "email", messageKey: "validation:invalidEmail" }]);
      expect(result.formErrorKey).toBeNull();
    }

    const missingResult = mapValidationError([
      { loc: ["body", "email"], msg: "Field required", type: "missing" },
      { loc: ["body", "password"], msg: "Field required", type: "missing" },
    ]);
    expect(missingResult.fieldErrors).toEqual([
      { field: "email", messageKey: "validation:required" },
      { field: "password", messageKey: "validation:required" },
    ]);
    expect(missingResult.formErrorKey).toBeNull();

    const filledPasswordUnknownType = mapValidationError([
      { loc: ["body", "password"], msg: "Password hash verification failed", type: "value_error" },
    ]);
    expect(filledPasswordUnknownType.fieldErrors).toEqual([{ field: "password", messageKey: "auth:genericError" }]);
    expect(filledPasswordUnknownType.formErrorKey).toBeNull();

    const arbitraryEmailUnknownType = mapValidationError([
      { loc: ["body", "email"], msg: "Internal company policy mismatch", type: "value_error" },
    ]);
    expect(arbitraryEmailUnknownType.fieldErrors).toEqual([{ field: "email", messageKey: "auth:genericError" }]);
    expect(arbitraryEmailUnknownType.formErrorKey).toBeNull();

    const unknownFieldResult = mapValidationError([
      { loc: ["body", "tenant_id"], msg: "Invalid tenant uuid hex", type: "value_error" },
    ]);
    expect(unknownFieldResult.fieldErrors).toEqual([]);
    expect(unknownFieldResult.formErrorKey).toBe("genericError");

    const malformedItemsResult = mapValidationError([
      null,
      { loc: [] },
      "corrupted item",
    ]);
    expect(malformedItemsResult.fieldErrors).toEqual([]);
    expect(malformedItemsResult.formErrorKey).toBe("genericError");

    const nonArrayResult = mapValidationError("Not a valid validation array");
    expect(nonArrayResult.fieldErrors).toEqual([]);
    expect(nonArrayResult.formErrorKey).toBe("genericError");

    const codeMissingResult = mapVerifyCodeError(
      new AuthApiError(422, [
        { loc: ["body", "code"], msg: "Field required", type: "missing" },
      ]),
    );
    expect(codeMissingResult.fieldErrors).toEqual([{ field: "code", messageKey: "validation:required" }]);
    expect(codeMissingResult.formErrorKey).toBeNull();

    const codeLengthResult = mapVerifyCodeError(
      new AuthApiError(422, [
        { loc: ["body", "code"], msg: "String should have at least 6 characters", type: "string_too_short" },
      ]),
    );
    expect(codeLengthResult.fieldErrors).toEqual([{ field: "code", messageKey: "auth:invalidCode" }]);
    expect(codeLengthResult.formErrorKey).toBeNull();

    const arbitrary422Result = mapVerifyCodeError(
      new AuthApiError(422, [
        { loc: ["body", "code"], msg: "Some unexpected error", type: "custom_type" },
      ]),
    );
    expect(arbitrary422Result.fieldErrors).toEqual([{ field: "code", messageKey: "auth:genericError" }]);
    expect(arbitrary422Result.formErrorKey).toBe("genericError");
  });

  it("maps verify code server errors to localized keys without leaking technical strings", () => {
    const expired = mapVerifyCodeError(new AuthApiError(400, "Verification code expired or not requested"));
    expect(expired.formErrorKey).toBe("codeExpired");
    expect(expired.fieldErrors).toEqual([]);

    const invalidated = mapVerifyCodeError(new AuthApiError(400, "Too many incorrect attempts. Code invalidated."));
    expect(invalidated.formErrorKey).toBe("tooManyAttempts");
    expect(invalidated.fieldErrors).toEqual([]);

    const wrongCode = mapVerifyCodeError(new AuthApiError(400, "Invalid verification code"));
    expect(wrongCode.formErrorKey).toBeNull();
    expect(wrongCode.fieldErrors).toEqual([{ field: "code", messageKey: "auth:invalidCode" }]);

    const unknown400 = mapVerifyCodeError(new AuthApiError(400, "Some unexpected business logic error"));
    expect(unknown400.formErrorKey).toBe("genericError");
    expect(unknown400.fieldErrors).toEqual([]);

    const userNotFound = mapVerifyCodeError(new AuthApiError(404, "User not found"));
    expect(userNotFound.formErrorKey).toBeNull();
    expect(userNotFound.fieldErrors).toEqual([{ field: "email", messageKey: "auth:userNotFound" }]);

    const rateLimited = mapVerifyCodeError(new AuthApiError(429, "Too many attempts"));
    expect(rateLimited.formErrorKey).toBe("rateLimited");

    const serverError = mapVerifyCodeError(new AuthApiError(500, "Internal Server Error"));
    expect(serverError.formErrorKey).toBe("serverError");

    const networkError = mapVerifyCodeError(new NetworkError());
    expect(networkError.formErrorKey).toBe("networkError");
  });

  it("maps resend code server errors to localized keys", () => {
    const passwordSet = mapResendCodeError(new AuthApiError(400, "Password already set"));
    expect(passwordSet.formErrorKey).toBe("passwordAlreadySet");

    const unknownResend400 = mapResendCodeError(new AuthApiError(400, "Arbitrary resend failure"));
    expect(unknownResend400.formErrorKey).toBe("resendError");
    expect(unknownResend400.fieldErrors).toEqual([]);

    const userNotFound = mapResendCodeError(new AuthApiError(404, "User not found"));
    expect(userNotFound.formErrorKey).toBeNull();
    expect(userNotFound.fieldErrors).toEqual([{ field: "email", messageKey: "auth:userNotFound" }]);

    const rateLimited = mapResendCodeError(new AuthApiError(429, "Too many attempts"));
    expect(rateLimited.formErrorKey).toBe("rateLimited");

    const serverError = mapResendCodeError(new AuthApiError(500, "Internal Server Error"));
    expect(serverError.formErrorKey).toBe("serverError");

    const networkError = mapResendCodeError(new NetworkError());
    expect(networkError.formErrorKey).toBe("networkError");
  });

  it("maps set password server errors to localized keys", () => {
    const policy400 = mapSetPasswordError(
      new AuthApiError(400, "Password must be at least 8 characters and contain at least 1 digit"),
    );
    expect(policy400.fieldErrors).toEqual([
      { field: "newPassword", messageKey: "auth:passwordPolicyError" },
    ]);
    expect(policy400.formErrorKey).toBeNull();

    const arbitrary400 = mapSetPasswordError(new AuthApiError(400, "Arbitrary business error"));
    expect(arbitrary400.fieldErrors).toEqual([]);
    expect(arbitrary400.formErrorKey).toBe("setPasswordError");

    const missing422 = mapSetPasswordError(
      new AuthApiError(422, [
        { loc: ["body", "new_password"], msg: "Field required", type: "missing" },
      ]),
    );
    expect(missing422.fieldErrors).toEqual([
      { field: "newPassword", messageKey: "validation:required" },
    ]);
    expect(missing422.formErrorKey).toBeNull();

    const short422 = mapSetPasswordError(
      new AuthApiError(422, [
        {
          loc: ["body", "new_password"],
          msg: "String should have at least 8 characters",
          type: "string_too_short",
        },
      ]),
    );
    expect(short422.fieldErrors).toEqual([
      { field: "newPassword", messageKey: "validation:passwordMinLength", params: { min: 8 } },
    ]);
    expect(short422.formErrorKey).toBeNull();

    const arbitrary422 = mapSetPasswordError(
      new AuthApiError(422, [
        { loc: ["body", "new_password"], msg: "Invalid format", type: "custom_type" },
      ]),
    );
    expect(arbitrary422.fieldErrors).toEqual([
      { field: "newPassword", messageKey: "auth:genericError" },
    ]);
    expect(arbitrary422.formErrorKey).toBe("genericError");

    const auth401 = mapSetPasswordError(new AuthApiError(401, "Unauthorized"));
    expect(auth401.formErrorKey).toBe("setPasswordError");

    const notFound404 = mapSetPasswordError(new AuthApiError(404, "User not found"));
    expect(notFound404.formErrorKey).toBe("userNotFound");

    const rateLimited429 = mapSetPasswordError(new AuthApiError(429, "Too many requests"));
    expect(rateLimited429.formErrorKey).toBe("rateLimited");

    const serverError500 = mapSetPasswordError(new AuthApiError(500, "Server Error"));
    expect(serverError500.formErrorKey).toBe("serverError");

    const network = mapSetPasswordError(new NetworkError());
    expect(network.formErrorKey).toBe("networkError");
  });
});
