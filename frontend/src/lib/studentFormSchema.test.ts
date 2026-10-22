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

describe("student form contact phone rule", () => {
  it("rejects a student with neither phone when a contact phone is required", () => {
    const result = createStudentFormSchema((key: string) => key, true).safeParse(baseValues);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0].path).toEqual(["phone"]);
      expect(result.error.issues[0].message).toBe("validation.phoneOrParentPhoneRequired");
    }
  });

  it("accepts only a student phone", () => {
    expect(createStudentFormSchema((key: string) => key, true).safeParse({ ...baseValues, phone: "+992901234567" }).success).toBe(true);
  });

  it("accepts only a parent phone", () => {
    expect(createStudentFormSchema((key: string) => key, true).safeParse({ ...baseValues, parentPhone: "+992901234568" }).success).toBe(true);
  });

  it("does not require a phone when the rule is off", () => {
    expect(createStudentFormSchema((key: string) => key, false).safeParse(baseValues).success).toBe(true);
  });

  it("requires E.164 with a leading plus", () => {
    expect(phonePattern.test("+992901234567")).toBe(true);
    expect(phonePattern.test("992901234567")).toBe(false);
    expect(phonePattern.test("+99290")).toBe(false);
    const result = createStudentFormSchema((key: string) => key, true).safeParse({ ...baseValues, phone: "992901234567" });
    expect(result.success).toBe(false);
  });
});
