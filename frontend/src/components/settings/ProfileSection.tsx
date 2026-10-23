import { useId, useState } from "react";
import { Camera, Mail, Phone, User as UserIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AvatarUploadField } from "../ui/AvatarUploadField";
import { Input } from "../ui/Input";
import { SettingsGroup, SettingsRow } from "./SettingsRow";
import { SettingsSaveBar } from "./SettingsSaveBar";
import { SettingsSectionError, SettingsSectionSkeleton } from "./SettingsSectionState";
import { useCurrentUser, useUpdateOwnProfile } from "../../lib/users/hooks";
import { resolveMediaUrl } from "../../lib/users/media";
import { CanonicalPhone } from "../../lib/users/CanonicalPhone";
import { ProfileSaveErrorMapper, type ProfileField, type ProfileSaveFailure } from "../../lib/users/profileSaveError";
import type { Role, UserSelfUpdate } from "../../lib/users/types";

interface ProfileDraft {
  firstName: string;
  lastName: string;
  phone: string;
}

interface ProfileSectionProps {
  role: Role | null;
  onSaved: () => void;
}

export function ProfileSection({ role, onSaved }: ProfileSectionProps) {
  const { t } = useTranslation("settings");
  const identifier: string = useId();
  const { data: user, isLoading, isError, refetch } = useCurrentUser();
  const updateProfile = useUpdateOwnProfile();
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [failure, setFailure] = useState<ProfileSaveFailure | null>(null);

  if (isLoading) return <SettingsSectionSkeleton rows={5} />;
  if (isError || !user) return <SettingsSectionError onRetry={() => void refetch()} />;

  const saved: ProfileDraft = { firstName: user.first_name, lastName: user.last_name, phone: CanonicalPhone.prefill(user.phone) };
  const current: ProfileDraft = draft ?? saved;
  const edit = (change: Partial<ProfileDraft>): void => {
    setDraft({ ...current, ...change });
    if (failure) {
      const remaining: Partial<Record<ProfileField, string>> = { ...failure.fieldKeys };
      for (const field of Object.keys(change) as ProfileField[]) delete remaining[field];
      setFailure({ fieldKeys: remaining, formKey: null });
    }
  };
  const serverError = (field: ProfileField): string | undefined => {
    const key: string | undefined = failure?.fieldKeys[field];
    return key ? t(key) : undefined;
  };

  const firstNameError: string | undefined = current.firstName.trim() === "" ? t("profile.nameRequired") : undefined;
  const lastNameError: string | undefined = current.lastName.trim() === "" ? t("profile.nameRequired") : undefined;
  const phoneError: string | undefined = current.phone !== "" && !CanonicalPhone.valid(current.phone, role === "student") ? t("profile.phoneInvalid") : undefined;
  const dirty: boolean = draft !== null && (draft.firstName !== saved.firstName || draft.lastName !== saved.lastName || draft.phone !== saved.phone);
  const invalid: boolean = Boolean(firstNameError || lastNameError || phoneError);

  const save = (): void => {
    if (invalid) return;
    const payload: UserSelfUpdate = {};
    if (current.firstName !== saved.firstName) payload.first_name = current.firstName.trim();
    if (current.lastName !== saved.lastName) payload.last_name = current.lastName.trim();
    if (current.phone !== saved.phone) payload.phone = current.phone === "" ? null : current.phone;
    setFailure(null);
    updateProfile.mutate(payload, {
      onSuccess: () => {
        setDraft(null);
        onSaved();
      },
      onError: (error: unknown) => setFailure(ProfileSaveErrorMapper.map(error)),
    });
  };

  const discard = (): void => {
    updateProfile.reset();
    setFailure(null);
    setDraft(null);
  };

  return (
    <div className="space-y-0 pb-28 lg:pb-0">
      <SettingsGroup>
        <SettingsRow icon={<Camera size={18} />} label={t("profile.photo")} description={t("profile.photoHint")}>
          <AvatarUploadField
            userId={user.id}
            role={role === "student" ? "student" : "mentor"}
            currentPhotoUrl={resolveMediaUrl(user.thumbnail_path ?? user.photo_path)}
            firstName={user.first_name}
            lastName={user.last_name}
            onUploaded={onSaved}
            hideLabel
          />
        </SettingsRow>
        <SettingsRow icon={<UserIcon size={18} />} label={t("profile.firstName")} controlId={`${identifier}-first`}>
          <Input id={`${identifier}-first`} value={current.firstName} maxLength={100} autoComplete="given-name" error={(dirty ? firstNameError : undefined) ?? serverError("firstName")} onChange={(event) => edit({ firstName: event.target.value })} />
        </SettingsRow>
        <SettingsRow icon={<UserIcon size={18} />} label={t("profile.lastName")} controlId={`${identifier}-last`}>
          <Input id={`${identifier}-last`} value={current.lastName} maxLength={100} autoComplete="family-name" error={(dirty ? lastNameError : undefined) ?? serverError("lastName")} onChange={(event) => edit({ lastName: event.target.value })} />
        </SettingsRow>
        <SettingsRow icon={<Mail size={18} />} label={t("profile.email")} description={t("profile.emailHint")} controlId={`${identifier}-email`}>
          <Input id={`${identifier}-email`} type="email" value={user.email ?? ""} disabled readOnly />
        </SettingsRow>
        <SettingsRow icon={<Phone size={18} />} label={t("profile.phone")} description={t(role === "student" ? "profile.phoneHintStudent" : "profile.phoneHint")} controlId={`${identifier}-phone`}>
          <Input id={`${identifier}-phone`} type="tel" inputMode="tel" value={current.phone} autoComplete="tel" error={(dirty ? phoneError : undefined) ?? serverError("phone")} onChange={(event) => edit({ phone: event.target.value })} />
        </SettingsRow>
      </SettingsGroup>
      <SettingsSaveBar
        visible={dirty}
        saving={updateProfile.isPending}
        errorText={failure?.formKey ? t(failure.formKey) : null}
        onDiscard={discard}
        onSave={save}
      />
    </div>
  );
}
