import { z } from "zod";

const phonePattern = /^\+[1-9]\d{1,14}$/;

export function createMentorFormSchema(t: (key: string) => string = (k) => k) {
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
  });
}

export const mentorFormSchema = createMentorFormSchema();
export type MentorFormValues = z.infer<typeof mentorFormSchema>;
