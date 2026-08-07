import React from "react";
import { BookOpen, Users, ClipboardCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/authStore";
import { useMentorProfile } from "../../lib/users/hooks";
import { useMentorGradingQueue } from "../../lib/journals/hooks";
import { useCourses } from "../../lib/courses/hooks";

const labelClass = "text-xs font-medium uppercase tracking-[0.5px] text-muted";
const valueClass = "mt-1.5 text-[26px] font-bold tabular-nums text-ink";
const cardClass =
  "flex h-23 flex-col justify-center rounded-xl border border-border-warm bg-card px-5 py-4";

export const MentorStatsStrip: React.FC = () => {
  const { t } = useTranslation("journals");
  const userId = useAuthStore((s) => s.userId ?? undefined);
  const { data: profile } = useMentorProfile(userId);
  const { data: activeCoursesPage } = useCourses({ status: "active", page_size: 1 });
  const { data: queue } = useMentorGradingQueue();

  const activeCoursesCount = profile?.active_courses?.length ?? activeCoursesPage?.total ?? "—";
  const activeStudentsCount = profile?.active_students_count ?? "—";
  const needsGradingCount = queue ? queue.length : "—";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className={cardClass}>
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-maroon dark:text-accent" />
          <p className={labelClass}>{t("mentorStats.myCourses")}</p>
        </div>
        <p className={valueClass}>{activeCoursesCount}</p>
      </div>

      <div className={cardClass}>
        <div className="flex items-center gap-2">
          <Users size={16} className="text-blue-600 dark:text-blue-400" />
          <p className={labelClass}>{t("mentorStats.myStudents")}</p>
        </div>
        <p className={valueClass}>{activeStudentsCount}</p>
      </div>

      <div className={cardClass}>
        <div className="flex items-center gap-2">
          <ClipboardCheck size={16} className="text-amber-600 dark:text-amber-400" />
          <p className={labelClass}>{t("mentorStats.periodsNeedingGrading")}</p>
        </div>
        <p className={valueClass}>{needsGradingCount}</p>
      </div>
    </div>
  );
};
