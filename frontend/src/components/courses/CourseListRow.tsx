import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, User as UserIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import { formatSchoolLessonDate } from "../../i18n/formatters";
import { resolveMediaUrl } from "../../lib/users/media";
import { AdminCourseMenu } from "./AdminCourseMenu";
import type { CourseResponse } from "../../lib/courses/types";
import type { User } from "../../lib/users/types";

interface CourseListRowProps {
  course: CourseResponse;
  mentor?: User;
  isSuperAdmin: boolean;
  isMentor: boolean;
  onNavigate?: () => void;
  onEdit?: (course: CourseResponse) => void;
  onDuplicate?: (course: CourseResponse, triggerElement?: HTMLElement | null) => void;
  onDelete?: (course: CourseResponse, triggerElement?: HTMLElement | null) => void;
}

export function CourseListRow({
  course,
  mentor,
  isSuperAdmin,
  isMentor,
  onNavigate,
  onEdit,
  onDuplicate,
  onDelete,
}: CourseListRowProps) {
  const { t, i18n } = useTranslation(["courses", "common"]);
  const [imageError, setImageError] = useState(false);

  const isActive = course.status === "active";
  const photoUrl =
    !imageError && course.photo_path ? resolveMediaUrl(course.photo_path) : null;
  const mentorName = mentor
    ? `${mentor.first_name} ${mentor.last_name}`.trim()
    : null;

  const handleLinkClick = () => {
    onNavigate?.();
  };

  const handleLinkKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      onNavigate?.();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-border px-5 py-3.5 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out last:border-b-0 hover:bg-row-hover">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-strip flex items-center justify-center">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            onError={() => setImageError(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <BookOpen size={20} className="text-muted" aria-hidden="true" />
        )}
      </div>

      <div className="min-w-44 flex-1">
        <Link
          to={`/courses/${course.id}`}
          onClick={handleLinkClick}
          onKeyDown={handleLinkKeyDown}
          className="text-sm font-semibold text-ink break-words motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out hover:text-maroon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon rounded-[10px]"
        >
          {course.title}
        </Link>
        <p className="text-xs font-medium text-muted">
          {t(`examTypeLabel.${course.exam_type}`)}
        </p>
      </div>

      {mentorName ? (
        <div className="hidden w-44 shrink-0 md:flex items-start gap-1.5 text-xs text-muted min-w-0">
          <UserIcon size={13} className="mt-0.5 shrink-0" />
          <span className="break-words min-w-0">{mentorName}</span>
        </div>
      ) : null}

      <span className="hidden shrink-0 rounded-md bg-strip px-2.5 py-1 text-xs text-nav tabular-nums sm:inline-flex">
        {formatSchoolLessonDate(course.start_date, i18n.language)} –{" "}
        {formatSchoolLessonDate(course.end_date, i18n.language)}
      </span>

      <span className="w-28 shrink-0 whitespace-nowrap text-right text-sm font-bold tabular-nums text-ink">
        {formatMoney(course.price)} {t("currencyPerMonth")}
      </span>

      <span
        className={[
          "hidden shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium sm:inline-flex",
          isActive
            ? "bg-success-surface text-success"
            : "bg-strip text-muted border border-border",
        ].join(" ")}
      >
        {isActive ? t("filter.active") : t("filter.archived")}
      </span>

      <div className="flex items-center gap-1 shrink-0 ml-auto sm:ml-0">
        {isMentor ? (
          <Link
            to={`/journals/${course.id}`}
            onClick={handleLinkClick}
            onKeyDown={handleLinkKeyDown}
            aria-label={`${t("openJournal")}: ${course.title}`}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-[10px] bg-card border border-control-border text-ink hover:bg-strip motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon"
          >
            <BookOpen size={14} className="text-maroon shrink-0" />
            <span>{t("openJournal")}</span>
          </Link>
        ) : null}

        {isSuperAdmin && onEdit && onDuplicate && onDelete ? (
          <AdminCourseMenu
            course={course}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        ) : null}

        <Link
          to={`/courses/${course.id}`}
          onClick={handleLinkClick}
          onKeyDown={handleLinkKeyDown}
          aria-label={`${t("details")}: ${course.title}`}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[10px] text-muted motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out hover:bg-strip hover:text-ink motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon focus-visible:ring-offset-2"
        >
          <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
