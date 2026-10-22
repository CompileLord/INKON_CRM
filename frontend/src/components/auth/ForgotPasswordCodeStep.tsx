import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { createResetCodeSchema, type ResetCodeValues } from "../../lib/authSchema";
import { passwordResetVerify } from "../../lib/auth/endpoints";
import { AuthApiError } from "../../lib/auth/errors";
import { authErrorText } from "./authErrorText";

interface ForgotPasswordCodeStepProps {
  initialEmail: string;
  onVerified: (resetToken: string) => void;
}

export function ForgotPasswordCodeStep({ initialEmail, onVerified }: ForgotPasswordCodeStepProps) {
  const { t } = useTranslation(["auth", "validation"]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isSubmittingRef = useRef<boolean>(false);
  const schema = useMemo(() => createResetCodeSchema(t), [t]);
  const { register, handleSubmit, formState: { errors } } = useForm<ResetCodeValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: initialEmail, code: "" },
  });

  const onSubmit = async (values: ResetCodeValues): Promise<void> => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await passwordResetVerify(values.email.trim(), values.code.trim());
      onVerified(result.reset_token);
    } catch (error) {
      const invalid: boolean = error instanceof AuthApiError && (error.status === 400 || error.status === 404);
      setFormError(invalid ? t("auth:forgot.codeInvalid") : authErrorText(error, t));
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {formError && (
        <div role="alert" className="rounded-[10px] border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive break-words">
          {formError}
        </div>
      )}
      <Input
        id="forgot-email"
        label={t("auth:email")}
        type="email"
        autoComplete="email"
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
        id="forgot-code"
        label={t("auth:forgot.codeLabel")}
        type="text"
        autoComplete="one-time-code"
        inputMode="numeric"
        maxLength={6}
        className="tabular-nums tracking-widest"
        placeholder={t("auth:forgot.codePlaceholder")}
        error={errors.code?.message}
        disabled={submitting}
        required
        {...register("code")}
      />
      <Button type="submit" variant="primary" loading={submitting} disabled={submitting} className="mt-2 w-full">
        {t("auth:forgot.verify")}
      </Button>
    </form>
  );
}
