import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../../lib/money";
import { dateOnlyToDate } from "../../lib/users/dates";
import { MentorAvatarStack } from "./MentorAvatarStack";
import type { CourseResponse } from "../../lib/courses/types";
import type { User } from "../../lib/users/types";

interface CourseListRowProps {
  course: CourseResponse;
  mentor?: User;
}

const EXAM_TYPE_META: Record<CourseResponse["exam_type"], { dotColor: string; textClass: string }> = {
  weekly: { dotColor: "#2563EB", textClass: "text-blue-600" },
  monthly: { dotColor: "#7C3AED", textClass: "text-violet-600" },
};

function formatDateOnly(dateStr: string, locale: string): string {
  const date = dateOnlyToDate(dateStr);
  if (!date) return dateStr;
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : locale === "tg" ? "tg-TJ" : "ru-RU", { day: "numeric", month: "short" }).format(date);
}

export function CourseListRow({ course, mentor }: CourseListRowProps) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation(["courses", "common"]);
  const meta = EXAM_TYPE_META[course.exam_type];
  const isActive = course.status === "active";

  return (
    <div
      onClick={() => navigate(`/courses/${course.id}`)}
      className="flex cursor-pointer flex-wrap items-center gap-4 border-b border-beige px-5 py-4 transition-colors duration-150 last:border-b-0 hover:bg-row-hover"
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: meta.dotColor }} />

      <div className="min-w-40 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{course.title}</p>
        <p className={`text-xs font-medium ${meta.textClass}`}>
          {t(`examTypeLabel.${course.exam_type}`)}
        </p>
      </div>

      <div className="hidden w-48 shrink-0 md:block">
        <MentorAvatarStack mentors={mentor ? [mentor] : []} />
      </div>

      <span className="hidden shrink-0 rounded-md bg-strip px-2 py-1 text-xs text-nav sm:inline-flex">
        {formatDateOnly(course.start_date, i18n.language)} – {formatDateOnly(course.end_date, i18n.language)}
      </span>

      <span className="w-24 shrink-0 whitespace-nowrap text-right text-sm font-bold tabular-nums text-maroon">
        {formatMoney(course.price)}
      </span>

      <span
        className={[
          "hidden shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium sm:inline-flex",
          isActive ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-600",
        ].join(" ")}
      >
        {isActive ? t("filter.active") : t("filter.archived")}
      </span>

      <button
        type="button"
        aria-label={t("common:details", "Подробнее")}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-strip hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
      >
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
