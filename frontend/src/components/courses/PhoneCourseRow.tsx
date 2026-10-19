import { useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Calendar, ArrowRight, User as UserIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import { formatSchoolLessonDate } from "../../i18n/formatters";
import { resolveMediaUrl } from "../../lib/users/media";
import { AdminCourseMenu } from "./AdminCourseMenu";
import { CourseScheduleLine } from "./CourseScheduleLine";
import type { CourseListItemResponse, CourseResponse } from "../../lib/courses/types";
import type { User } from "../../lib/users/types";

interface PhoneCourseRowProps {
  course: CourseListItemResponse;
  mentor?: User;
  isSuperAdmin: boolean;
  isMentor: boolean;
  onNavigate?: () => void;
  onEdit: (course: CourseResponse) => void;
  onDuplicate: (course: CourseResponse, triggerElement?: HTMLElement | null) => void;
  onDelete: (course: CourseResponse, triggerElement?: HTMLElement | null) => void;
}

export function PhoneCourseRow({
  course,
  mentor,
  isSuperAdmin,
  isMentor,
  onNavigate,
  onEdit,
  onDuplicate,
  onDelete,
}: PhoneCourseRowProps) {
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
    <div className="flex items-start gap-3 p-3.5 sm:p-4 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out hover:bg-row-hover">
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

      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            to={`/courses/${course.id}`}
            onClick={handleLinkClick}
            onKeyDown={handleLinkKeyDown}
            className="text-base font-semibold text-ink leading-6 break-words motion-safe:transition-[color,transform] motion-safe:duration-150 motion-safe:ease-out hover:text-maroon-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon rounded-[10px]"
          >
            {course.title}
          </Link>
          <span
            className={[
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0",
              isActive
                ? "bg-success-surface text-success"
                : "bg-strip text-muted border border-border",
            ].join(" ")}
          >
            {isActive ? t("filter.active") : t("filter.archived")}
          </span>
        </div>

        {mentorName ? (
          <div className="flex items-start gap-1.5 text-xs text-muted min-w-0">
            <UserIcon size={12} className="mt-0.5 shrink-0" />
            <span className="break-words min-w-0">{mentorName}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted tabular-nums">
          <span className="inline-flex items-center gap-1">
            <Calendar size={12} className="shrink-0" />
            {formatSchoolLessonDate(course.start_date, i18n.language)} –{" "}
            {formatSchoolLessonDate(course.end_date, i18n.language)}
          </span>
          <span className="text-border">·</span>
          <span>{t(`examTypeLabel.${course.exam_type}`)}</span>
        </div>

        <CourseScheduleLine schedules={course.schedules} />

        <span className="text-xs text-nav tabular-nums">
          {t("studentsCount", { count: course.active_student_count })}
        </span>

        <div className="mt-0.5">
          <span className="text-xs font-bold tabular-nums text-ink">
            {formatMoney(course.price)} {t("currencyPerMonth")}
          </span>
        </div>

        {isMentor ? (
          <div className="mt-1 pt-1">
            <Link
              to={`/journals/${course.id}`}
              onClick={handleLinkClick}
              onKeyDown={handleLinkKeyDown}
              aria-label={`${t("openJournal")}: ${course.title}`}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-[10px] bg-card border border-control-border text-ink hover:bg-strip motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon"
            >
              <BookOpen size={14} className="text-maroon-text shrink-0" />
              <span>{t("openJournal")}</span>
              <ArrowRight size={13} className="text-muted" />
            </Link>
          </div>
        ) : null}
      </div>

      {isSuperAdmin ? (
        <div className="shrink-0 self-start">
          <AdminCourseMenu
            course={course}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        </div>
      ) : null}
    </div>
  );
}
