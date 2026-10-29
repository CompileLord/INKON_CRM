import { describe, expect, it, vi } from "vitest";
import { AuthApiError, NetworkError } from "../auth/errors";
import {
  applyFieldErrors,
  buildCreatePayload,
  buildUpdatePayload,
  buildUserFormValues,
  describeUserApiError,
  isDuplicateEmailError,
  isDuplicatePhoneError,
  userFormDefaults,
} from "./formMapping";

describe("buildUserFormValues", () => {
  it("returns defaults when no user is given", () => {
    expect(buildUserFormValues()).toEqual(userFormDefaults);
  });

  it("maps an existing user onto form values", () => {
    const values = buildUserFormValues({
      first_name: "Азиз",
      last_name: "Рахимов",
      email: "aziz@example.com",
      phone: "+992901234567",
      date_of_birth: "2000-05-01",
      payment_day_of_month: 15,
    });

    expect(values).toEqual({
      firstName: "Азиз",
      lastName: "Рахимов",
      email: "aziz@example.com",
      phone: "+992901234567",
      birthDate: "2000-05-01",
      parentPhone: "",
      paymentDay: "15",
    });
  });
});

describe("buildCreatePayload", () => {
  it("converts empty optional fields to null", () => {
    const payload = buildCreatePayload({
      firstName: "Азиз",
      lastName: "Рахимов",
      email: "aziz@example.com",
      phone: "",
      birthDate: "",
      parentPhone: "",
      paymentDay: "",
    });

    expect(payload).toEqual({
      first_name: "Азиз",
      last_name: "Рахимов",
      email: "aziz@example.com",
      phone: null,
      date_of_birth: null,
      parent_phone: null,
      payment_day_of_month: null,
    });
  });
});

describe("email optionality in payloads", () => {
  const emptyEmailValues = {
    firstName: "Азиз",
    lastName: "Рахимов",
    email: "  ",
    phone: "+992901234567",
    birthDate: "",
    parentPhone: "",
    paymentDay: "",
  };

  it("omits the email key from the create payload when it is blank", () => {
    expect("email" in buildCreatePayload(emptyEmailValues)).toBe(false);
  });

  it("sends null in the update payload when the email field was cleared", () => {
    expect(buildUpdatePayload(emptyEmailValues, { email: true })).toEqual({ email: null });
  });

  it("maps a user without an email to an empty form value", () => {
    const values = buildUserFormValues({
      first_name: "A", last_name: "B", email: null, phone: "+992901234567", date_of_birth: null, payment_day_of_month: null,
    });
    expect(values.email).toBe("");
  });
});

describe("buildUpdatePayload", () => {
  const values = {
    firstName: "Азиз",
    lastName: "Рахимов",
    email: "aziz@example.com",
    phone: "+992901234567",
    birthDate: "2000-05-01",
    parentPhone: "+992901234568",
    paymentDay: "15",
  };

  it("includes only the keys react-hook-form marked dirty, never the untouched ones", () => {
    const payload = buildUpdatePayload(values, { phone: true });

    expect(payload).toEqual({ phone: "+992901234567" });
    expect(payload).not.toHaveProperty("first_name");
    expect(payload).not.toHaveProperty("email");
    expect(payload).not.toHaveProperty("payment_day_of_month");
  });

  it("includes every dirty key when several fields changed", () => {
    const payload = buildUpdatePayload(values, { firstName: true, paymentDay: true });

    expect(payload).toEqual({ first_name: "Азиз", payment_day_of_month: 15 });
  });

  it("returns an empty object when nothing changed", () => {
    expect(buildUpdatePayload(values, {})).toEqual({});
  });
});

describe("applyFieldErrors", () => {
  it("maps API field names (loc-derived) onto form field names", () => {
    const setError = vi.fn();
    const applied = applyFieldErrors(
      { email: "value is not a valid email address", payment_day_of_month: "Число от 1 до 28" },
      setError,
    );

    expect(applied).toBe(true);
    expect(setError).toHaveBeenCalledWith("email", {
      type: "server",
      message: "value is not a valid email address",
    });
    expect(setError).toHaveBeenCalledWith("paymentDay", {
      type: "server",
      message: "Число от 1 до 28",
    });
  });

  it("returns false when no known field matches", () => {
    const setError = vi.fn();
    const applied = applyFieldErrors({ unknown_field: "oops" }, setError);

    expect(applied).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });
});

describe("describeUserApiError", () => {
  it("never shows the connection-error message for a response that actually reached the browser", () => {
    // A response with a status code — even 500 — is not a connection
    // error; only NetworkError (no response at all) is.
    for (const status of [400, 403, 404, 409, 422, 500, 502, 503]) {
      expect(describeUserApiError(new AuthApiError(status, "some detail"))).not.toBe(
        "Не удалось подключиться к серверу",
      );
    }
  });

  it("maps 5xx to a fixed friendly message regardless of the raw detail", () => {
    expect(describeUserApiError(new AuthApiError(500, "Internal Server Error"))).toBe(
      "Сервер недоступен, попробуйте позже",
    );
    expect(describeUserApiError(new AuthApiError(503, "Service Unavailable"))).toBe(
      "Сервер недоступен, попробуйте позже",
    );
  });

  it("shows the server's own detail for other statuses (e.g. 409)", () => {
    expect(describeUserApiError(new AuthApiError(409, "Conflict"))).toBe("Conflict");
  });

  it("only NetworkError gets the connection-error message", () => {
    expect(describeUserApiError(new NetworkError())).toBe("Не удалось подключиться к серверу");
  });
});

describe("isDuplicateEmailError", () => {
  it("matches only the 409 email_taken code", () => {
    expect(isDuplicateEmailError(new AuthApiError(409, { code: "email_taken" }))).toBe(true);
    expect(isDuplicateEmailError(new AuthApiError(409, { code: "phone_taken" }))).toBe(false);
    expect(isDuplicateEmailError(new AuthApiError(409, "Email already exists"))).toBe(false);
    expect(isDuplicateEmailError(new AuthApiError(500, { code: "email_taken" }))).toBe(false);
    expect(isDuplicateEmailError(new Error("weird"))).toBe(false);
  });
});

describe("isDuplicatePhoneError", () => {
  it("matches only the 409 phone_taken code", () => {
    expect(isDuplicatePhoneError(new AuthApiError(409, { code: "phone_taken" }))).toBe(true);
    expect(isDuplicatePhoneError(new AuthApiError(409, { code: "email_taken" }))).toBe(false);
    expect(isDuplicatePhoneError(new AuthApiError(409, "User with this phone already exists"))).toBe(false);
  });
});

describe("describeUserApiError with backend codes", () => {
  it("translates codes that carry no message and counts mentor courses", () => {
    const translate = (key: string, options?: Record<string, unknown>): string => `${key}:${String(options?.courses)}`;
    expect(describeUserApiError(new AuthApiError(409, { code: "mentor_has_active_courses", course_count: 3 }), translate)).toBe("common:apiErrors.mentorHasActiveCourses:3");
    expect(describeUserApiError(new AuthApiError(422, "course_already_ended"), translate)).toBe("common:apiErrors.courseAlreadyEnded:0");
  });
});
