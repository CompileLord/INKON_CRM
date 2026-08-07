import { describe, expect, it, vi } from "vitest";
import { AuthApiError, NetworkError } from "../auth/errors";
import {
  applyFieldErrors,
  buildCreatePayload,
  buildUpdatePayload,
  buildUserFormValues,
  describeUserApiError,
  isDuplicateEmailError,
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
      parent_telegram_chat_id: 123456789,
      payment_day_of_month: 15,
    });

    expect(values).toEqual({
      firstName: "Азиз",
      lastName: "Рахимов",
      email: "aziz@example.com",
      phone: "+992901234567",
      birthDate: "2000-05-01",
      parentTelegramChatId: "123456789",
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
      parentTelegramChatId: "",
      parentPhone: "",
      paymentDay: "",
    });

    expect(payload).toEqual({
      first_name: "Азиз",
      last_name: "Рахимов",
      email: "aziz@example.com",
      phone: null,
      date_of_birth: null,
      parent_telegram_chat_id: null,
      parent_phone: null,
      payment_day_of_month: null,
    });
  });
});

describe("buildUpdatePayload", () => {
  const values = {
    firstName: "Азиз",
    lastName: "Рахимов",
    email: "aziz@example.com",
    phone: "+992901234567",
    birthDate: "2000-05-01",
    parentTelegramChatId: "123456789",
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
  it("matches a 409 whose detail mentions the email already existing", () => {
    expect(isDuplicateEmailError(new AuthApiError(409, "Email already exists"))).toBe(true);
  });

  it("matches a 400 with a Russian duplicate-email message", () => {
    expect(isDuplicateEmailError(new AuthApiError(400, "Этот email уже используется"))).toBe(true);
  });

  it("matches a 422 field error keyed on email even without the word 'email' in the message", () => {
    expect(
      isDuplicateEmailError(
        new AuthApiError(422, [{ loc: ["body", "email"], msg: "already registered", type: "value_error" }]),
      ),
    ).toBe(true);
  });

  it("does not match an unrelated 409, a 500, or a message missing either signal", () => {
    expect(isDuplicateEmailError(new AuthApiError(409, "Version conflict"))).toBe(false);
    expect(isDuplicateEmailError(new AuthApiError(500, "email already exists"))).toBe(false);
    expect(isDuplicateEmailError(new AuthApiError(400, "email is required"))).toBe(false);
    expect(isDuplicateEmailError(new Error("weird"))).toBe(false);
  });
});
