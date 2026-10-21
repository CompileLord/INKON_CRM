import { describe, expect, it } from "vitest";
import { CanonicalPhone } from "./CanonicalPhone";
import { createStudentFormSchema } from "../studentFormSchema";
import { createMentorFormSchema } from "../mentorFormSchema";
import { buildUserFormValues, buildMentorFormValues, buildCreatePayload, buildUpdatePayload } from "./formMapping";
import type { UserFormValues } from "./formMapping";

const values: UserFormValues = { firstName: "A", lastName: "B", email: "a@example.com", phone: "", parentPhone: "", birthDate: "", parentTelegramChatId: "123", paymentDay: "" };

describe("canonical phone inputs", (): void => {
  it.each(["+12", "+12345678", "+123456789012345"])("accepts canonical staff phone %s", (phone: string): void => {
    expect(createMentorFormSchema().safeParse({ ...values, phone }).success).toBe(true);
  });
  it.each(["+1", "+1234567890123456", "12345678", "+01234567", "+１２３４５６７８", "+١٢٣٤٥٦٧٨", "+123-45678", " +12345678", "+12345678 ", " ", "+12345678\n"])("rejects entered invalid phone %j without rewriting", (phone: string): void => {
    expect(createMentorFormSchema().safeParse({ ...values, phone }).success).toBe(false);
    expect(createStudentFormSchema().safeParse({ ...values, phone }).success).toBe(false);
    expect(createStudentFormSchema().safeParse({ ...values, parentPhone: phone }).success).toBe(false);
    expect(buildCreatePayload({ ...values, phone }).phone).toBe(phone);
  });
  it("retains the 8–15 digit student and guardian limit", (): void => {
    for (const field of ["phone", "parentPhone"] as const) {
      expect(createStudentFormSchema().safeParse({ ...values, [field]: "+1234567" }).success).toBe(false);
      expect(createStudentFormSchema().safeParse({ ...values, [field]: "+12345678" }).success).toBe(true);
      expect(createStudentFormSchema().safeParse({ ...values, [field]: "+123456789012345" }).success).toBe(true);
    }
  });
  it("normalizes valid legacy prefills and keeps guardian bindings omitted on unchanged edits", (): void => {
    const user: Parameters<typeof buildUserFormValues>[0] = { first_name: "A", last_name: "B", email: "a@example.com", phone: "992901234567", parent_phone: "992901234568", parent_telegram_chat_id: 123, date_of_birth: null, payment_day_of_month: null };
    const prefilled: UserFormValues = buildUserFormValues(user);
    expect(prefilled.phone).toBe("+992901234567");
    expect(prefilled.parentPhone).toBe("+992901234568");
    expect(buildMentorFormValues(user).phone).toBe("+992901234567");
    expect(buildUpdatePayload(prefilled, { firstName: true })).toEqual({ first_name: "A" });
    expect(buildUpdatePayload(prefilled, { parentPhone: true })).toEqual({ parent_phone: "+992901234568" });
    expect(buildUpdatePayload({ ...prefilled, parentPhone: "" }, { parentPhone: true })).toEqual({ parent_phone: null });
  });
  it.each([null, undefined, "bad-number", " 12345678", "01234567", "+12345678"])("does not equate malformed legacy %j with another phone", (value: string | null | undefined): void => {
    expect(CanonicalPhone.prefill(value)).toBe(value ?? "");
  });
});
