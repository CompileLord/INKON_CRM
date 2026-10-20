import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { EntityHeader } from "../ui/EntityHeader";
import type { MenuItem } from "../ui/Menu";
import { PersonAvatar } from "../ui/PersonAvatar";
import { formatDate } from "../../i18n/formatters";
import { resolveMediaUrl } from "../../lib/users/media";
import type { User } from "../../lib/users/types";

interface MentorProfileHeaderProps {
  user: User;
  isSuperAdmin: boolean;
  onEdit: (trigger: HTMLElement | null) => void;
  onDelete: (trigger: HTMLElement | null) => void;
  onOpenAccess: () => void;
}

export function MentorProfileHeader({ user, isSuperAdmin, onEdit, onDelete, onOpenAccess }: MentorProfileHeaderProps) {
  const { t } = useTranslation("mentorProfile");
  const meta: string[] = [user.email, ...(user.phone ? [user.phone] : []), ...(user.date_of_birth ? [formatDate(user.date_of_birth)] : [])];
  const menuTrigger = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-entity-header] [aria-haspopup="menu"]');
  const menuItems: MenuItem[] | undefined = isSuperAdmin
    ? [
        { key: "access", label: t("header.access"), onSelect: onOpenAccess },
        { key: "delete", label: t("header.delete"), onSelect: () => onDelete(menuTrigger()), destructive: true },
      ]
    : undefined;

  return (
    <EntityHeader
      avatar={<PersonAvatar firstName={user.first_name} lastName={user.last_name} photoUrl={resolveMediaUrl(user.thumbnail_path ?? user.photo_path) ?? undefined} size={56} />}
      name={`${user.first_name} ${user.last_name}`}
      meta={meta}
      primaryAction={isSuperAdmin ? <Button type="button" variant="secondary" onClick={(event) => onEdit(event.currentTarget)}>{t("header.edit")}</Button> : undefined}
      menuItems={menuItems}
      menuLabel={t("header.actions")}
    />
  );
}
