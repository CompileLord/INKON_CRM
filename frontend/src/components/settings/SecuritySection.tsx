import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { InfoTooltip } from "../ui/InfoTooltip";
import { Input } from "../ui/Input";
import { SettingsGroup, SettingsRow } from "./SettingsRow";
import { changePassword } from "../../lib/auth/endpoints";
import { mapChangePasswordError, type ChangePasswordErrorMapping } from "../../lib/auth/errorMessages";
import { normalizeStudentCode } from "../../lib/auth/studentCode";
import { createChangePasswordFormSchema, type ChangePasswordFormValues } from "../../lib/authSchema";
import { useAuthStore } from "../../store/authStore";

interface SecuritySectionProps {
  onChanged: () => void;
}

const EMPTY_VALUES: ChangePasswordFormValues = { currentPassword: "", newPassword: "", confirmPassword: "" };

export function SecuritySection({ onChanged }: SecuritySectionProps) {
  const { t } = useTranslation(["settings", "auth", "validation"]);
  const setAuthenticated = useAuthStore((state) => state.setAuthenticated);
  const [formErrorKey, setFormErrorKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const schema = useMemo(() => createChangePasswordFormSchema(t), [t]);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordFormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  const submit = async (values: ChangePasswordFormValues): Promise<void> => {
    if (submitting) return;
    setSubmitting(true);
    setFormErrorKey(null);
    try {
      const tokens = await changePassword(normalizeStudentCode(values.currentPassword), values.newPassword);
      setAuthenticated(tokens.access_token, tokens.refresh_token, tokens.must_set_password);
      reset(EMPTY_VALUES);
      onChanged();
    } catch (error) {
      const mapping: ChangePasswordErrorMapping = mapChangePasswordError(error);
      if (mapping.field) setError(mapping.field, { type: "server", message: t(mapping.messageKey, mapping.params) });
      else setFormErrorKey(mapping.messageKey);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} noValidate>
      <SettingsGroup>
        {formErrorKey && (
          <div role="alert" className="py-3 text-sm text-destructive">{t(formErrorKey)}</div>
        )}
        <SettingsRow
          icon={<KeyRound size={18} />}
          label={t("settings:security.currentPassword")}
          description={t("settings:security.currentPasswordHint")}
          controlId="security-current-password"
        >
          <Input id="security-current-password" type="password" autoComplete="current-password" disabled={submitting} error={errors.currentPassword?.message} {...register("currentPassword")} />
        </SettingsRow>
        <SettingsRow
          icon={<KeyRound size={18} />}
          label={t("settings:security.newPassword")}
          hint={<InfoTooltip label={t("settings:security.rulesLabel")}>{t("auth:passwordRequirements")}</InfoTooltip>}
          controlId="security-new-password"
        >
          <Input id="security-new-password" type="password" autoComplete="new-password" disabled={submitting} error={errors.newPassword?.message} {...register("newPassword")} />
        </SettingsRow>
        <SettingsRow icon={<KeyRound size={18} />} label={t("settings:security.confirmPassword")} controlId="security-confirm-password">
          <Input id="security-confirm-password" type="password" autoComplete="new-password" disabled={submitting} error={errors.confirmPassword?.message} {...register("confirmPassword")} />
        </SettingsRow>
        <div className="flex justify-end py-4">
          <Button type="submit" variant="primary" loading={submitting} disabled={submitting} className="min-h-11 w-full sm:w-auto">
            {t("settings:security.submit")}
          </Button>
        </div>
      </SettingsGroup>
    </form>
  );
}
