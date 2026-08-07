import { z } from "zod";
import type { TFunction } from "i18next";

export const createLoginFormSchema = (t: TFunction) =>
  z.object({
    email: z.string().trim().min(1, t("validation:required")).email(t("validation:invalidEmail")),
    password: z.string().min(1, t("validation:required")),
  });

export const loginFormSchema = z.object({
  email: z.string().trim().min(1, "Введите email").email("Некорректный email"),
  password: z.string().min(1, "Введите пароль"),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;

export const createSetPasswordFormSchema = (t: TFunction) =>
  z
    .object({
      newPassword: z.string().min(8, t("validation:passwordMinLength", { min: 8 })),
      confirmPassword: z.string().min(1, t("validation:required")),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t("validation:passwordsDoNotMatch"),
      path: ["confirmPassword"],
    });

export const setPasswordFormSchema = z
  .object({
    newPassword: z.string().min(8, "Минимум 8 символов"),
    confirmPassword: z.string().min(1, "Повторите пароль"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Пароли не совпадают",
    path: ["confirmPassword"],
  });

export type SetPasswordFormValues = z.infer<typeof setPasswordFormSchema>;
