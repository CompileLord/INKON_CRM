import { Link } from "react-router-dom";
import { BookOpen, Calendar, ChevronRight, Award, CheckCircle2, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMyStudentProfile, useMyStudentJournals, useMentorProfile } from "../../lib/users/hooks";
import { resolveMediaUrl } from "../../lib/users/media";
import { formatDate } from "../../i18n/formatters";
import { PersonAvatar } from "../ui/PersonAvatar";
import { StudentCourseCard } from "../student/StudentCourseCard";
import { ScoreBreakdown } from "../student/ScoreBreakdown";
import { StudentEmptyState } from "../student/StudentEmptyState";

function SoonestLessonCard({ course, nextLessonAt }: { course: any; nextLessonAt: string }) {
  const { t, i18n } = useTranslation(["student", "common"]);
  const { data: mentorProfile } = useMentorProfile(course.mentor_id);
  const mentorUser = mentorProfile?.user;

  return (
    <div className="rounded-2xl border border-border-warm bg-card p-4 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-beige text-maroon dark:text-accent">
          <Clock size={20} />
        </div>
        <div>
          <span className="text-xs font-medium text-muted uppercase tracking-wide">{t("nextLesson", "Следующее занятие")}</span>
          <h4 className="text-sm font-semibold text-ink">{course.title}</h4>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {mentorUser && (
          <div className="flex items-center gap-2 rounded-xl bg-strip px-3 py-1.5 border border-border-warm">
            <PersonAvatar
              firstName={mentorUser.first_name}
              lastName={mentorUser.last_name}
              photoUrl={resolveMediaUrl(mentorUser.thumbnail_path ?? mentorUser.photo_path) ?? undefined}
              size={24}
            />
            <span className="text-xs font-semibold text-ink">
              {mentorUser.first_name} {mentorUser.last_name}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 rounded-xl bg-strip px-3 py-1.5 text-xs font-semibold text-ink tabular-nums">
          <Calendar size={14} className="text-muted" />
          {formatDate(nextLessonAt, i18n.language)}
        </div>
      </div>
    </div>
  );
}

export function StudentDashboard() {
  const { t } = useTranslation(["student", "dashboard", "common"]);
  const { data: profile, isLoading: isProfileLoading, isError: isProfileError, refetch: refetchProfile } = useMyStudentProfile();
  const { data: journals, isLoading: isJournalsLoading } = useMyStudentJournals();

  if (isProfileLoading) {
    return (
      <div className="flex flex-col gap-5 animate-pulse">
        <div className="h-20 rounded-2xl bg-card border border-border-warm" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-card border border-border-warm" />
          ))}
        </div>
      </div>
    );
  }

  if (isProfileError || !profile) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted">{t("common:error", "Произошла ошибка при загрузке данных")}</p>
        <button
          type="button"
          onClick={() => refetchProfile()}
          className="rounded-lg border border-border-warm bg-card px-4 py-2 text-sm font-medium text-ink hover:bg-strip"
        >
          {t("common:retry", "Повторить")}
        </button>
      </div>
    );
  }

  const { user, totals, courses } = profile;
  const activeCourses = courses.filter((c) => c.bucket === "active");

  // Find soonest next_lesson_at
  const activeWithLessons = activeCourses
    .filter((c) => c.next_lesson_at !== null)
    .sort((a, b) => new Date(a.next_lesson_at!).getTime() - new Date(b.next_lesson_at!).getTime());
  const soonestLessonCourse = activeWithLessons[0];

  // Latest graded period
  const gradedJournals = (journals || []).filter((j) => j.state === "graded");
  const latestGradedPeriod = gradedJournals[0];

  return (
    <div className="flex flex-col gap-6">
      {/* 5.1.1 Identity strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border-warm bg-card p-4">
        <div className="flex items-center gap-3.5">
          <PersonAvatar
            firstName={user.first_name}
            lastName={user.last_name}
            photoUrl={resolveMediaUrl(user.thumbnail_path ?? user.photo_path) ?? undefined}
            size={48}
          />
          <div>
            <h2 className="text-lg font-semibold text-ink">
              {user.first_name} {user.last_name}
            </h2>
            <p className="text-xs text-muted">
              {t("activeCoursesSummary", "{{count}} активных курсов", { count: totals.active_course_count })}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40">
          <CheckCircle2 size={14} /> {t("activeStudent", "Активный студент")}
        </span>
      </div>

      {/* 5.1.2 Stat row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-border-warm bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted">{t("average", "Средний балл")}</p>
          <p className="mt-1 text-[28px] font-bold tabular-nums text-ink">{totals.avg_percentage.toFixed(1)}%</p>
        </div>
        <div className="rounded-2xl border border-border-warm bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted">{t("attendance", "Посещаемость")}</p>
          <p className="mt-1 text-[28px] font-bold tabular-nums text-ink">{totals.attendance_percentage.toFixed(1)}%</p>
        </div>
        <div className="rounded-2xl border border-border-warm bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted">{t("absences", "Пропуски")}</p>
          <p className="mt-1 text-[28px] font-bold tabular-nums text-ink">{totals.absences}</p>
          <p className="text-xs text-muted">{t("ofLessons", "из {{total}} занятий", { total: totals.total_lessons })}</p>
        </div>
        <Link
          to="/my/courses"
          className="group rounded-2xl border border-border-warm bg-card p-4 transition-colors hover:bg-row-hover"
        >
          <p className="text-xs uppercase tracking-wide text-muted">{t("activeCoursesCount", "Активные курсы")}</p>
          <div className="mt-1 flex items-baseline justify-between">
            <p className="text-[28px] font-bold tabular-nums text-ink">{totals.active_course_count}</p>
            <ChevronRight size={18} className="text-muted group-hover:text-ink transition-transform group-hover:translate-x-0.5" />
          </div>
        </Link>
      </div>

      {/* 5.1.3 Next lesson card */}
      {soonestLessonCourse && soonestLessonCourse.next_lesson_at && (
        <SoonestLessonCard course={soonestLessonCourse.course} nextLessonAt={soonestLessonCourse.next_lesson_at} />
      )}

      {/* 5.1.4 Active courses rail */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-ink flex items-center gap-2">
            <BookOpen size={18} className="text-maroon dark:text-accent" /> {t("myCourses", "Мои курсы")}
          </h3>
          <Link to="/my/courses" className="text-xs font-semibold text-maroon hover:underline dark:text-accent">
            {t("allCoursesLink", "Все →")}
          </Link>
        </div>

        {activeCourses.length === 0 ? (
          <StudentEmptyState
            title={t("noCoursesTitle", "Вы пока не зачислены ни на один курс")}
            body={t("noCoursesBody", "Ваш координатор добавит вас после подтверждения записи.")}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {activeCourses.slice(0, 3).map((entry) => (
              <StudentCourseCard key={entry.course.id} entry={entry} variant="active" />
            ))}
          </div>
        )}
      </div>

      {/* 5.1.5 Latest graded period */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-ink flex items-center gap-2">
            <Award size={18} className="text-amber-500" /> {t("latestGradedPeriod", "Последний оцененный период")}
          </h3>
          {latestGradedPeriod && (
            <Link
              to={`/my/journal/${latestGradedPeriod.journal_id}`}
              className="text-xs font-semibold text-maroon hover:underline dark:text-accent"
            >
              {t("journalDetails", "Подробнее →")}
            </Link>
          )}
        </div>

        {isJournalsLoading ? (
          <div className="h-36 rounded-2xl bg-card border border-border-warm animate-pulse" />
        ) : latestGradedPeriod ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-muted px-1">
              <span className="font-semibold text-ink">{latestGradedPeriod.course_title}</span>
              <span>{latestGradedPeriod.period_label}</span>
            </div>
            <ScoreBreakdown
              summary={{
                id: 0,
                journal_id: latestGradedPeriod.journal_id,
                homework_score: latestGradedPeriod.homework_score ?? 0,
                attendance_score: latestGradedPeriod.attendance_score ?? 0,
                exam_score: latestGradedPeriod.exam_score ?? 0,
                bonus_score: latestGradedPeriod.bonus_score ?? 0,
                sum_score: latestGradedPeriod.sum_score,
                max_period_score: latestGradedPeriod.max_period_score,
                percentage: latestGradedPeriod.percentage,
                attendance_count: latestGradedPeriod.attendance_count,
                total_lessons: latestGradedPeriod.total_lessons,
                version: 1,
              }}
            />
          </div>
        ) : (
          <StudentEmptyState
            title={t("noGradesTitle", "Оценок пока нет")}
            body={t("noGradesBody", "Ваш первый период появится здесь, как только преподаватель поставит оценки.")}
          />
        )}
      </div>
    </div>
  );
}
