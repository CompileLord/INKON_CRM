import { z } from "zod";
import type { TFunction } from "i18next";

export const PYTHON_DIGIT_PATTERN = new RegExp(
  "[" +
  "\\u{0030}-\\u{0039}\\u{00B2}-\\u{00B3}\\u{00B9}\\u{0660}-\\u{0669}\\u{06F0}-\\u{06F9}\\u{07C0}-\\u{07C9}" +
  "\\u{0966}-\\u{096F}\\u{09E6}-\\u{09EF}\\u{0A66}-\\u{0A6F}\\u{0AE6}-\\u{0AEF}\\u{0B66}-\\u{0B6F}\\u{0BE6}-\\u{0BEF}" +
  "\\u{0C66}-\\u{0C6F}\\u{0CE6}-\\u{0CEF}\\u{0D66}-\\u{0D6F}\\u{0DE6}-\\u{0DEF}\\u{0E50}-\\u{0E59}\\u{0ED0}-\\u{0ED9}" +
  "\\u{0F20}-\\u{0F29}\\u{1040}-\\u{1049}\\u{1090}-\\u{1099}\\u{1369}-\\u{1371}\\u{17E0}-\\u{17E9}\\u{1810}-\\u{1819}" +
  "\\u{1946}-\\u{194F}\\u{19D0}-\\u{19DA}\\u{1A80}-\\u{1A89}\\u{1A90}-\\u{1A99}\\u{1B50}-\\u{1B59}\\u{1BB0}-\\u{1BB9}" +
  "\\u{1C40}-\\u{1C49}\\u{1C50}-\\u{1C59}\\u{2070}\\u{2074}-\\u{2079}\\u{2080}-\\u{2089}\\u{2460}-\\u{2468}\\u{2474}-\\u{247C}" +
  "\\u{2488}-\\u{2490}\\u{24EA}\\u{24F5}-\\u{24FD}\\u{24FF}\\u{2776}-\\u{277E}\\u{2780}-\\u{2788}\\u{278A}-\\u{2792}" +
  "\\u{A620}-\\u{A629}\\u{A8D0}-\\u{A8D9}\\u{A900}-\\u{A909}\\u{A9D0}-\\u{A9D9}\\u{A9F0}-\\u{A9F9}\\u{AA50}-\\u{AA59}" +
  "\\u{ABF0}-\\u{ABF9}\\u{FF10}-\\u{FF19}\\u{104A0}-\\u{104A9}\\u{10A40}-\\u{10A43}\\u{10D30}-\\u{10D39}\\u{10E60}-\\u{10E68}" +
  "\\u{11052}-\\u{1105A}\\u{11066}-\\u{1106F}\\u{110F0}-\\u{110F9}\\u{11136}-\\u{1113F}\\u{111D0}-\\u{111D9}\\u{112F0}-\\u{112F9}" +
  "\\u{11450}-\\u{11459}\\u{114D0}-\\u{114D9}\\u{11650}-\\u{11659}\\u{116C0}-\\u{116C9}\\u{11730}-\\u{11739}\\u{118E0}-\\u{118E9}" +
  "\\u{11950}-\\u{11959}\\u{11C50}-\\u{11C59}\\u{11D50}-\\u{11D59}\\u{11DA0}-\\u{11DA9}\\u{11F50}-\\u{11F59}\\u{16A60}-\\u{16A69}" +
  "\\u{16AC0}-\\u{16AC9}\\u{16B50}-\\u{16B59}\\u{1D7CE}-\\u{1D7FF}\\u{1E140}-\\u{1E149}\\u{1E2F0}-\\u{1E2F9}\\u{1E4F0}-\\u{1E4F9}" +
  "\\u{1E950}-\\u{1E959}\\u{1F100}-\\u{1F10A}\\u{1FBF0}-\\u{1FBF9}" +
  "]",
  "u"
);

export const countUnicodeCodepoints = (value: string): number => Array.from(value).length;

export const hasPythonDigit = (value: string): boolean => PYTHON_DIGIT_PATTERN.test(value);

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

export const createSetPasswordFormSchema = (
  t: TFunction | ((key: string, options?: Record<string, unknown>) => string),
) =>
  z
    .object({
      newPassword: z
        .string()
        .min(1, t("validation:required"))
        .refine((val) => countUnicodeCodepoints(val) >= 8, {
          message: t("validation:passwordMinLength", { min: 8 }),
        })
        .refine((val) => hasPythonDigit(val), {
          message: t("validation:passwordRequiresDigit"),
        }),
      confirmPassword: z.string().min(1, t("validation:required")),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: t("validation:passwordsDoNotMatch"),
      path: ["confirmPassword"],
    });

export const setPasswordFormSchema = createSetPasswordFormSchema((key: string) => key);

export type SetPasswordFormValues = z.infer<typeof setPasswordFormSchema>;
