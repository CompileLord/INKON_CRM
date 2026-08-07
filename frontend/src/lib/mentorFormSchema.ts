import { z } from "zod";

const phonePattern = /^\+?[1-9]\d{1,14}$/;

export const mentorFormSchema = z.object({
  firstName: z.string().trim().min(1, "Введите имя").max(100, "Максимум 100 символов"),
  lastName: z.string().trim().min(1, "Введите фамилию").max(100, "Максимум 100 символов"),
  email: z.string().trim().min(1, "Обязательное поле").email("Некорректный email"),
  phone: z
    .string()
    .trim()
    .refine((v) => !v || phonePattern.test(v), "Формат: +992901234567 (без пробелов и дефисов)"),
  birthDate: z.string(),
  parentTelegramChatId: z
    .string()
    .trim()
    .refine((v) => !v || /^-?\d+$/.test(v), "Должно быть числом"),
  parentPhone: z.string(),
  paymentDay: z
    .string()
    .refine(
      (v) => !v || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 28),
      "Число от 1 до 28",
    ),
});

export type MentorFormValues = z.infer<typeof mentorFormSchema>;
