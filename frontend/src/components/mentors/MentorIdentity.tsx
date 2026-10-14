import { useState } from "react";
import { Cake, Eye, EyeOff, Key, Mail, Pencil, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDate } from "../../i18n/formatters";
import type { User } from "../../lib/users/types";
import { resolveMediaUrl } from "../../lib/users/media";
import { PersonAvatar } from "../ui/PersonAvatar";
import { Button } from "../ui/Button";
import { MentorRowMenu } from "./MentorRowMenu";

export function MentorIdentity({ user, administrator, onEdit, onDelete }: {
  user: User;
  administrator: boolean;
  onEdit: (trigger?: HTMLElement | null) => void;
  onDelete: (trigger?: HTMLElement | null) => void;
}) {
  const { t, i18n } = useTranslation("mentors");
  const [revealed, setRevealed] = useState(false);
  const contacts = <>
    <a href={`mailto:${user.email}`} className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-1.5 text-nav hover:text-ink">
      <Mail size={14} className="shrink-0" /><span className="sr-only">{t("form.emailLabel")}: </span><span className="min-w-0 [overflow-wrap:anywhere]">{user.email}</span>
    </a>
    {user.phone && <a href={`tel:${user.phone}`} className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-1.5 text-nav hover:text-ink tabular-nums">
      <Phone size={14} className="shrink-0" /><span className="sr-only">{t("form.phoneLabel")}: </span><span className="[overflow-wrap:anywhere]">{user.phone}</span>
    </a>}
  </>;
  return <div className="min-w-0 rounded-2xl border border-border-warm bg-card p-4 md:p-5">
    <div className="flex min-w-0 items-start justify-between gap-3 md:gap-4">
      <div className="flex min-w-0 items-start gap-3 md:gap-4">
        <div className="shrink-0 md:hidden"><PersonAvatar firstName={user.first_name} lastName={user.last_name} photoUrl={resolveMediaUrl(user.thumbnail_path ?? user.photo_path) ?? undefined} size={48} /></div>
        <div className="hidden shrink-0 md:block"><PersonAvatar firstName={user.first_name} lastName={user.last_name} photoUrl={resolveMediaUrl(user.thumbnail_path ?? user.photo_path) ?? undefined} size={64} /></div>
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold leading-8 text-ink md:text-[28px] md:leading-9">{user.first_name} {user.last_name}</h1>
          <div className="mt-1 hidden min-w-0 flex-wrap gap-x-4 gap-y-1 text-sm md:flex">{contacts}</div>
        </div>
      </div>
      {administrator && <div className="flex shrink-0 gap-2">
        <div className="hidden md:block"><Button variant="secondary" onClick={event => onEdit(event.currentTarget)}><Pencil size={15} />{t("editMentor")}</Button></div>
        <MentorRowMenu mentor={user} onEdit={(_user, trigger) => onEdit(trigger)} onDelete={(_user, trigger) => onDelete(trigger)} />
      </div>}
    </div>
    <div className="mt-2 flex min-w-0 flex-col gap-1 text-sm md:hidden">{contacts}</div>
    {user.date_of_birth && <details className="mt-1">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-nav"><Cake size={13} />{t("profile.personalDetails")}</summary>
      <p className="pl-5 text-xs text-muted">{t("form.dobLabel")}: {formatDate(user.date_of_birth, i18n.language)}</p>
    </details>}
    {administrator && <details className="mt-1" onToggle={event => { if (!event.currentTarget.open) setRevealed(false); }}>
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-nav"><Key size={13} />{t("profile.accountAccess")}</summary>
      <div className="flex min-w-0 items-center gap-2 pl-5 text-xs text-muted">
        {user.raw_password ? <>
          <span className="min-w-0 break-all font-mono text-ink">{revealed ? user.raw_password : "••••••••"}</span>
          <Button variant="secondary" aria-label={t(revealed ? "profile.hidePassword" : "profile.showPassword")} onClick={() => setRevealed(value => !value)}>{revealed ? <EyeOff size={14} /> : <Eye size={14} />}</Button>
        </> : t("profile.credentialsUnavailable")}
      </div>
    </details>}
  </div>;
}
