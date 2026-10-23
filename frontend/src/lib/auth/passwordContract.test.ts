import { describe, expect, it } from "vitest";
import { AuthApiError } from "./errors";
import { mapChangePasswordError, mapSetPasswordError } from "./errorMessages";
import { PasswordPolicyViolation } from "./passwordPolicy";

const BACKEND_MESSAGE: string = "Password must be at least 8 characters, contain a digit, not be all digits and not be a common password";

describe("password contract from the backend", () => {
  it("recognises the policy violation on 400 and 422 strings only", () => {
    expect(PasswordPolicyViolation.matches(new AuthApiError(400, BACKEND_MESSAGE))).toBe(true);
    expect(PasswordPolicyViolation.matches(new AuthApiError(422, BACKEND_MESSAGE))).toBe(true);
    expect(PasswordPolicyViolation.matches(new AuthApiError(400, "Something else"))).toBe(false);
    expect(PasswordPolicyViolation.matches(new AuthApiError(500, BACKEND_MESSAGE))).toBe(false);
    expect(PasswordPolicyViolation.matches(new Error(BACKEND_MESSAGE))).toBe(false);
  });

  it("maps the violation on set-password to the new password field with a translation key", () => {
    const mapping = mapSetPasswordError(new AuthApiError(400, BACKEND_MESSAGE));
    expect(mapping.fieldErrors).toEqual([{ field: "newPassword", messageKey: "auth:passwordPolicyError" }]);
    expect(mapping.formErrorKey).toBeNull();
  });

  it("maps the violation on change-password to the new password field", () => {
    expect(mapChangePasswordError(new AuthApiError(400, BACKEND_MESSAGE))).toEqual({ field: "newPassword", messageKey: "auth:passwordPolicyError" });
  });

  it("matches the wrong current password by its code object", () => {
    const error: AuthApiError = new AuthApiError(400, { code: "invalid_current_password", message: "Invalid current password" });
    expect(error.code).toBe("invalid_current_password");
    expect(error.message).toBe("Invalid current password");
    expect(mapChangePasswordError(error)).toEqual({ field: "currentPassword", messageKey: "settings:security.currentPasswordWrong" });
  });

  it("does not treat an unrelated 400 on change-password as a wrong password", () => {
    expect(mapChangePasswordError(new AuthApiError(400, { code: "other", message: "x" }))).toEqual({ field: null, messageKey: "auth:genericError" });
  });
});
