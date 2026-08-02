import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PersonAvatar } from "../ui/PersonAvatar";
import { resolveMediaUrl } from "../../lib/users/media";
import type { CourseResponse } from "../../lib/courses/types";
import type { User } from "../../lib/users/types";

interface JournalCardProps {
  course: CourseResponse;
  mentor?: User;
}

export function JournalCard({ course, mentor }: JournalCardProps) {
  const navigate = useNavigate();
  const { t } = useTranslation(["journals", "common"]);
  const isActive = course.status === "active";

  return (
    <div
      onClick={() => navigate(`/journals/${course.id}`)}
      className={[
        "group flex cursor-pointer flex-col gap-3 rounded-2xl border border-border-warm bg-card px-5 py-4.5 transition-all duration-200",
        "hover:-translate-y-0.75 hover:shadow-[0_8px_24px_rgba(139,46,46,0.08)]",
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="truncate text-base font-semibold text-ink">{course.title}</h3>
        <span
          className={[
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
            isActive ? "bg-green-100 text-green-700 dark:bg-green-950/70 dark:text-green-300" : "bg-stone-100 text-stone-600 dark:bg-stone-800/80 dark:text-stone-300",
          ].join(" ")}
        >
          {isActive ? t("common:enums.courseStatus.active") : t("common:enums.courseStatus.archived")}
        </span>
      </div>

      <p className="text-xs font-medium text-muted">{t(`common:enums.examType.${course.exam_type}`, course.exam_type)}</p>

      {mentor && (
        <div className="flex items-center gap-2">
          <PersonAvatar
            firstName={mentor.first_name}
            lastName={mentor.last_name}
            photoUrl={resolveMediaUrl(mentor.thumbnail_path ?? mentor.photo_path) ?? undefined}
            size={24}
          />
          <span className="text-[13px] text-nav">
            {mentor.first_name} {mentor.last_name}
          </span>
        </div>
      )}

      <div className="flex items-center justify-end border-t border-beige pt-3">
        <button
          type="button"
          aria-label={t("openJournal")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-strip hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
