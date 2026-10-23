import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { useLogout } from "../lib/useLogout";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AuthFrame } from "../layouts/AuthFrame";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import {
  createSetPasswordFormSchema,
  type SetPasswordFormValues,
} from "../lib/authSchema";
import { setPassword } from "../lib/auth/endpoints";
import {
  mapSetPasswordError,
  type MappedFieldError,
} from "../lib/auth/errorMessages";
import { resolveLandingPath } from "../lib/postAuthRedirect";
import { useAuthStore } from "../store/authStore";

export function SetPassword() {
  const navigate = useNavigate();
  const signOut = useLogout();
  const [signingOut, setSigningOut] = useState(false);
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const { t, i18n } = useTranslation(["auth", "validation", "common"]);

  const [showPassword, setShowPassword] = useState(false);
  const [formErrorKey, setFormErrorKey] = useState<string | null>(null);
  const [serverFieldErrors, setServerFieldErrors] = useState<
    MappedFieldError<"newPassword" | "confirmPassword">[]
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  const formSchema = useMemo(() => createSetPasswordFormSchema(t), [t]);

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    trigger,
    formState: { errors, isSubmitted },
  } = useForm<SetPasswordFormValues>({
    resolver: async (values, context, options) =>
      zodResolver(formSchema)(values, context, options),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const currentLanguage = i18n.language;
  const previousLanguage = useRef(currentLanguage);

  useEffect(() => {
    if (previousLanguage.current !== currentLanguage) {
      previousLanguage.current = currentLanguage;
      if (serverFieldErrors.length > 0) {
        for (const item of serverFieldErrors) {
          setError(item.field, { type: "server", message: t(item.messageKey, item.params) });
        }
      } else if (isSubmitted) {
        trigger();
      }
    }
  }, [currentLanguage, isSubmitted, trigger, serverFieldErrors, setError, t]);

  const onSubmit = async (values: SetPasswordFormValues) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setFormErrorKey(null);
    setServerFieldErrors([]);
    setSubmitting(true);
    try {
      const result = await setPassword(values.newPassword);
      setAuthenticated(
        result.access_token,
        result.refresh_token ?? null,
        result.must_set_password,
      );
      const landingPath = await resolveLandingPath();
      navigate(landingPath, { replace: true });
    } catch (err) {
      const { fieldErrors, formErrorKey: mappedFormError } = mapSetPasswordError(err);
      if (fieldErrors.length > 0) {
        setServerFieldErrors(fieldErrors);
        for (const item of fieldErrors) {
          setError(item.field, { type: "server", message: t(item.messageKey, item.params) });
        }
      }
      if (mappedFormError) {
        setFormErrorKey(mappedFormError);
      }
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  };

  const formErrorMessage = formErrorKey ? t(`auth:${formErrorKey}`) : null;

  return (
    <AuthFrame
      composition="static-emblem"
      editorialTitle={t("auth:editorialTitle")}
      editorialDescription={t("auth:editorialSubtitle")}
    >
      <div className="w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold leading-8 text-ink lg:text-[28px] lg:leading-9">
            {t("auth:setPasswordTitle")}
          </h1>
          <p className="mt-2 text-base leading-6 text-muted">
            {t("auth:setPasswordSubtitle")}
          </p>
          <p className="mt-1 text-sm text-muted">
            {t("auth:passwordRequirements")}
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
            id="newPassword"
            label={t("auth:newPassword")}
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="••••••••"
            error={errors.newPassword?.message}
            disabled={submitting}
            required
            {...register("newPassword", {
              onChange: () => {
                if (serverFieldErrors.some((e) => e.field === "newPassword")) {
                  setServerFieldErrors((prev) =>
                    prev.filter((e) => e.field !== "newPassword"),
                  );
                  clearErrors("newPassword");
                }
              },
            })}
          />

          <Input
            id="confirmPassword"
            label={t("auth:confirmPassword")}
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="••••••••"
            error={errors.confirmPassword?.message}
            disabled={submitting}
            required
            {...register("confirmPassword", {
              onChange: () => {
                if (serverFieldErrors.some((e) => e.field === "confirmPassword")) {
                  setServerFieldErrors((prev) =>
                    prev.filter((e) => e.field !== "confirmPassword"),
                  );
                  clearErrors("confirmPassword");
                }
              },
            })}
          />

          <button
            type="button"
            data-testid="toggle-both-passwords"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={
              showPassword
                ? t("auth:hideBothPasswords")
                : t("auth:showBothPasswords")
            }
            className="inline-flex min-h-[44px] items-center gap-2 self-start rounded-lg text-sm font-medium text-muted [@media(hover:hover)]:hover:text-ink motion-safe:active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 motion-safe:transition-all motion-safe:duration-150 motion-safe:ease-out"
            disabled={submitting}
          >
            {showPassword ? (
              <EyeOff size={18} aria-hidden="true" />
            ) : (
              <Eye size={18} aria-hidden="true" />
            )}
            <span>
              {showPassword
                ? t("auth:hideBothPasswords")
                : t("auth:showBothPasswords")}
            </span>
          </button>

          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            disabled={submitting}
            className="mt-2 w-full"
          >
            {submitting ? t("auth:saving") : t("auth:savePassword")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            loading={signingOut}
            disabled={submitting}
            onClick={() => {
              setSigningOut(true);
              void signOut();
            }}
            className="w-full"
          >
            {t("auth:signOut")}
          </Button>
        </form>
      </div>
    </AuthFrame>
  );
}
