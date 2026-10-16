import { useState, type ReactNode } from "react";
import { Send, TriangleAlert, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Toggle } from "../ui/Toggle";
import { SettingsGroup, SettingsRow } from "./SettingsRow";
import { SettingsSectionError, SettingsSectionSkeleton } from "./SettingsSectionState";
import { useOrgSettings, useUpdateOrgSettings } from "../../lib/settings/hooks";
import type { OrgSettingsUpdate } from "../../lib/settings/types";

type RuleKey = "notify_payments" | "notify_debts";

interface NotificationRulesSectionProps {
  onSaved: () => void;
  onFailed: () => void;
}

export function NotificationRulesSection({ onSaved, onFailed }: NotificationRulesSectionProps) {
  const { t } = useTranslation("settings");
  const { data: organization, isLoading, isError, refetch } = useOrgSettings();
  const updateOrganization = useUpdateOrgSettings();
  const [pending, setPending] = useState<Partial<Record<RuleKey, boolean>>>({});

  if (isLoading) return <SettingsSectionSkeleton rows={2} />;
  if (isError || !organization) return <SettingsSectionError onRetry={() => void refetch()} />;

  const change = (rule: RuleKey, value: boolean): void => {
    if (rule in pending) return;
    setPending((current) => ({ ...current, [rule]: value }));
    const payload: OrgSettingsUpdate = { [rule]: value };
    updateOrganization
      .mutateAsync(payload)
      .then(onSaved, onFailed)
      .finally(() => setPending((current) => {
        const remaining = { ...current };
        delete remaining[rule];
        return remaining;
      }));
  };

  const rules: { key: RuleKey; icon: ReactNode; name: string; description: string }[] = [
    { key: "notify_payments", icon: <Wallet size={18} />, name: t("rules.payments"), description: t("rules.paymentsHint") },
    { key: "notify_debts", icon: <TriangleAlert size={18} />, name: t("rules.debts"), description: t("rules.debtsHint") },
  ];

  return (
    <SettingsGroup>
      {rules.map((rule) => (
        <SettingsRow
          key={rule.key}
          icon={rule.icon}
          label={rule.name}
          description={rule.description}
        >
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-info-surface px-2.5 py-1 text-xs font-medium text-info">
              <Send size={12} aria-hidden="true" />
              {t("rules.telegram")}
            </span>
            <Toggle
              ariaLabel={rule.name}
              checked={pending[rule.key] ?? organization[rule.key]}
              onChange={(value) => change(rule.key, value)}
            />
          </div>
        </SettingsRow>
      ))}
    </SettingsGroup>
  );
}
