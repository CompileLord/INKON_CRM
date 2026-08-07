import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Cake, Mail, Phone, Award, CheckCircle2, XCircle, BookOpen, Eye, EyeOff, Key } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useStudentProfile } from "../lib/users/hooks";
import { resolveMediaUrl } from "../lib/users/media";
import { PersonAvatar } from "../components/ui/PersonAvatar";
import { DocumentsTab } from "../components/documents/DocumentsTab";
import type { CourseResponse } from "../lib/courses/types";
import { formatDate } from "../i18n/formatters";
import { useAuthStore } from "../store/authStore";

function CourseCard({ course }: { course: CourseResponse }) {
  const { t, i18n } = useTranslation("common");
  return (
    <Link
      to={`/courses/${course.id}`}
      className="flex flex-wrap items-center gap-4 rounded-xl border border-border-warm bg-card p-4 transition-colors duration-150 hover:bg-row-hover"
    >
      <div className="min-w-35 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{course.title}</p>
        <p className="text-xs font-medium text-muted">{t(`enums.examType.${course.exam_type}`, course.exam_type)}</p>
      </div>
      <span className="shrink-0 rounded-md bg-strip px-2 py-1 text-xs text-nav">
        {formatDate(course.start_date, i18n.language)} – {formatDate(course.end_date, i18n.language)}
      </span>
      <span className="shrink-0 whitespace-nowrap text-sm font-bold tabular-nums text-maroon">
        {course.price} TJS
      </span>
    </Link>
  );
}

