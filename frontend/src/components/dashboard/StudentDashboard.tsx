import { BookOpen, CheckCircle2, Award } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMyStudentProfile } from "../../lib/users/hooks";

export function StudentDashboard() {
  const { t } = useTranslation(["dashboard", "students"]);
  const { data: profile } = useMyStudentProfile();
  const studentUser = profile?.user;

  return (
    <div className="flex flex-col gap-6">
      {/* Student Personal Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-maroon to-rose-900 p-6 text-white shadow-md">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-sm mb-2">
              {t("studentCabinet")}
            </span>
            <h2 className="text-2xl font-bold">
              {studentUser ? t("studentLabel", { name: `${studentUser.first_name} ${studentUser.last_name}` }) : t("studentCabinet")}
            </h2>
            <p className="text-xs text-rose-100 mt-1">{t("studyCenter")}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-md text-right border border-white/10">
            <span className="text-[11px] text-rose-200 block">{t("studyStatus")}</span>
            <span className="text-sm font-bold text-emerald-300 flex items-center gap-1 justify-end">
              <CheckCircle2 size={14} /> {t("activeStudent")}
            </span>
          </div>
        </div>
      </div>

      {/* Progress & Courses Link */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs lg:col-span-2 flex flex-col gap-5">
          <h3 className="text-sm font-bold text-ink flex items-center gap-2">
            <BookOpen size={18} className="text-maroon" /> {t("academicGroupsAndGrades")}
          </h3>

          <p className="text-xs text-muted">
            {t("studentHelpText")}
          </p>

          {studentUser && (
            <Link
              to={`/students/${studentUser.id}`}
              className="inline-flex w-fit items-center gap-2 rounded-xl bg-maroon px-4 py-2 text-xs font-semibold text-white hover:bg-maroon/90 transition-colors"
            >
              {t("openStudentProfile")} →
            </Link>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs flex flex-col gap-4">
          <h3 className="text-sm font-bold text-ink flex items-center gap-2">
            <Award size={18} className="text-amber-500" /> {t("progressTitle")}
          </h3>
          <p className="text-xs text-muted">
            {t("progressHelpText")}
          </p>
        </div>
      </div>
    </div>
  );
}
