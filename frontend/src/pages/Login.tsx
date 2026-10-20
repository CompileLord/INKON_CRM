import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AuthFrame } from "../layouts/AuthFrame";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { createLoginFormSchema, type LoginFormValues } from "../lib/authSchema";
import { login } from "../lib/auth/endpoints";
import { AuthApiError } from "../lib/auth/errors";
import {
  getAuthErrorKind,
  mapValidationError,
  type AuthErrorKind,
  type MappedFieldError,
} from "../lib/auth/errorMessages";
import { getSafeRedirect, resolveLandingPath } from "../lib/postAuthRedirect";
import { useAuthStore } from "../store/authStore";

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const { t, i18n } = useTranslation(["auth", "validation", "common"]);

  const [showPassword, setShowPassword] = useState(false);
  const [formErrorKey, setFormErrorKey] = useState<AuthErrorKind | null>(null);
  const [serverFieldErrors, setServerFieldErrors] = useState<MappedFieldError[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  const formSchema = useMemo(() => createLoginFormSchema(t), [t]);

  const {
    register,
    handleSubmit,
    setError,
    trigger,
    formState: { errors, isSubmitted },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
  });

  const currentLanguage = i18n.language;
  const previousLanguage = useMemo(() => ({ current: currentLanguage }), []);

  useEffect(() => {
    if (previousLanguage.current !== currentLanguage) {
      previousLanguage.current = currentLanguage;
      if (serverFieldErrors.length > 0) {
        for (const item of serverFieldErrors) {
          setError(item.field, { type: "server", message: t(item.messageKey) });
        }
      } else if (isSubmitted) {
        trigger();
      }
    }
  }, [currentLanguage, isSubmitted, trigger, previousLanguage, serverFieldErrors, setError, t]);

  const onSubmit = async (values: LoginFormValues) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setFormErrorKey(null);
    setServerFieldErrors([]);
    setSubmitting(true);
    try {
      const result = await login(values.email.trim(), values.password);
      setAuthenticated(result.access_token, result.refresh_token, result.must_set_password);

      if (result.must_set_password) {
        navigate("/set-password", { replace: true });
        return;
      }

      const redirectParam = searchParams.get("redirect");
      const landing = await resolveLandingPath();
      const target = getSafeRedirect(redirectParam, landing);
      navigate(target, { replace: true });
    } catch (err) {
      if (err instanceof AuthApiError && err.status === 422) {
        const { fieldErrors, formErrorKey: mappedFormError } = mapValidationError(err.detail);
        if (fieldErrors.length > 0) {
          setServerFieldErrors(fieldErrors);
          for (const item of fieldErrors) {
            setError(item.field, { type: "server", message: t(item.messageKey) });
          }
        }
        if (mappedFormError) {
          setFormErrorKey(mappedFormError);
        }
      } else {
        const errorKind = getAuthErrorKind(err);
        setFormErrorKey(errorKind);
      }
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  };

  const formErrorMessage = formErrorKey ? t(`auth:${formErrorKey}`) : null;

  return (
    <AuthFrame
      composition="animated-loop"
      editorialTitle={t("auth:editorialTitle")}
      editorialDescription={t("auth:editorialSubtitle")}
    >
      <div className="w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold leading-8 text-ink lg:text-[28px] lg:leading-9">
            {t("auth:loginTitle")}
          </h1>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          {formErrorMessage && (
            <div
              role="alert"
              className="rounded-[10px] border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive break-words"
            >
              {formErrorMessage}
            </div>
          )}

          <Input
            id="email"
            label={t("auth:email")}
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t("auth:emailPlaceholder")}
            error={errors.email?.message}
            disabled={submitting}
            required
            {...register("email")}
          />

          <Input
            id="password"
            label={t("auth:password")}
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder={t("auth:passwordPlaceholder")}
            error={errors.password?.message}
            disabled={submitting}
            required
            rightAddon={
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? t("auth:hidePassword") : t("auth:showPassword")}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
                disabled={submitting}
              >
                {showPassword ? (
                  <EyeOff size={20} aria-hidden="true" />
                ) : (
                  <Eye size={20} aria-hidden="true" />
                )}
              </button>
            }
            {...register("password")}
          />

          <p className="text-sm leading-5 text-muted">{t("auth:newUserPasswordHint")}</p>

          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            disabled={submitting}
            className="mt-2 w-full"
          >
            {t("auth:signIn")}
          </Button>
        </form>
      </div>
    </AuthFrame>
  );
}
