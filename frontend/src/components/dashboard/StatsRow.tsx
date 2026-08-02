import { BookOpen, Users, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFinanceAnalytics } from "../../lib/finance/hooks";
import { useCourses } from "../../lib/courses/hooks";
import { useStudents } from "../../lib/users/hooks";
import { formatSum } from "../../lib/money";

export function StatsRow() {
  const { t } = useTranslation("dashboard");

  const { data: coursesData } = useCourses({ status: "active" });
  const { data: studentsData } = useStudents({ page: 1, page_size: 1 });
  const { data: financeData } = useFinanceAnalytics();

  // net_receivable is already "billed and unpaid" — no arithmetic needed.
  const totalDebt = financeData ? formatSum(financeData.net_receivable) + " TJS" : "—";
  const debtorsCount = financeData ? t("debtors", { count: financeData.unpaid_students_count }) : "—";

  const activeCoursesCount = coursesData?.total ?? 0;
  const activeStudentsCount = studentsData?.total ?? 0;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div className="relative flex h-30 flex-col justify-between overflow-hidden rounded-xl border border-border-warm bg-beige-dark p-5 shadow-xs transition-[box-shadow,border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-sm">
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.6),rgba(255,255,255,0)_70%)]" />
        <p className="relative text-xs font-medium uppercase tracking-wide text-muted flex items-center gap-1.5">
          <AlertTriangle size={13} className="text-amber-600" /> {t("paymentDebt")}
        </p>
        <p className="relative text-[26px] font-bold leading-none text-ink tabular-nums">{totalDebt}</p>
        <span className="relative inline-flex w-fit items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800 tabular-nums ring-1 ring-black/5 dark:ring-white/10">
          {debtorsCount}
        </span>
      </div>

      <div className="flex h-30 flex-col justify-center rounded-xl border border-border-warm bg-card p-5 shadow-xs transition-[box-shadow,border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-sm">
        <BookOpen size={22} className="text-maroon dark:text-accent" strokeWidth={2} />
        <p className="mt-2 text-lg font-bold text-ink tabular-nums">{activeCoursesCount} {t("activeCourses")}</p>
        <p className="mt-0.5 text-xs text-muted">{t("activeCoursesSubtitle")}</p>
      </div>

      <div className="flex h-30 flex-col justify-center rounded-xl border border-border-warm bg-card p-5 shadow-xs transition-[box-shadow,border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-sm">
        <Users size={22} className="text-blue-600 dark:text-blue-400" strokeWidth={2} />
        <p className="mt-2 text-lg font-bold text-ink tabular-nums">{activeStudentsCount} {t("registeredStudents")}</p>
        <p className="mt-0.5 text-xs text-muted">{t("registeredStudentsSubtitle")}</p>
      </div>
    </div>
  );
}
