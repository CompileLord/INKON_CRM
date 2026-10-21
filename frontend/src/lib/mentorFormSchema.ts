import { z } from "zod";
import { CanonicalPhone } from "./users/CanonicalPhone";

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
      .refine((value) => !value || CanonicalPhone.valid(value), t("validation.invalidPhone")),
    birthDate: z.string(),
  });
}

export const mentorFormSchema = createMentorFormSchema();
export type MentorFormValues = z.infer<typeof mentorFormSchema>;
