import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { createForgotRequestSchema, type ForgotRequestValues } from "../../lib/authSchema";
import { passwordResetRequest } from "../../lib/auth/endpoints";
import { authErrorText } from "./authErrorText";
import type { PasswordResetSmsChannel } from "../../lib/auth/types";

export type ForgotPasswordRequestMode = "default" | "fallback";

interface ForgotPasswordRequestStepProps {
  mode: ForgotPasswordRequestMode;
  initialLogin: string;
  onChangeMode: (mode: ForgotPasswordRequestMode) => void;
  onSent: (mode: ForgotPasswordRequestMode, login: string) => void;
}

const CHANNELS: PasswordResetSmsChannel[] = ["student_phone", "parent_phone"];

export function ForgotPasswordRequestStep({ mode, initialLogin, onChangeMode, onSent }: ForgotPasswordRequestStepProps) {
  const { t } = useTranslation(["auth", "validation"]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isSubmittingRef = useRef<boolean>(false);
  const schema = useMemo(() => createForgotRequestSchema(t), [t]);
  const { register, handleSubmit, formState: { errors } } = useForm<ForgotRequestValues>({
    resolver: zodResolver(schema),
    defaultValues: { login: initialLogin, channel: "student_phone" },
  });

  const onSubmit = async (values: ForgotRequestValues): Promise<void> => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    setFormError(null);
    try {
      await passwordResetRequest(values.login.trim(), mode === "fallback" ? values.channel : undefined);
      onSent(mode, values.login.trim());
    } catch (error) {
      setFormError(authErrorText(error, t));
    } finally {
      isSubmittingRef.current = false;
      setSubmitting(false);
    }
  };

  const switchMode = (next: ForgotPasswordRequestMode): void => {
    setFormError(null);
    onChangeMode(next);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {formError && (
        <div role="alert" className="rounded-[10px] border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive break-words">
          {formError}
        </div>
      )}
      {mode === "fallback" && (
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-ink">{t("auth:forgot.fallbackTitle")}</h2>
          <p className="text-sm text-muted">{t("auth:forgot.fallbackHint")}</p>
        </div>
      )}
      <Input
        id="forgot-login"
        label={t("auth:phoneOrEmail")}
        type="text"
        autoComplete="username"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        placeholder={t("auth:phoneOrEmailPlaceholder")}
        error={errors.login?.message}
        disabled={submitting}
        required
        {...register("login")}
      />
      {mode === "fallback" && (
        <fieldset className="flex flex-col gap-2" disabled={submitting}>
          {CHANNELS.map((channel: PasswordResetSmsChannel) => (
            <label key={channel} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] border border-border bg-card px-3 text-sm text-ink">
              <input type="radio" value={channel} className="h-4 w-4 accent-maroon" {...register("channel")} />
              {channel === "student_phone" ? t("auth:forgot.myPhone") : t("auth:forgot.parentPhone")}
            </label>
          ))}
        </fieldset>
      )}
      <Button type="submit" variant="primary" loading={submitting} disabled={submitting} className="mt-2 w-full">
        {mode === "fallback" ? t("auth:forgot.fallbackSubmit") : t("auth:forgot.send")}
      </Button>
      <button
        type="button"
        onClick={() => switchMode(mode === "fallback" ? "default" : "fallback")}
        disabled={submitting}
        className="min-h-11 self-start text-sm font-medium text-maroon-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out disabled:opacity-60"
      >
        {mode === "fallback" ? t("auth:forgot.backToDefault") : t("auth:forgot.noAccess")}
      </button>
    </form>
  );
}
