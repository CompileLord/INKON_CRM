import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { useCourse, useCourseSchedule, useCourseProgressChart } from "../../lib/courses/hooks";
import { useMyStudentProfile, useMyStudentJournals, useMentorProfile } from "../../lib/users/hooks";
import { resolveMediaUrl } from "../../lib/users/media";
import { formatDate, formatTime } from "../../i18n/formatters";
import type { StudentCourseProgressChartResponse } from "../../lib/courses/types";
import { PersonAvatar } from "../../components/ui/PersonAvatar";
import { StudentTrendChart } from "../../components/student/StudentTrendChart";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MyCourseDetail() {
  const { courseId } = useParams<{ courseId: string }>();
  const numericCourseId = courseId ? Number(courseId) : undefined;
  const { t, i18n } = useTranslation(["student", "courses", "common"]);
  const [showFullDescription, setShowFullDescription] = useState(false);

  const { data: profile } = useMyStudentProfile();
  const { data: course, isLoading: isCourseLoading, isError } = useCourse(numericCourseId);
  const { data: schedules } = useCourseSchedule(numericCourseId);
  const { data: progressChart, isLoading: isChartLoading } = useCourseProgressChart(numericCourseId);
  const { data: journals, isLoading: isJournalsLoading } = useMyStudentJournals(numericCourseId);

  const mentorId = course?.mentor_id;
  const { data: mentorProfile } = useMentorProfile(mentorId);
  const mentorUser = mentorProfile?.user;

  const courseEntry = profile?.courses.find((c) => c.course.id === numericCourseId);

  if (isCourseLoading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-6 w-32 rounded bg-card" />
        <div className="h-20 rounded-2xl bg-card border border-border-warm" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 h-96 rounded-2xl bg-card border border-border-warm" />
          <div className="h-64 rounded-2xl bg-card border border-border-warm" />
        </div>
      </div>
    );
  }

  if (isError || !course) {
    return (
      <div className="flex flex-col gap-4">
        <Link to="/my/courses" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-maroon hover:underline">
          <ArrowLeft size={16} /> {t("backToCourses", "К списку курсов")}
        </Link>
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted">
          {t("common:error", "Курс не найден")}
        </div>
      </div>
    );
  }

  const todayWeekday = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;

  return (
    <div className="flex flex-col gap-6">
      {/* 5.3.1 Header (full width) */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border-warm bg-card p-6">
        <Link to="/my/courses" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-maroon dark:text-accent hover:underline">
          <ArrowLeft size={16} /> {t("backToCourses", "К списку курсов")}
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-ink">{course.title}</h1>
            <p className="mt-1 text-xs text-muted">
              {t(`common:enums.examType.${course.exam_type}`, course.exam_type)} ·{" "}
              {formatDate(course.start_date, i18n.language)} – {formatDate(course.end_date, i18n.language)}
            </p>
          </div>

          {mentorUser && (
            <div className="flex items-center gap-2.5 rounded-xl border border-border-warm bg-strip px-3 py-2">
              <PersonAvatar
                firstName={mentorUser.first_name}
                lastName={mentorUser.last_name}
                photoUrl={resolveMediaUrl(mentorUser.thumbnail_path ?? mentorUser.photo_path) ?? undefined}
                size={28}
              />
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wide text-muted">{t("mentor", "Преподаватель")}</span>
                <span className="text-xs font-semibold text-ink">
                  {mentorUser.first_name} {mentorUser.last_name}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Column (lg:col-span-2) */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* 5.3.2 My performance strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-border-warm bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">{t("myAverage", "Мой балл")}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
                {courseEntry ? courseEntry.my_avg_percentage.toFixed(1) : "0.0"}%
              </p>
            </div>
            <div className="rounded-2xl border border-border-warm bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">{t("attendance", "Посещаемость")}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
                {courseEntry ? courseEntry.attendance_percentage.toFixed(1) : "100.0"}%
              </p>
            </div>
            <div className="rounded-2xl border border-border-warm bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">{t("absences", "Пропуски")}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
                {courseEntry ? courseEntry.absences : 0}
              </p>
            </div>
            <div className="rounded-2xl border border-border-warm bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">{t("rankInClass", "Ранг в группе")}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
                {courseEntry ? `${courseEntry.my_rank} ${t("common:of", "из")} ${courseEntry.class_size}` : "—"}
              </p>
              {courseEntry && (
                <p className="text-[11px] text-muted tabular-nums">
                  {t("classAvg", "средний")} {courseEntry.class_avg_percentage.toFixed(1)}%
                </p>
              )}
            </div>
          </div>

          {/* 5.3.3 Trend chart */}
          <StudentTrendChart data={progressChart as unknown as StudentCourseProgressChartResponse} isLoading={isChartLoading} />

          {/* 5.3.4 Period list */}
          <div className="flex flex-col gap-3 rounded-2xl border border-border-warm bg-card p-5">
            <h3 className="text-base font-bold text-ink">{t("periodsTitle", "Периоды обучения")}</h3>

            {isJournalsLoading ? (
              <div className="h-32 animate-pulse bg-strip rounded-xl" />
            ) : !journals || journals.length === 0 ? (
              <p className="text-xs text-muted">{t("noPeriods", "Периоды пока не сформированы.")}</p>
            ) : (
              <div className="flex flex-col divide-y divide-border-warm/60">
                {journals.map((j) => {
                  const isUpcoming = j.state === "upcoming";
                  const content = (
                    <div className="flex items-center justify-between py-3 transition-colors hover:bg-row-hover rounded-xl px-2">
                      <div className="flex flex-col">
                        <span className={`text-sm font-semibold ${isUpcoming ? "text-muted" : "text-ink"}`}>
                          {j.period_label}
                        </span>
                        <span className="text-xs text-muted">
                          {formatDate(j.period_start, i18n.language)} – {formatDate(j.period_end, i18n.language)}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold tabular-nums text-ink">
                          {isUpcoming ? "—" : `${j.percentage.toFixed(1)}%`}
                        </span>
                        <span
                          className={[
                            "h-2.5 w-2.5 rounded-full shrink-0",
                            j.state === "graded"
                              ? "bg-emerald-500"
                              : j.state === "in_progress"
                              ? "bg-amber-500"
                              : "bg-border-warm",
                          ].join(" ")}
                          title={t(`state.${j.state}`, j.state)}
                        />
                      </div>
                    </div>
                  );

                  return isUpcoming ? (
                    <div key={j.journal_id} className="cursor-not-allowed opacity-70">
                      {content}
                    </div>
                  ) : (
                    <Link key={j.journal_id} to={`/my/journal/${j.journal_id}`}>
                      {content}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 5.3.5 Sidebar column (lg:col-span-1) */}
        <div className="flex flex-col gap-6 lg:col-span-1">
          {/* Schedule card */}
          <div className="flex flex-col gap-3 rounded-2xl border border-border-warm bg-card p-5">
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              <Clock size={16} className="text-maroon dark:text-accent" />
              {t("weeklySchedule", "Расписание занятий")}
            </h3>

            {!schedules || schedules.length === 0 ? (
              <p className="text-xs text-muted">{t("noSchedule", "Расписание не указано.")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {schedules.map((s) => {
                  const isToday = s.day_of_week === todayWeekday;
                  const weekdayName = t(`weekdays.${s.day_of_week}`, WEEKDAYS[s.day_of_week]);
                  return (
                    <div
                      key={s.id}
                      className={[
                        "flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-colors",
                        isToday ? "bg-beige text-ink font-semibold border border-border-warm" : "bg-strip text-muted",
                      ].join(" ")}
                    >
                      <span>{weekdayName}</span>
                      <span className="tabular-nums">
                        {formatTime(s.time_start, i18n.language)} – {formatTime(s.time_end, i18n.language)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Description card */}
          {course.description && (
            <div className="flex flex-col gap-2 rounded-2xl border border-border-warm bg-card p-5">
              <h3 className="text-sm font-bold text-ink">{t("courseDescription", "О курсе")}</h3>
              <p
                className={[
                  "text-sm text-muted leading-relaxed transition-all",
                  showFullDescription ? "" : "line-clamp-4",
                ].join(" ")}
              >
                {course.description}
              </p>
              {course.description.length > 180 && (
                <button
                  type="button"
                  onClick={() => setShowFullDescription(!showFullDescription)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-maroon dark:text-accent hover:underline mt-1"
                >
                  {showFullDescription ? (
                    <>
                      {t("showLess", "Свернуть")} <ChevronUp size={14} />
                    </>
                  ) : (
                    <>
                      {t("showMore", "Читать далее")} <ChevronDown size={14} />
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
