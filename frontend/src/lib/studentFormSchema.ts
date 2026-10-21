import { z } from "zod";

export const phonePattern = /^\+[1-9]\d{7,14}$/;

export function createStudentFormSchema(t: (key: string) => string = (k) => k, requireContactPhone: boolean = false) {
  return z.object({
    firstName: z
      .string()
      .trim()
      .min(1, t("validation.firstNameRequired"))
      .max(100, t("validation.nameTooLong")),
    lastName: z
      .string()
      .trim()
      .min(1, t("validation.lastNameRequired"))
      .max(100, t("validation.nameTooLong")),
    email: z
      .string()
      .trim()
      .min(1, t("validation.emailRequired"))
      .email(t("validation.invalidEmail")),
    phone: z
      .string()
      .trim()
      .refine((value) => !value || phonePattern.test(value), t("validation.invalidPhone")),
    birthDate: z.string(),
    parentTelegramChatId: z
      .string()
      .trim()
      .refine((value) => !value || /^-?\d+$/.test(value), t("validation.invalidTelegramChatId")),
    parentPhone: z
      .string()
      .trim()
      .refine((value) => !value || phonePattern.test(value), t("validation.invalidPhone")),
    paymentDay: z
      .string()
      .refine(
        (value) => !value || (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 28),
        t("validation.invalidPaymentDay"),
      ),
  }).superRefine((values, context) => {
    if (requireContactPhone && values.phone === "" && values.parentPhone === "") {
      context.addIssue({ code: "custom", path: ["phone"], message: t("validation.phoneOrParentPhoneRequired") });
    }
  });
}

export const studentFormSchema = createStudentFormSchema();
export type StudentFormValues = z.infer<typeof studentFormSchema>;
