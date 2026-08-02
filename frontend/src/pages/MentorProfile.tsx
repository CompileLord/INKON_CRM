import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Mail, Phone, BookOpen, Users, Award, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMentorAnalytics, useMentorProfile } from "../lib/users/hooks";
import { resolveMediaUrl } from "../lib/users/media";
import { dateOnlyToDate } from "../lib/users/dates";
import { PersonAvatar } from "../components/ui/PersonAvatar";
import { DocumentsTab } from "../components/documents/DocumentsTab";
import type { CourseResponse } from "../lib/courses/types";

function formatDateOnly(dateStr: string, locale: string = "ru-RU"): string {
  const date = dateOnlyToDate(dateStr);
  if (!date) return dateStr;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" })
    .format(date)
    .replace(/\s*г\.$/, "");
}

function CourseCard({ course }: { course: CourseResponse }) {
  const { t, i18n } = useTranslation(["mentors", "common"]);
  return (
    <Link
      to={`/courses/${course.id}`}
      className="rounded-xl border border-border-warm bg-card p-5 transition-colors duration-150 hover:bg-row-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-ink">{course.title}</h3>
        <span className="inline-flex shrink-0 items-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
          {course.status === "active" ? t("common:enums.courseStatus.active", "Активен") : t("common:enums.courseStatus.archived", "Архив")}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-beige pt-3">
        <div>
          <p className="text-xs text-muted">{t("period", "Период")}</p>
          <p className="mt-0.5 text-sm font-medium text-ink">
            {formatDateOnly(course.start_date, i18n.language)} – {formatDateOnly(course.end_date, i18n.language)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">{t("price", "Цена")}</p>
          <p className="mt-0.5 text-sm font-medium text-ink">{course.price} TJS/{t("month", "мес")}</p>
        </div>
      </div>
    </Link>
  );
}

export function MentorProfile() {
  const { t } = useTranslation(["mentors", "common"]);
  const { id } = useParams<{ id: string }>();
  const numericId = id ? Number(id) : undefined;
  const [tabIndex, setTabIndex] = useState<number>(0);

  const tabs = [
    t("tabs.courses", "Курсы"),
    t("tabs.performance", "Успеваемость"),
    t("tabs.analytics", "Аналитика"),
    t("tabs.documents", "Документы"),
  ];

  const {
    data: profile,
    isLoading,
    isError,
    refetch,
  } = useMentorProfile(Number.isFinite(numericId) ? numericId : undefined);

  const { data: analytics } = useMentorAnalytics(Number.isFinite(numericId) ? numericId : undefined);

  const backLink = (
    <Link
      to="/mentors"
      className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
    >
      <ArrowLeft size={16} /> {t("common:nav.mentors", "Преподаватели")}
    </Link>
  );

  if (!numericId || Number.isNaN(numericId)) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <div className="rounded-2xl border border-border bg-card p-6 text-muted">
          {t("notFound", "Преподаватель не найден")}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <div className="rounded-2xl border border-border bg-card p-6 text-muted">{t("common:loading", "Загрузка…")}</div>
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted">{t("loadError", "Не удалось загрузить профиль ментора")}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg border border-border-warm bg-card px-3 py-2 text-sm font-medium text-ink hover:bg-strip"
          >
            {t("common:retry", "Повторить")}
          </button>
        </div>
      </div>
    );
  }

  const { user, active_courses, active_students_count, avg_score } = profile;

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
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border-warm bg-card p-5">
          <p className="text-sm text-muted">{t("activeCoursesCount")}</p>
          <p className="mt-2 text-[32px] font-bold text-ink">{active_courses.length}</p>
        </div>
        <div className="rounded-xl border border-border-warm bg-card p-5">
          <p className="text-sm text-muted">{t("avgStudentScore")}</p>
          <p className="mt-2 text-[32px] font-bold text-ink">{avg_score.toFixed(1)}</p>
        </div>
        <div className="rounded-xl border border-border-warm bg-card p-5">
          <p className="text-sm text-muted">{t("activeStudentsCount")}</p>
          <p className="mt-2 text-[32px] font-bold text-ink">{active_students_count}</p>
        </div>
      </div>

      <div className="flex items-center gap-6 border-b border-border-warm">
        {tabs.map((tabLabel, idx) => (
          <button
            key={tabLabel}
            type="button"
            onClick={() => setTabIndex(idx)}
            className={[
              "relative pb-3 text-sm font-medium transition-colors duration-150",
              tabIndex === idx ? "text-blue-600 font-semibold" : "text-muted hover:text-ink",
            ].join(" ")}
          >
            {tabLabel}
            {tabIndex === idx && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-blue-600" />}
          </button>
        ))}
      </div>

      {tabIndex === 0 && (
        <div className="flex flex-col gap-4">
          {active_courses.length === 0 ? (
            <div className="rounded-xl border border-border-warm bg-card p-6 text-center text-sm text-muted">
              {t("noActiveCourses")}
            </div>
          ) : (
            active_courses.map((course) => <CourseCard key={course.id} course={course} />)
          )}
        </div>
      )}

      {tabIndex === 1 && (
        <div className="flex flex-col gap-5">
          <div className="rounded-xl border border-border-warm bg-card p-6">
            <h3 className="text-base font-bold text-ink flex items-center gap-2 mb-4">
              <Award size={18} className="text-maroon" /> {t("performanceTitle")}
            </h3>
            <p className="text-xs text-muted mb-4">
              {t("performanceSubtitle")}
            </p>
            <div className="flex items-center gap-4 rounded-xl bg-beige/50 p-4">
              <div className="text-3xl font-bold text-ink">{avg_score.toFixed(1)} / 100</div>
              <div className="text-xs text-muted border-l border-border-warm pl-4">
                {t("performanceHelp")}
              </div>
            </div>
          </div>
        </div>
      )}

      {tabIndex === 2 && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-xl border border-border-warm bg-card p-5">
              <div className="rounded-lg bg-blue-50 p-3 text-blue-600">
                <BookOpen size={24} />
              </div>
              <div>
                <p className="text-xs text-muted">{t("activeCoursesCount")}</p>
                <p className="text-xl font-bold text-ink">
                  {analytics ? analytics.active_courses_count : active_courses.length}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-border-warm bg-card p-5">
              <div className="rounded-lg bg-emerald-50 p-3 text-emerald-600">
                <Users size={24} />
              </div>
              <div>
                <p className="text-xs text-muted font-medium">{t("totalStudents")}</p>
                <p className="text-xl font-bold text-ink">
                  {analytics ? analytics.total_students_count : active_students_count}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-border-warm bg-card p-5">
              <div className="rounded-lg bg-amber-50 p-3 text-amber-600">
                <TrendingUp size={24} />
              </div>
              <div>
                <p className="text-xs text-muted font-medium">{t("avgGroupScore")}</p>
                <p className="text-xl font-bold text-ink">
                  {analytics ? analytics.average_student_score.toFixed(1) : avg_score.toFixed(1)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {tabIndex === 3 && (
        <DocumentsTab ownerType="mentor" ownerId={user.id} />
      )}
    </div>
  );
}

