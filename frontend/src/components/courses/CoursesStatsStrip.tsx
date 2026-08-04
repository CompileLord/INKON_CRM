import { BookOpen, GraduationCap, Users } from "lucide-react";
import { useCourses } from "../../lib/courses/hooks";
import { useEnrollmentsTotal } from "../../lib/enrollments/hooks";
import { useAuthStore } from "../../store/authStore";

const labelClass = "text-xs font-medium uppercase tracking-[0.5px] text-muted";
const valueClass = "mt-1.5 text-[26px] font-bold tabular-nums text-ink";
const cardClass =
  "flex h-23 flex-col justify-center rounded-xl border border-border-warm bg-card px-5 py-4";

export function CoursesStatsStrip() {
  const role = useAuthStore((state) => state.role);
  const isSuperAdmin = role === "superadmin";

  const { data: allPage } = useCourses({ page_size: 1 });
  const { data: activePage } = useCourses({ status: "active", page_size: 1 });
  const { data: enrollmentsTotal } = useEnrollmentsTotal(isSuperAdmin);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className={cardClass}>
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-maroon" />
          <p className={labelClass}>Всего курсов</p>
        </div>
        <p className={valueClass}>{allPage?.total ?? "—"}</p>
      </div>

      <div className={cardClass}>
        <div className="flex items-center gap-2">
          <Users size={16} className="text-blue-600" />
          <p className={labelClass}>Активных курсов</p>
        </div>
        <p className={valueClass}>{activePage?.total ?? "—"}</p>
      </div>

      <div className={cardClass}>
        <div className="flex items-center gap-2">
          <GraduationCap size={16} className="text-green-600" />
          <p className={labelClass}>Всего записей на курсы</p>
        </div>
        <p className={valueClass}>{enrollmentsTotal ?? "—"}</p>
      </div>
    </div>
  );
}
