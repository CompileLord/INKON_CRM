import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Calendar, BookOpen, User as UserIcon, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import { formatSchoolLessonDate } from "../../i18n/formatters";
import { resolveMediaUrl } from "../../lib/users/media";
import { AdminCourseMenu } from "./AdminCourseMenu";
import { CourseScheduleLine } from "./CourseScheduleLine";
import type { CourseListItemResponse, CourseResponse } from "../../lib/courses/types";
import type { User } from "../../lib/users/types";

interface CourseCardProps {
  course: CourseListItemResponse;
  mentor?: User;
  isSuperAdmin: boolean;
  isMentor: boolean;
  onNavigate?: () => void;
  onEdit?: (course: CourseResponse) => void;
  onDuplicate?: (course: CourseResponse, triggerElement?: HTMLElement | null) => void;
  onDelete?: (course: CourseResponse, triggerElement?: HTMLElement | null) => void;
}

export function CourseCard({
  course,
  mentor,
  isSuperAdmin,
  isMentor,
  onNavigate,
  onEdit,
  onDuplicate,
  onDelete,
}: CourseCardProps) {
  const { t, i18n } = useTranslation(["courses", "common"]);
  const [imageError, setImageError] = useState(false);

  const isActive = course.status === "active";
  const coursePhotoUrl =
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
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border-warm bg-card">
      <div className="relative h-28 shrink-0 overflow-hidden bg-strip flex items-center justify-center border-b border-border">
        {coursePhotoUrl ? (
          <img
            src={coursePhotoUrl}
            alt=""
            onError={() => setImageError(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <BookOpen size={28} className="text-muted" aria-hidden="true" />
        )}
        <span
          className={[
            "absolute left-3 top-3 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border border-border shadow-xs",
            isActive
              ? "bg-success-surface text-success"
              : "bg-beige text-muted",
          ].join(" ")}
        >
          {isActive ? t("filter.active") : t("filter.archived")}
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-3 p-4 sm:p-5">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            {t(`examTypeLabel.${course.exam_type}`)}
          </span>

          <Link
            to={`/courses/${course.id}`}
            onClick={handleLinkClick}
            onKeyDown={handleLinkKeyDown}
            className="text-base font-semibold text-ink break-words motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out hover:text-maroon-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon rounded-[10px]"
          >
            {course.title}
          </Link>

          {mentorName ? (
            <div className="flex items-start gap-1.5 text-xs text-muted min-w-0">
              <UserIcon size={13} className="mt-0.5 shrink-0" />
              <span className="break-words min-w-0">{mentorName}</span>
            </div>
          ) : null}

          <div className="flex items-center gap-1.5 text-xs text-nav tabular-nums">
            <Calendar size={13} className="shrink-0" />
            <span>
              {formatSchoolLessonDate(course.start_date, i18n.language)} –{" "}
              {formatSchoolLessonDate(course.end_date, i18n.language)}
            </span>
          </div>

          <CourseScheduleLine schedules={course.schedules} />

          <div className="flex items-center gap-1.5 text-xs text-nav tabular-nums">
            <Users size={13} className="shrink-0" aria-hidden="true" />
            <span>{t("studentsCount", { count: course.active_student_count })}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <span className="whitespace-nowrap text-sm font-bold tabular-nums text-ink">
            {formatMoney(course.price)} {t("currencyPerMonth")}
          </span>

          <div className="flex items-center gap-1">
            {isMentor ? (
              <Link
                to={`/journals/${course.id}`}
                onClick={handleLinkClick}
                onKeyDown={handleLinkKeyDown}
                aria-label={`${t("openJournal")}: ${course.title}`}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-[10px] bg-card border border-control-border text-ink hover:bg-strip motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon"
              >
                <BookOpen size={14} className="text-maroon-text shrink-0" />
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
      </div>
    </div>
  );
}
