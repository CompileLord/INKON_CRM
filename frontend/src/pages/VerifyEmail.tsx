import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/Button";
import { resendCode, verifyCode } from "../lib/auth/endpoints";
import { AuthApiError } from "../lib/auth/errors";
import { describeAuthError } from "../lib/auth/errorMessages";
import { resolveLandingPath } from "../lib/postAuthRedirect";
import { useAuthStore } from "../store/authStore";
import { LanguageSwitcher } from "../components/ui/LanguageSwitcher";

const verifyEmailSchema = z.object({
  email: z.string().trim().min(1, "Required").email("Invalid email"),
  code: z.string().trim().length(6, "Invalid code"),
});

type VerifyEmailValues = z.infer<typeof verifyEmailSchema>;

const RESEND_COOLDOWN_SECONDS = 60;

const inputClass =
  "w-full rounded-lg border border-border-warm bg-card px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-maroon/20";

const labelClass = "text-sm font-medium text-ink";

export function VerifyEmail() {
  const navigate = useNavigate();
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const { t } = useTranslation("auth");

  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const {
    register,
    handleSubmit,
    getValues,
    resetField,
    formState: { errors },
  } = useForm<VerifyEmailValues>({
    resolver: zodResolver(verifyEmailSchema),
    defaultValues: { email: "", code: "" },
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const timeout = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timeout);
  }, [cooldown]);

  const onSubmit = async (values: VerifyEmailValues) => {
    setFormError(undefined);
    setSubmitting(true);
    try {
      const email = values.email.trim();
      const tokens = await verifyCode(email, values.code.trim());
      setAuthenticated(tokens.access_token, tokens.refresh_token, tokens.must_set_password);

      if (tokens.must_set_password) {
        navigate("/set-password", { replace: true });
        return;
      }

      const landingPath = await resolveLandingPath();
      navigate(landingPath, { replace: true });
    } catch (err) {
      resetField("code");
      if (err instanceof AuthApiError && err.status === 422) {
        setFormError(err.fieldErrors.code ?? err.fieldErrors.email ?? err.message);
      } else {
        setFormError(describeAuthError(err, t("invalidCode", "Неверный код")));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    const email = getValues("email").trim();
    if (!email) {
      setFormError(t("enterEmailFirst", "Введите email, чтобы отправить код повторно"));
      return;
    }

    setFormError(undefined);
    setResending(true);
    try {
      await resendCode(email);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setFormError(describeAuthError(err, t("resendError", "Не удалось отправить код")));
    } finally {
      setResending(false);
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
          <h2 className="mb-2 text-xl font-semibold text-ink">{t("verifyEmailTitle", "Подтверждение email")}</h2>
          <p className="mb-6 text-sm text-muted">
            {t("verifyEmailSubtitle", "Введите email и код из письма, чтобы активировать аккаунт")}
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
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="example@domain.com"
                className={`mt-1.5 ${inputClass}`}
                aria-invalid={errors.email ? "true" : undefined}
                {...register("email")}
              />
              {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
            </div>

            <div>
              <label htmlFor="code" className={labelClass}>
                {t("verificationCode", "Код из письма")}
              </label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={6}
                className={`mt-1.5 ${inputClass}`}
                aria-invalid={errors.code ? "true" : undefined}
                {...register("code")}
              />
              {errors.code && <p className="mt-1 text-xs text-red-600">{errors.code.message}</p>}
            </div>

            <Button type="submit" variant="primary" loading={submitting} className="mt-2 w-full">
              {submitting ? t("verifying", "Проверка...") : t("confirm", "Подтвердить")}
            </Button>

            <Button
              type="button"
              variant="secondary"
              loading={resending}
              disabled={cooldown > 0}
              onClick={handleResend}
              className="w-full"
            >
              {cooldown > 0
                ? `${t("resendCode", "Отправить код повторно")} (${cooldown}s)`
                : t("resendCode", "Отправить код повторно")}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted">
            <Link to="/login" className="font-medium text-maroon hover:text-maroon-dark">
              {t("backToLogin", "Назад ко входу")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
