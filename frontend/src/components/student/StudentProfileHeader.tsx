import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { EntityHeader } from "../ui/EntityHeader";
import type { MenuItem } from "../ui/Menu";
import { PersonAvatar } from "../ui/PersonAvatar";
import { StudentParentLink } from "./StudentParentLink";
import { formatDate } from "../../i18n/formatters";
import { resolveMediaUrl } from "../../lib/users/media";
import type { User } from "../../lib/users/types";

interface StudentProfileHeaderProps {
  user: User;
  isSuperAdmin: boolean;
  initialLinkCode: string | null;
  editTriggerRef: RefObject<HTMLButtonElement | null>;
  onEdit: () => void;
  onDelete: () => void;
  onOpenAccess: () => void;
}

export function StudentProfileHeader({ user, isSuperAdmin, initialLinkCode, editTriggerRef, onEdit, onDelete, onOpenAccess }: StudentProfileHeaderProps) {
  const { t } = useTranslation("studentProfile");
  const meta: string[] = [
    user.email,
    ...(user.phone ? [user.phone] : []),
    ...(user.parent_phone ? [t("header.parentPhone", { phone: user.parent_phone })] : []),
    ...(user.date_of_birth ? [formatDate(user.date_of_birth)] : []),
  ];
  const menuItems: MenuItem[] | undefined = isSuperAdmin
    ? [
        { key: "access", label: t("header.access"), onSelect: onOpenAccess },
        { key: "delete", label: t("header.delete"), onSelect: onDelete, destructive: true },
      ]
    : undefined;

  return (
    <EntityHeader
      avatar={<PersonAvatar firstName={user.first_name} lastName={user.last_name} photoUrl={resolveMediaUrl(user.thumbnail_path ?? user.photo_path) ?? undefined} size={56} />}
      name={`${user.first_name} ${user.last_name}`}
      status={
        <>
          {user.is_deleted ? <Badge status="archived" /> : null}
          <StudentParentLink user={user} canManage={isSuperAdmin} initialLinkCode={initialLinkCode} />
        </>
      }
      meta={meta}
      primaryAction={isSuperAdmin ? <Button ref={editTriggerRef} type="button" variant="secondary" onClick={onEdit}>{t("header.edit")}</Button> : undefined}
      menuItems={menuItems}
      menuLabel={t("header.actions")}
    />
  );
}
