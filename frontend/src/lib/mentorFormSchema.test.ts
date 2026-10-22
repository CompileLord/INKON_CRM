import { describe, expect, it } from "vitest";
import { createMentorFormSchema, mentorFormSchema } from "./mentorFormSchema";
import { buildMentorCreatePayload, buildMentorUpdatePayload } from "./users/formMapping";

describe("mentorFormSchema", () => {
  it("validates valid mentor data", () => {
    const validData = {
      firstName: "John",
      lastName: "Doe",
      email: "john.doe@example.com",
      phone: "+992901234567",
      birthDate: "1990-01-01",
    };

    const result = mentorFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("accepts minimal valid mentor data with optional fields empty", () => {
    const minimalData = {
      firstName: "Jane",
      lastName: "Smith",
      email: "jane.smith@example.com",
      phone: "",
      birthDate: "",
    };

    const result = mentorFormSchema.safeParse(minimalData);
    expect(result.success).toBe(true);
  });

  it("rejects empty first name", () => {
    const result = mentorFormSchema.safeParse({
      firstName: "   ",
      lastName: "Smith",
      email: "jane@example.com",
      phone: "",
      birthDate: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "firstName")).toBe(true);
    }
  });

  it("rejects empty last name", () => {
    const result = mentorFormSchema.safeParse({
      firstName: "Jane",
      lastName: "",
      email: "jane@example.com",
      phone: "",
      birthDate: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "lastName")).toBe(true);
    }
  });

  it("rejects invalid email", () => {
    const result = mentorFormSchema.safeParse({
      firstName: "Jane",
      lastName: "Smith",
      email: "not-an-email",
      phone: "",
      birthDate: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "email")).toBe(true);
    }
  });

  it("validates E.164 phone formats and rejects invalid phone numbers", () => {
    const valid = mentorFormSchema.safeParse({
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
      phone: "+992901234567",
      birthDate: "",
    });
    expect(valid.success).toBe(true);

    const invalid = mentorFormSchema.safeParse({
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
      phone: "123-abc",
      birthDate: "",
    });
    expect(invalid.success).toBe(false);
  });

  it("requires the plus sign and allows the supported two-to-fifteen E.164 digit range", () => {
    const parsePhone = (phone: string) =>
      mentorFormSchema.safeParse({
        firstName: "Jane",
        lastName: "Smith",
        email: "jane@example.com",
        phone,
        birthDate: "",
      });

    expect(parsePhone("+12").success).toBe(true);
    expect(parsePhone("+12345678").success).toBe(true);
    expect(parsePhone(`+${"1".repeat(15)}`).success).toBe(true);
    expect(parsePhone(`+${"1".repeat(16)}`).success).toBe(false);
    expect(parsePhone(`+1${"2".repeat(14)}`).success).toBe(true);
    expect(parsePhone("12345678").success).toBe(false);
    expect(parsePhone(`+1${"2".repeat(15)}`).success).toBe(false);
  });

  it("omits student parent and payment fields from mentor schema and payloads", () => {
    const values = {
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
      phone: "+992901234567",
      birthDate: "1990-01-01",
    };
    const parsed = mentorFormSchema.safeParse(values);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect("parentTelegramChatId" in parsed.data).toBe(false);
      expect("parentPhone" in parsed.data).toBe(false);
      expect("paymentDay" in parsed.data).toBe(false);
    }
  });

  it("uses translated messages when provided", () => {
    const customT = (key: string) => `translated:${key}`;
    const schema = createMentorFormSchema(customT);

    const result = schema.safeParse({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      birthDate: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      expect(issues.some((i) => i.message === "translated:validation.firstNameRequired")).toBe(true);
      expect(issues.some((i) => i.message === "translated:validation.lastNameRequired")).toBe(true);
      expect(issues.some((i) => i.message === "translated:validation.emailRequired")).toBe(true);
    }
  });

  it("omits student-only paymentDay, parentPhone, and parentTelegramChatId fields from schema", () => {
    const shape = mentorFormSchema.shape;
    expect("paymentDay" in shape).toBe(false);
    expect("parentPhone" in shape).toBe(false);
    expect("parentTelegramChatId" in shape).toBe(false);
  });
});

describe("mentor form mapping payloads", () => {
  it("buildMentorCreatePayload omits student parent and payment fields", () => {
    const payload = buildMentorCreatePayload({
      firstName: "Alisher",
      lastName: "Navoi",
      email: "alisher@example.com",
      phone: "+992901234567",
      birthDate: "1985-05-15",
    });

    expect(payload).toEqual({
      first_name: "Alisher",
      last_name: "Navoi",
      email: "alisher@example.com",
      phone: "+992901234567",
      date_of_birth: "1985-05-15",
    });
    expect("parent_telegram_chat_id" in payload).toBe(false);
    expect("parent_phone" in payload).toBe(false);
    expect("payment_day_of_month" in payload).toBe(false);
  });

  it("buildMentorUpdatePayload omits student parent and payment fields and preserves server data", () => {
    const payload = buildMentorUpdatePayload(
      {
        firstName: "UpdatedAlisher",
        lastName: "Navoi",
        email: "alisher@example.com",
        phone: "+992901234567",
        birthDate: "1985-05-15",
      },
      {
        firstName: true,
      },
    );

    expect(payload).toEqual({
      first_name: "UpdatedAlisher",
    });
    expect("parent_telegram_chat_id" in payload).toBe(false);
    expect("parent_phone" in payload).toBe(false);
    expect("payment_day_of_month" in payload).toBe(false);
  });
});
