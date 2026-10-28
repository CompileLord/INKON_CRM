import { useId, useRef, useState } from "react";
import { Building2, Coins, MapPin, Pencil, Phone, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { InfoTooltip } from "../ui/InfoTooltip";
import { Input } from "../ui/Input";
import { PhoneInput } from "../ui/PhoneInput";
import { SettingsGroup, SettingsRow } from "./SettingsRow";
import { SettingsSaveBar } from "./SettingsSaveBar";
import { SettingsSectionError, SettingsSectionSkeleton } from "./SettingsSectionState";
import { CanonicalPhone } from "../../lib/users/CanonicalPhone";
import type { OrgSettingsUpdate } from "../../lib/settings/types";
import { useOrgSettings, useTestTelegramBot, useUpdateOrgSettings } from "../../lib/settings/hooks";

const ORGANIZATION_NAME_MAXIMUM_LENGTH: number = 255;
const ORGANIZATION_ADDRESS_MAXIMUM_LENGTH: number = 255;

interface OrganizationSectionProps {
  onSaved: () => void;
}

export function OrganizationSection({ onSaved }: OrganizationSectionProps) {
  const { t } = useTranslation("settings");
  const identifier: string = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const { data: organization, isLoading, isError, refetch } = useOrgSettings();
  const updateOrganization = useUpdateOrgSettings();
  const telegramCheck = useTestTelegramBot();
  const [draftName, setDraftName] = useState<string | null>(null);
  const [draftAddress, setDraftAddress] = useState<string | null>(null);
  const [draftPhone, setDraftPhone] = useState<string | null>(null);
  const [editing, setEditing] = useState<boolean>(false);

  if (isLoading) return <SettingsSectionSkeleton rows={3} />;
  if (isError || !organization) return <SettingsSectionError onRetry={() => void refetch()} />;

  const savedAddress: string = organization.address ?? "";
  const savedPhone: string = CanonicalPhone.prefill(organization.phone);
  const currentName: string = draftName ?? organization.org_name;
  const currentAddress: string = draftAddress ?? savedAddress;
  const currentPhone: string = draftPhone ?? savedPhone;
  const nameChanged: boolean = draftName !== null && draftName !== organization.org_name;
  const addressChanged: boolean = currentAddress.trim() !== savedAddress;
  const phoneChanged: boolean = currentPhone.trim() !== savedPhone;
  const dirty: boolean = nameChanged || addressChanged || phoneChanged;
  const nameError: string | undefined = nameChanged && currentName.trim() === "" ? t("organization.nameRequired") : undefined;
  const phoneError: string | undefined = currentPhone.trim() !== "" && !CanonicalPhone.valid(currentPhone.trim()) ? t("organization.phoneInvalid") : undefined;

  const startEditing = (): void => {
    setEditing(true);
    queueMicrotask(() => nameInput.current?.focus());
  };

  const discard = (): void => {
    updateOrganization.reset();
    setDraftName(null);
    setDraftAddress(null);
    setDraftPhone(null);
    setEditing(false);
  };

  const save = (): void => {
    if (nameError || phoneError || !dirty) return;
    const payload: OrgSettingsUpdate = {};
    if (nameChanged) payload.org_name = currentName.trim();
    if (addressChanged) payload.address = currentAddress.trim() === "" ? null : currentAddress.trim();
    if (phoneChanged) payload.phone = currentPhone.trim() === "" ? null : currentPhone.trim();
    updateOrganization.mutate(payload, {
      onSuccess: () => {
        setDraftName(null);
        setDraftAddress(null);
        setDraftPhone(null);
        setEditing(false);
        onSaved();
      },
    });
  };

  const checkResult = telegramCheck.data;
  const botState: "unchecked" | "reachable" | "unreachable" = telegramCheck.isError || checkResult?.reachable === false ? "unreachable" : checkResult?.reachable ? "reachable" : "unchecked";
  const dotClass: string = botState === "reachable" ? "bg-success" : botState === "unreachable" ? "bg-destructive" : "bg-dot-gray";

  return (
    <div>
      <SettingsGroup>
        <SettingsRow icon={<Building2 size={18} />} label={t("organization.name")} description={t("organization.nameHint")} controlId={`${identifier}-name`}>
          {editing ? (
            <Input
              ref={nameInput}
              id={`${identifier}-name`}
              value={currentName}
              maxLength={ORGANIZATION_NAME_MAXIMUM_LENGTH}
              error={nameError}
              onChange={(event) => setDraftName(event.target.value)}
            />
          ) : (
            <div className="flex items-center justify-between gap-2 @[34rem]:justify-end">
              <p className="min-w-0 break-words text-sm font-medium text-ink @[34rem]:text-right">{currentName}</p>
              <Button type="button" variant="secondary" aria-label={t("organization.editName")} title={t("organization.editName")} onClick={startEditing} className="shrink-0 px-3">
                <Pencil size={16} aria-hidden="true" />
              </Button>
            </div>
          )}
        </SettingsRow>
        <SettingsRow icon={<MapPin size={18} />} label={t("organization.address")} controlId={`${identifier}-address`}>
          <Input id={`${identifier}-address`} value={currentAddress} maxLength={ORGANIZATION_ADDRESS_MAXIMUM_LENGTH} autoComplete="street-address" onChange={(event) => setDraftAddress(event.target.value)} />
        </SettingsRow>
        <SettingsRow icon={<Phone size={18} />} label={t("organization.phone")} controlId={`${identifier}-phone`}>
          <PhoneInput id={`${identifier}-phone`} value={currentPhone} error={phoneError} onChange={(event) => setDraftPhone(event.target.value)} />
        </SettingsRow>
        <SettingsRow
          icon={<Coins size={18} />}
          label={t("organization.currency")}
          hint={<InfoTooltip label={t("organization.currency")}>{t("organization.currencyInfo")}</InfoTooltip>}
        >
          <p className="text-sm font-medium text-ink @[34rem]:text-right">{t("organization.currencyValue")}</p>
        </SettingsRow>
        <SettingsRow icon={<Send size={18} />} label={t("organization.telegram")} description={t("organization.telegramHint")}>
          <div className="flex items-center justify-between gap-3 @[34rem]:justify-end">
            <p role="status" className="flex min-w-0 items-center gap-2 text-sm text-ink" data-testid="telegram-status" data-state={botState}>
              <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
              <span className="min-w-0 break-words">
                {botState === "reachable"
                  ? checkResult?.bot_username ? `@${checkResult.bot_username}` : t("organization.botReachable")
                  : botState === "unreachable" ? t("organization.botUnreachable") : t("organization.botUnchecked")}
              </span>
            </p>
            <Button type="button" variant="secondary" loading={telegramCheck.isPending} onClick={() => telegramCheck.mutate()}>
              {t("organization.test")}
            </Button>
          </div>
        </SettingsRow>
      </SettingsGroup>
      <SettingsSaveBar
        visible={dirty}
        saving={updateOrganization.isPending}
        errorText={updateOrganization.isError ? t("saveBar.failed") : null}
        onDiscard={discard}
        onSave={save}
      />
    </div>
  );
}
