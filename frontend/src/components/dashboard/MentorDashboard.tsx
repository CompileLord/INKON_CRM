import { Calendar, Edit3, BookOpen, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCourses } from "../../lib/courses/hooks";
import { CardSkeleton } from "../ui/CardSkeleton";

export function MentorDashboard() {
  const { t } = useTranslation(["dashboard", "common"]);
  const { data: coursesData, isLoading, isError, refetch } = useCourses({ status: "active" });

  const courses = coursesData?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* Mentor Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-blue-900 to-indigo-900 p-6 text-white shadow-md">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-sm mb-2">
              {t("teacherCabinet")}
            </span>
            <h2 className="text-2xl font-bold">{t("teacherDashboard")}</h2>
            <p className="text-xs text-blue-100 mt-1">{t("teacherSubtitle")}</p>
          </div>
          <Link
            to="/journals"
            className="flex items-center gap-2 rounded-xl bg-white dark:bg-blue-950 dark:text-blue-100 dark:hover:bg-blue-900 px-4 py-2.5 text-xs font-bold text-blue-950 shadow-sm hover:bg-blue-50 transition-colors"
          >
            <Edit3 size={16} /> {t("openJournal")}
          </Link>
        </div>
      </div>

      {/* Courses List */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              <Calendar size={18} className="text-blue-600" /> {t("myGroupsAndCourses")}
            </h3>
            <span className="text-xs text-muted">{t("common:total")}: {courses.length}</span>
          </div>

          {isLoading ? (
            <CardSkeleton rows={3} />
          ) : isError ? (
            <div className="py-6 text-center text-xs">
              <p className="text-rose-600 font-semibold">{t("errorLoading", "Ошибка загрузки курсов")}</p>
              <button
                onClick={() => refetch()}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1 text-xs font-medium text-ink hover:bg-cream"
              >
                <RefreshCw size={12} /> {t("common:retry", "Повторить")}
              </button>
            </div>
          ) : courses.length === 0 ? (
            <p className="text-xs text-muted">{t("noActiveGroups")}</p>
          ) : (
            <div className="space-y-3 text-xs">
              {courses.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-4 hover:bg-cream/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-blue-600 p-2.5 text-white font-bold">
                      <BookOpen size={16} />
                    </div>
                    <div>
                      <h4 className="font-bold text-ink text-sm">{c.title}</h4>
                      <p className="text-muted text-xs">
                        {t(`common:enums.examType.${c.exam_type}`, c.exam_type)} • {c.price} TJS
                      </p>
                    </div>
                  </div>
                  <Link
                    to={`/courses/${c.id}`}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    {t("goToGroup")}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Info */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs flex flex-col gap-4">
          <h3 className="text-sm font-bold text-ink">{t("quickReference")}</h3>
          <p className="text-xs text-muted">
            {t("teacherHelpText")}
          </p>
        </div>
      </div>
    </div>
  );
}
