import { Cake, Mail, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GuardianPhonePopover } from "../students/GuardianPhonePopover";
import { ParentLinkBadge } from "../students/ParentLinkBadge";
import { TelegramLinkCodeAction } from "./TelegramLinkCodeAction";
import { formatDate } from "../../i18n/formatters";
import type { User } from "../../lib/users/types";

interface StudentProfileMetaProps {
  user: User;
  canManageParentLink?: boolean;
}

const META_LINK_CLASS: string =
  "inline-flex min-h-11 min-w-0 max-w-full items-center gap-1.5 rounded text-nav hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out";

export function StudentProfileMeta({ user, canManageParentLink = false }: StudentProfileMetaProps) {
  const { t, i18n } = useTranslation("students");

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-0 text-sm text-muted">
      <a href={`mailto:${user.email}`} className={META_LINK_CLASS}>
        <Mail size={14} aria-hidden="true" className="shrink-0" />
        <span className="sr-only">{t("emailLabel")}: </span>
        <span className="min-w-0 truncate" title={user.email}>{user.email}</span>
      </a>
      {user.phone ? (
        <span className="inline-flex min-w-0 items-center gap-1">
          <a href={`tel:${user.phone}`} className={`${META_LINK_CLASS} tabular-nums`}>
            <Phone size={14} aria-hidden="true" className="shrink-0" />
            <span className="sr-only">{t("phoneLabel")}: </span>
            <span>{user.phone}</span>
          </a>
          {user.parent_phone ? <GuardianPhonePopover guardianPhone={user.parent_phone} /> : null}
        </span>
      ) : user.parent_phone ? (
        <GuardianPhonePopover guardianPhone={user.parent_phone} />
      ) : null}
      {user.date_of_birth ? (
        <span className="inline-flex min-h-11 items-center gap-1.5 tabular-nums">
          <Cake size={14} aria-hidden="true" className="shrink-0" />
          <span className="sr-only">{t("dateOfBirth")}: </span>
          {formatDate(user.date_of_birth, i18n.language)}
        </span>
      ) : null}
      <ParentLinkBadge linked={user.parent_linked === true} />
      {canManageParentLink ? (
        <TelegramLinkCodeAction studentId={user.id} activeCodeExpiresAt={user.parent_link_code_expires_at ?? null} />
      ) : null}
    </div>
  );
}