export function StudentProfile() {
  const { id } = useParams<{ id: string }>();
  const numericId = id ? Number(id) : undefined;
  const { t, i18n } = useTranslation(["students", "common", "documents"]);
  const [tab, setTab] = useState<"courses" | "performance" | "documents">("courses");
  const [showPassword, setShowPassword] = useState(false);
  const role = useAuthStore((state) => state.role);

  const {
    data: profile,
    isLoading,
    isError,
    refetch,
  } = useStudentProfile(Number.isFinite(numericId) ? numericId : undefined);

  const backLink = (
    <Link
      to="/students"
      className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
    >
      <ArrowLeft size={16} /> {t("title")}
    </Link>
  );

  if (!numericId || Number.isNaN(numericId)) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <div className="rounded-2xl border border-border bg-card p-6 text-muted">
          {t("common:noData")}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <div className="rounded-2xl border border-border bg-card p-6 text-muted">{t("common:loading")}</div>
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted">{t("common:error")}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg border border-border-warm bg-card px-3 py-2 text-sm font-medium text-ink hover:bg-strip"
          >
            {t("common:retry")}
          </button>
        </div>
      </div>
    );
  }

  const { user, courses, avg_score, absences, total_lessons } = profile;
  const attendedLessons = Math.max(0, total_lessons - absences);
  const attendanceRate = total_lessons > 0 ? ((attendedLessons / total_lessons) * 100).toFixed(0) : "100";

  return (
    <div className="flex flex-col gap-5">
      {backLink}

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border-warm bg-card p-5">
        <PersonAvatar
          firstName={user.first_name}
          lastName={user.last_name}
          photoUrl={resolveMediaUrl(user.thumbnail_path ?? user.photo_path) ?? undefined}
          size={64}
        />
        <div>
          <h1 className="text-xl font-bold text-ink">
            {user.first_name} {user.last_name}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span className="flex items-center gap-1.5">
              <Mail size={14} /> {user.email}
            </span>
            {user.phone && (
              <span className="flex items-center gap-1.5">
                <Phone size={14} /> {user.phone}
              </span>
            )}
            {user.parent_phone && (
              <span className="flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                <Phone size={13} /> {t("parentPhone", "Родитель")}: {user.parent_phone}
              </span>
            )}
            {user.date_of_birth && (
              <span className="flex items-center gap-1.5">
                <Cake size={14} /> {formatDate(user.date_of_birth, i18n.language)}
              </span>
            )}
            {role === "superadmin" && (
              <span className="flex items-center gap-1.5 rounded-md bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40">
                <Key size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
                <span>{t("passwordLabel", "Пароль")}:</span>
                <span className="font-mono font-bold tracking-wider">
                  {showPassword ? (user.raw_password || "••••••••") : "••••••••"}
                </span>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="ml-0.5 p-0.5 text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200 transition-colors focus:outline-none"
                  title={showPassword ? t("hidePassword", "Скрыть пароль") : t("showPassword", "Показать пароль")}
                  aria-label={showPassword ? t("hidePassword", "Скрыть пароль") : t("showPassword", "Показать пароль")}
                >
                  {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border-warm bg-card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("avgScore")}</p>
          <p className="mt-2 text-[28px] font-bold text-ink">{avg_score.toFixed(1)}</p>
        </div>
        <div className="rounded-xl border border-border-warm bg-card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("absences")}</p>
          <p className="mt-2 text-[28px] font-bold text-ink">{absences}</p>
        </div>
        <div className="rounded-xl border border-border-warm bg-card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("totalLessons")}</p>
          <p className="mt-2 text-[28px] font-bold text-ink">{total_lessons}</p>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-border-warm pb-3">
        <button
          type="button"
          onClick={() => setTab("courses")}
          className={[
            "rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150",
            tab === "courses" ? "bg-beige font-semibold text-ink" : "text-nav hover:bg-strip",
          ].join(" ")}
        >
          {t("coursesTab")}
        </button>
        <button
          type="button"
          onClick={() => setTab("performance")}
          className={[
            "rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150",
            tab === "performance" ? "bg-beige font-semibold text-ink" : "text-nav hover:bg-strip",
          ].join(" ")}
        >
          {t("performanceTab")}
        </button>
        <button
          type="button"
          onClick={() => setTab("documents")}
          className={[
            "rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150",
            tab === "documents" ? "bg-beige font-semibold text-ink" : "text-nav hover:bg-strip",
          ].join(" ")}
        >
          {t("documents:title")}
        </button>
      </div>

      {tab === "courses" && (
        <div className="flex flex-col gap-3">
          {courses.length === 0 ? (
            <div className="rounded-xl border border-border-warm bg-card p-6 text-center text-sm text-muted">
              {t("noCourses")}
            </div>
          ) : (
            courses.map((item) => <CourseCard key={item.course.id} course={item.course} />)
          )}
        </div>
      )}

      {tab === "performance" && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-xl border border-border-warm bg-card p-4">
              <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600">
                <Award size={22} />
              </div>
              <div>
                <p className="text-xs text-muted">{t("avgScore")}</p>
                <p className="text-lg font-bold text-ink">{avg_score.toFixed(1)} / 100</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-border-warm bg-card p-4">
              <div className="rounded-lg bg-blue-50 p-2.5 text-blue-600">
                <CheckCircle2 size={22} />
              </div>
              <div>
                <p className="text-xs text-muted">{t("attendance")}</p>
                <p className="text-lg font-bold text-ink">{attendanceRate}%</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-border-warm bg-card p-4">
              <div className="rounded-lg bg-amber-50 p-2.5 text-amber-600">
                <XCircle size={22} />
              </div>
              <div>
                <p className="text-xs text-muted">{t("absences")}</p>
                <p className="text-lg font-bold text-ink">{absences} / {total_lessons}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border-warm bg-card p-5">
            <h3 className="text-sm font-bold text-ink flex items-center gap-2 mb-4">
              <BookOpen size={16} className="text-maroon" /> {t("activeCourses")}
            </h3>
            {courses.length === 0 ? (
              <p className="text-xs text-muted">{t("common:noData")}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {courses.map((item) => (
                  <div key={item.course.id} className="flex items-center justify-between border-b border-border-warm/60 pb-3 last:border-b-0 last:pb-0">
                    <div>
                      <p className="text-sm font-semibold text-ink">{item.course.title}</p>
                      <p className="text-xs text-muted">{t(`common:enums.examType.${item.course.exam_type}`, item.course.exam_type)}</p>
                    </div>
                    <Link
                      to={`/courses/${item.course.id}`}
                      className="rounded-lg border border-border-warm bg-strip px-3 py-1.5 text-xs font-semibold text-ink hover:bg-beige transition-colors"
                    >
                      {t("common:details")}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "documents" && (
        <DocumentsTab ownerType="student" ownerId={user.id} />
      )}
    </div>
  );
}

