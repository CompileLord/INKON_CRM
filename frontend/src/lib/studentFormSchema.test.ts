import { describe, expect, it } from "vitest";
import { createStudentFormSchema, phonePattern } from "./studentFormSchema";

const baseValues = {
  firstName: "Aziz",
  lastName: "Rakhimov",
  email: "aziz@example.com",
  phone: "",
  birthDate: "",
  parentPhone: "",
  paymentDay: "",
};

describe("student form login identifier rule", () => {
  const requireIdentifier = (values: typeof baseValues) =>
    createStudentFormSchema((key: string) => key, true).safeParse(values);

  it("rejects a student with neither email nor own phone", () => {
    const result = requireIdentifier({ ...baseValues, email: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0].path).toEqual(["phone"]);
      expect(result.error.issues[0].message).toBe("validation.emailOrPhoneRequired");
    }
  });

  it("rejects a student with only a parent phone", () => {
    expect(requireIdentifier({ ...baseValues, email: "", parentPhone: "+992901234568" }).success).toBe(false);
  });

  it("accepts only an email", () => {
    expect(requireIdentifier(baseValues).success).toBe(true);
  });

  it("accepts only an own phone", () => {
    expect(requireIdentifier({ ...baseValues, email: "", phone: "+992901234567" }).success).toBe(true);
  });

  it("rejects a malformed email even when a phone is present", () => {
    expect(requireIdentifier({ ...baseValues, email: "not-an-email", phone: "+992901234567" }).success).toBe(false);
  });

  it("does not require an identifier when the rule is off", () => {
    expect(createStudentFormSchema((key: string) => key, false).safeParse({ ...baseValues, email: "" }).success).toBe(true);
  });
});

describe("student form phone format", () => {
  it("requires E.164 with a leading plus", () => {
    expect(phonePattern.test("+992901234567")).toBe(true);
    expect(phonePattern.test("992901234567")).toBe(false);
    expect(phonePattern.test("+99290")).toBe(false);
    const result = createStudentFormSchema((key: string) => key, true).safeParse({ ...baseValues, phone: "992901234567" });
    expect(result.success).toBe(false);
  });
});
