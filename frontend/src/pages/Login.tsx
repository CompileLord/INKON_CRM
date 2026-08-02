import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/Button";
import { loginFormSchema, type LoginFormValues } from "../lib/authSchema";
import { login } from "../lib/auth/endpoints";
import { AuthApiError } from "../lib/auth/errors";
import { describeAuthError } from "../lib/auth/errorMessages";
import { useAuthStore } from "../store/authStore";
import { LanguageSwitcher } from "../components/ui/LanguageSwitcher";

const inputClass =
  "w-full rounded-lg border border-border-warm bg-card px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-maroon/20";

const labelClass = "text-sm font-medium text-ink";

function getSafeRedirect(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setFormError(undefined);
    setSubmitting(true);
    try {
      const result = await login(values.email.trim(), values.password);
      setAuthenticated(result.access_token, result.refresh_token, result.must_set_password);

      if (result.must_set_password) {
        navigate("/set-password", { replace: true });
        return;
      }
      navigate(getSafeRedirect(searchParams.get("redirect")), { replace: true });
    } catch (err) {
      if (err instanceof AuthApiError && err.status === 422) {
        let hasFieldError = false;
        for (const [field, message] of Object.entries(err.fieldErrors)) {
          if (field === "email") {
            setError("email", { type: "server", message });
            hasFieldError = true;
          } else if (field === "password") {
            setError("password", { type: "server", message });
            hasFieldError = true;
          }
        }
        if (!hasFieldError) setFormError(err.message);
      } else {
        setFormError(describeAuthError(err, "Неверный email или пароль"));
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
          <h2 className="mb-6 text-xl font-semibold text-ink">{t("loginTitle")}</h2>

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
              <label htmlFor="password" className={labelClass}>
                {t("password")}
              </label>
              <div className="relative mt-1.5">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={`${inputClass} pr-10`}
                  aria-invalid={errors.password ? "true" : undefined}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted active:scale-95 transition-[color,transform] duration-150 ease-out hover:text-ink"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
              )}
            </div>

            <Button type="submit" variant="primary" loading={submitting} className="mt-2 w-full">
              {submitting ? t("signingIn") : t("signIn")}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted">
            Впервые в системе?{" "}
            <Link to="/verify-email" className="font-medium text-maroon hover:text-maroon-dark">
              Ввести код из письма
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
