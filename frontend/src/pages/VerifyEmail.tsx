import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { AuthFrame } from "../layouts/AuthFrame";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import {
  createVerifyEmailFormSchema,
  type VerifyEmailFormValues,
} from "../lib/authSchema";
import { resendCode, verifyCode } from "../lib/auth/endpoints";
import {
  mapResendCodeError,
  mapVerifyCodeError,
  type MappedFieldError,
} from "../lib/auth/errorMessages";
import { resolveLandingPath } from "../lib/postAuthRedirect";
import { useAuthStore } from "../store/authStore";

export function VerifyEmail() {
  const navigate = useNavigate();
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const { t, i18n } = useTranslation(["auth", "validation", "common"]);

  const [formErrorKey, setFormErrorKey] = useState<string | null>(null);
  const [serverFieldErrors, setServerFieldErrors] = useState<MappedFieldError<"email" | "code">[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [cooldownEmail, setCooldownEmail] = useState("");
  const [resendStatusMessage, setResendStatusMessage] = useState<string | null>(null);
  const [resendEmailErrorKey, setResendEmailErrorKey] = useState<string | null>(null);
  const [resendSuccessEmail, setResendSuccessEmail] = useState<string | null>(null);

  const isSubmittingRef = useRef(false);
  const isResendingRef = useRef(false);

  const formSchema = useMemo(() => createVerifyEmailFormSchema(t), [t]);

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    trigger,
    getValues,
    watch,
    formState: { errors, isSubmitted },
  } = useForm<VerifyEmailFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", code: "" },
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
      } else if (resendEmailErrorKey) {
        setError("email", { type: "manual", message: t(resendEmailErrorKey) });
      } else if (isSubmitted) {
        trigger();
      }
      if (resendStatusMessage) {
        setResendStatusMessage(t("auth:resendSuccess"));
      }
    }
  }, [currentLanguage, isSubmitted, trigger, previousLanguage, serverFieldErrors, resendEmailErrorKey, setError, t, resendStatusMessage]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = window.setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [cooldown]);

  const watchedEmail = watch("email");
  const isCooldownActive =
    cooldown > 0 &&
    Boolean(cooldownEmail) &&
    watchedEmail?.trim().toLowerCase() === cooldownEmail.trim().toLowerCase();
  const isSuccessActive =
    Boolean(resendSuccessEmail) &&
    Boolean(resendStatusMessage) &&
    watchedEmail?.trim().toLowerCase() === resendSuccessEmail;

  const isPending = verifying || resending;

  const onSubmit = async (values: VerifyEmailFormValues) => {
    if (isSubmittingRef.current || isResendingRef.current) return;
    isSubmittingRef.current = true;
    setFormErrorKey(null);
    setServerFieldErrors([]);
    setResendEmailErrorKey(null);
    setResendStatusMessage(null);
    setResendSuccessEmail(null);
    setVerifying(true);
    try {
      const email = values.email.trim();
      const code = values.code.trim();
      const tokens = await verifyCode(email, code);
      setAuthenticated(tokens.access_token, tokens.refresh_token ?? null, tokens.must_set_password);

      if (tokens.must_set_password) {
        navigate("/set-password", { replace: true });
        return;
      }

      const landingPath = await resolveLandingPath();
      navigate(landingPath, { replace: true });
    } catch (err) {
      const { fieldErrors, formErrorKey: mappedFormError } = mapVerifyCodeError(err);
      if (fieldErrors.length > 0) {
        setServerFieldErrors(fieldErrors);
        for (const item of fieldErrors) {
          setError(item.field, { type: "server", message: t(item.messageKey) });
        }
      }
      if (mappedFormError) {
        setFormErrorKey(mappedFormError);
      }
    } finally {
      isSubmittingRef.current = false;
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (isSubmittingRef.current || isResendingRef.current) return;
    setResendEmailErrorKey(null);
    clearErrors("email");
    setServerFieldErrors((prev) => prev.filter((item) => item.field !== "email"));
    setFormErrorKey(null);
    setResendStatusMessage(null);

    const emailToResend = getValues("email").trim();
    if (!emailToResend) {
      setResendEmailErrorKey("validation:required");
      setError("email", { type: "manual", message: t("validation:required") });
      return;
    }
    const emailValidation = z.string().email().safeParse(emailToResend);
    if (!emailValidation.success) {
      setResendEmailErrorKey("validation:invalidEmail");
      setError("email", { type: "manual", message: t("validation:invalidEmail") });
      return;
    }

    isResendingRef.current = true;
    setResendSuccessEmail(null);
    setResending(true);
    try {
      await resendCode(emailToResend);
      setCooldown(60);
      setCooldownEmail(emailToResend);
      setResendSuccessEmail(emailToResend.toLowerCase());
      setResendStatusMessage(t("auth:resendSuccess"));
    } catch (err) {
      const { fieldErrors, formErrorKey: mappedFormError } = mapResendCodeError(err);
      if (fieldErrors.length > 0) {
        setServerFieldErrors(fieldErrors);
        for (const item of fieldErrors) {
          setError(item.field, { type: "server", message: t(item.messageKey) });
        }
      }
      if (mappedFormError) {
        setFormErrorKey(mappedFormError);
      }
    } finally {
      isResendingRef.current = false;
      setResending(false);
    }
  };

  const formErrorMessage = formErrorKey ? t(`auth:${formErrorKey}`) : null;

  return (
    <AuthFrame
      composition="animated-loop"
      editorialTitle={t("auth:verifyGettingStartedTitle")}
      editorialDescription={t("auth:verifyGettingStartedSubtitle")}
    >
      <div className="w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold leading-8 text-ink lg:text-[28px] lg:leading-9">
            {t("auth:verifyEmailTitle")}
          </h1>
          <p className="mt-2 text-base leading-6 text-muted">
            {t("auth:verifyEmailSubtitle")}
          </p>
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
            disabled={isPending}
            required
            {...register("email", {
              onChange: () => {
                if (resendEmailErrorKey) {
                  setResendEmailErrorKey(null);
                  clearErrors("email");
                }
                if (serverFieldErrors.some((e) => e.field === "email")) {
                  setServerFieldErrors((prev) => prev.filter((e) => e.field !== "email"));
                  clearErrors("email");
                }
              },
            })}
          />

          <Input
            id="code"
            label={t("auth:verificationCode")}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={6}
            placeholder={t("auth:codePlaceholder")}
            error={errors.code?.message}
            disabled={isPending}
            required
            {...register("code")}
          />

          <Button
            type="submit"
            variant="primary"
            loading={verifying}
            disabled={isPending}
            className="mt-2 w-full"
          >
            {verifying ? t("auth:verifying") : t("auth:confirm")}
          </Button>

          <Button
            type="button"
            variant="secondary"
            loading={resending}
            disabled={isPending || isCooldownActive}
            onClick={handleResend}
            className="w-full tabular-nums"
          >
            {isCooldownActive
              ? t("auth:resendCooldown", { seconds: cooldown })
              : t("auth:resendCode")}
          </Button>

          <div className="min-h-[24px] text-center">
            {isSuccessActive && (
              <p
                role="status"
                className="text-sm font-medium text-success break-words"
              >
                {t("auth:resendSuccess")}
              </p>
            )}
          </div>
        </form>

        <div className="mt-6 flex flex-col items-center justify-center gap-1 text-center text-sm text-muted">
          <Link
            to="/login"
            className="inline-flex min-h-[44px] items-center justify-center rounded-md px-2 py-1 font-medium text-maroon hover:text-maroon-dark underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
          >
            {t("auth:backToLogin")}
          </Link>
        </div>
      </div>
    </AuthFrame>
  );
}
