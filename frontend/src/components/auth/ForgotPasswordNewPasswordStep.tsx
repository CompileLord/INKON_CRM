import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { createSetPasswordFormSchema, type SetPasswordFormValues } from "../../lib/authSchema";
import { passwordResetConfirm } from "../../lib/auth/endpoints";
import { AuthApiError } from "../../lib/auth/errors";
import { PasswordPolicyViolation } from "../../lib/auth/passwordPolicy";
import { resolveLandingPath } from "../../lib/postAuthRedirect";
import { useAuthStore } from "../../store/authStore";
import { authErrorText } from "./authErrorText";
import type { TokenPair } from "../../lib/auth/types";

interface ForgotPasswordNewPasswordStepProps {
  resetToken: string;
}

export function ForgotPasswordNewPasswordStep({ resetToken }: ForgotPasswordNewPasswordStepProps) {
  const { t } = useTranslation(["auth", "validation"]);
  const navigate = useNavigate();
  const setAuthenticated = useAuthStore((state) => state.setAuthenticated);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isSubmittingRef = useRef<boolean>(false);
  const schema = useMemo(() => createSetPasswordFormSchema(t), [t]);
  const { register, handleSubmit, formState: { errors } } = useForm<SetPasswordFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const onSubmit = async (values: SetPasswordFormValues): Promise<void> => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    setFormError(null);
    try {
      const result: TokenPair = await passwordResetConfirm(resetToken, values.newPassword);
      setAuthenticated(result.access_token, result.refresh_token, result.must_set_password);
      if (result.must_set_password) {
        navigate("/set-password", { replace: true });
        return;
      }
      navigate(await resolveLandingPath(), { replace: true });
    } catch (error) {
      const expired: boolean = error instanceof AuthApiError && error.status === 400;
      if (PasswordPolicyViolation.matches(error)) setFormError(t("auth:passwordPolicyError"));
      else setFormError(expired ? t("auth:forgot.codeInvalid") : authErrorText(error, t));
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-ink">{t("auth:forgot.newPasswordTitle")}</h2>
      <p className="text-sm text-muted">{t("auth:passwordRequirements")}</p>
      {formError && (
        <div role="alert" className="rounded-[10px] border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive break-words">
          {formError}
        </div>
      )}
      <Input
        id="forgot-new-password"
        label={t("auth:newPassword")}
        type="password"
        autoComplete="new-password"
        placeholder={t("auth:passwordPlaceholder")}
        error={errors.newPassword?.message}
        disabled={submitting}
        required
        {...register("newPassword")}
      />
      <Input
        id="forgot-confirm-password"
        label={t("auth:confirmPassword")}
        type="password"
        autoComplete="new-password"
        placeholder={t("auth:passwordPlaceholder")}
        error={errors.confirmPassword?.message}
        disabled={submitting}
        required
        {...register("confirmPassword")}
      />
      <Button type="submit" variant="primary" loading={submitting} disabled={submitting} className="mt-2 w-full">
        {t("auth:forgot.newPasswordSave")}
      </Button>
    </form>
  );
}
