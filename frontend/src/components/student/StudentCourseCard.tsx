import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { StudentCourseProfile } from "../../lib/users/types";
import { resolveMediaUrl } from "../../lib/users/media";
import { formatDate } from "../../i18n/formatters";
import { FillBar } from "../courses/FillBar";

import { useMentorProfile } from "../../lib/users/hooks";
import { PersonAvatar } from "../ui/PersonAvatar";

interface StudentCourseCardProps {
  entry: StudentCourseProfile;
  variant?: "active" | "archive";
}

export function StudentCourseCard({ entry, variant }: StudentCourseCardProps) {
  const { t, i18n } = useTranslation(["student", "courses", "common"]);
  const { course, bucket, enrollment_status, my_avg_percentage, periods_graded, periods_total } = entry;
  const isArchive = (variant ?? bucket) === "archive";
  const photoUrl = resolveMediaUrl(course.photo_path);

  const { data: mentorProfile } = useMentorProfile(course.mentor_id);
  const mentorUser = mentorProfile?.user;

  const fillRate = periods_total > 0 ? (periods_graded / periods_total) * 100 : 0;

  return (
    <Link
      to={`/my/courses/${course.id}`}
      className={[
        "group flex flex-col justify-between rounded-2xl border border-border-warm p-4 transition-all duration-150 active:scale-[0.96]",
        isArchive ? "bg-strip hover:bg-card" : "bg-card hover:bg-row-hover",
      ].join(" ")}
    >
      <div className="flex flex-col gap-3">
        {photoUrl && (
          <img
            src={photoUrl}
            alt={course.title}
            className={[
              "aspect-[16/9] w-full rounded-xl object-cover transition-opacity",
              isArchive ? "opacity-75" : "opacity-100",
            ].join(" ")}
          />
        )}

        <div className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-base font-semibold text-ink group-hover:text-maroon dark:group-hover:text-accent">
              {course.title}
            </h3>
            {isArchive && (
              <span
                className={[
                  "shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold",
                  enrollment_status === "completed"
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "bg-strip text-muted",
                ].join(" ")}
              >
                {enrollment_status === "completed"
                  ? t("status.completed", "Завершено")
                  : enrollment_status === "withdrawn"
                  ? t("status.left", "Завершено")
                  : t("status.archived", "В архиве")}
              </span>
            )}
          </div>
          <p className="text-xs text-muted">
            {t(`common:enums.examType.${course.exam_type}`, course.exam_type)} ·{" "}
            {formatDate(course.start_date, i18n.language)} – {formatDate(course.end_date, i18n.language)}
          </p>
        </div>

        <div className="mt-1 flex items-baseline justify-between">
          <div>
            <span className="text-xs text-muted block">{t("myAverage", "Мой балл")}</span>
            <span className="text-2xl font-bold tabular-nums text-ink">{my_avg_percentage.toFixed(1)}%</span>
          </div>
          {mentorUser && (
            <div className="flex items-center gap-1.5 rounded-lg bg-strip px-2 py-1">
              <PersonAvatar
                firstName={mentorUser.first_name}
                lastName={mentorUser.last_name}
                photoUrl={resolveMediaUrl(mentorUser.thumbnail_path ?? mentorUser.photo_path) ?? undefined}
                size={20}
              />
              <span className="text-xs font-medium text-ink truncate max-w-[100px]">
                {mentorUser.first_name} {mentorUser.last_name}
              </span>
            </div>
          )}
        </div>

        {!isArchive && (
          <div className="flex flex-col gap-1">
            <FillBar rate={fillRate} />
            <span className="text-xs text-muted tabular-nums">
              {t("periodsCount", "{{graded}} из {{total}} периодов", { graded: periods_graded, total: periods_total })}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
