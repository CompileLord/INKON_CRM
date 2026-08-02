import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/Button";
import { setPasswordFormSchema, type SetPasswordFormValues } from "../lib/authSchema";
import { setPassword } from "../lib/auth/endpoints";
import { AuthApiError } from "../lib/auth/errors";
import { describeAuthError } from "../lib/auth/errorMessages";
import { resolveLandingPath } from "../lib/postAuthRedirect";
import { useAuthStore } from "../store/authStore";
import { LanguageSwitcher } from "../components/ui/LanguageSwitcher";

const inputClass =
  "w-full rounded-lg border border-border-warm bg-card px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-maroon/20";

const labelClass = "text-sm font-medium text-ink";

export function SetPassword() {
  const navigate = useNavigate();
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const { t } = useTranslation("auth");

  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SetPasswordFormValues>({
    resolver: zodResolver(setPasswordFormSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const onSubmit = async (values: SetPasswordFormValues) => {
    setFormError(undefined);
    setSubmitting(true);
    try {
      const result = await setPassword(values.newPassword);
      setAuthenticated(result.access_token, result.refresh_token, result.must_set_password);
      const landingPath = await resolveLandingPath();
      navigate(landingPath, { replace: true });
    } catch (err) {
      if (err instanceof AuthApiError && err.status === 422) {
        let hasFieldError = false;
        for (const [field, message] of Object.entries(err.fieldErrors)) {
          if (field === "new_password" || field === "newPassword") {
            setError("newPassword", { type: "server", message });
            hasFieldError = true;
          }
        }
        if (!hasFieldError) setFormError(err.message);
      } else {
        setFormError(describeAuthError(err, t("setPasswordError", "Не удалось сохранить пароль")));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-cream px-4 py-10">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-[-0.5px] text-maroon">ИМКОН</h1>
          <span className="mt-1 block text-[11px] uppercase tracking-[2px] text-label">CRM</span>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <h2 className="mb-2 text-xl font-semibold text-ink">{t("newPassword")}</h2>
          <p className="mb-6 text-sm text-muted">
            {t("setPasswordSubtitle", "Придумайте новый пароль для входа в аккаунт")}
          </p>

          {formError && (
            <div
              role="alert"
              className="mb-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
            >
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <div>
              <label htmlFor="newPassword" className={labelClass}>
                {t("newPassword")}
              </label>
              <div className="relative mt-1.5">
                <input
                  id="newPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className={`${inputClass} pr-10`}
                  aria-invalid={errors.newPassword ? "true" : undefined}
                  {...register("newPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition-colors duration-150 hover:text-ink"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.newPassword && (
                <p className="mt-1 text-xs text-red-600">{errors.newPassword.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className={labelClass}>
                {t("confirmPassword", "Повторите пароль")}
              </label>
              <input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="••••••••"
                className={`mt-1.5 ${inputClass}`}
                aria-invalid={errors.confirmPassword ? "true" : undefined}
                {...register("confirmPassword")}
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>
              )}
            </div>

            <Button type="submit" variant="primary" loading={submitting} className="mt-2 w-full">
              {submitting ? t("saving", "Сохранение...") : t("savePassword", "Сохранить пароль")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
