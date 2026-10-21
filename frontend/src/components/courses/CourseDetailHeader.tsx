import { useEffect, useState } from "react";
import { type To } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge } from "../ui/Badge";
import { BrandActivityIndicator } from "../ui/BrandActivityIndicator";
import { EntityHeader } from "../ui/EntityHeader";
import { InitialTile } from "../ui/InitialTile";
import { ButtonLink } from "../profile/ButtonLink";
import type { MenuItem } from "../ui/Menu";
import { formatDate } from "../../i18n/formatters";
import { formatMoney } from "../../lib/money";
import { resolveMediaUrl } from "../../lib/users/media";
import type { CourseResponse } from "../../lib/courses/types";

interface CourseDetailHeaderProps {
  course: CourseResponse;
  mentorName: string | null;
  isRefreshing: boolean;
  journalUrl: To;
  onJournalDeparture: () => void;
  menuHandlers: { onEdit: () => void; onDuplicate: () => void; onDelete: () => void } | null;
}

export function CourseDetailHeader({ course, mentorName, isRefreshing, journalUrl, onJournalDeparture, menuHandlers }: CourseDetailHeaderProps) {
  const { t } = useTranslation("courseDetail");
  const [imageFailed, setImageFailed] = useState<boolean>(false);

  useEffect(() => {
    setImageFailed(false);
  }, [course.photo_path]);

  const photoUrl: string | null = !imageFailed && course.photo_path ? resolveMediaUrl(course.photo_path) : null;
  const meta: string[] = [
    ...(mentorName ? [mentorName] : []),
    t(`examType.${course.exam_type}`),
    `${formatDate(course.start_date)} – ${formatDate(course.end_date)}`,
    `${formatMoney(course.price)} ${t("perMonth")}`,
  ];
  const menuItems: MenuItem[] | undefined = menuHandlers
    ? [
        { key: "edit", label: t("actions.edit"), onSelect: menuHandlers.onEdit },
        { key: "duplicate", label: t("actions.duplicate"), onSelect: menuHandlers.onDuplicate },
        { key: "delete", label: t("actions.delete"), onSelect: menuHandlers.onDelete, destructive: true },
      ]
    : undefined;

  return (
    <EntityHeader
      avatar={photoUrl ? (
        <img src={photoUrl} alt="" onError={() => setImageFailed(true)} className="size-14 shrink-0 rounded-[12px] border border-border object-cover" />
      ) : (
        <InitialTile name={course.title} size="lg" />
      )}
      name={course.title}
      status={
        <>
          <Badge status={course.status} />
          {isRefreshing && (
            <span aria-live="polite" className="inline-flex items-center gap-1 text-xs text-muted">
              <BrandActivityIndicator size={12} />
              <span>{t("updating")}</span>
            </span>
          )}
        </>
      }
      meta={meta}
      primaryAction={
        <ButtonLink to={journalUrl} onClick={onJournalDeparture}>{t("openJournal")}</ButtonLink>
      }
      menuItems={menuItems}
      menuLabel={`${t("actions.label")}: ${course.title}`}
    />
  );
}
