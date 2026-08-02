import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BookOpen, Calendar, Copy, Pencil, Trash2 } from "lucide-react";
import {
  useCopyCourse,
  useCourse,
  useCourseMentorHistory,
  useCourseProgressChart,
  useCourseSchedule,
  useDeleteCourse,
} from "../lib/courses/hooks";
import { buildCourseCreatePayload, buildCourseFormValues } from "../lib/courses/formMapping";
import { useMentorProfile } from "../lib/users/hooks";
import { dateOnlyToDate } from "../lib/users/dates";
import { resolveMediaUrl } from "../lib/users/media";
import { formatMoney } from "../lib/money";
import { PersonAvatar } from "../components/ui/PersonAvatar";
import { Button } from "../components/ui/Button";
import { Toast } from "../components/ui/Toast";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { CourseFormPanel } from "../components/courses/CourseFormPanel";
import { CourseProgressChart } from "../components/courses/CourseProgressChart";
import { CourseRosterSection } from "../components/courses/CourseRosterSection";

import { useAuthStore } from "../store/authStore";

function formatDateOnly(dateStr: string, locale: string = "ru-RU"): string {
  const date = dateOnlyToDate(dateStr);
  if (!date) return dateStr;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" })
    .format(date)
    .replace(/\s*г\.$/, "");
}

function formatTime(value: string): string {
  return value.slice(0, 5); // "HH:MM:SS" -> "HH:MM"
}

function formatAssignedRange(
  from: string,
  to: string | null,
  locale: string,
  formatToPresent: (start: string) => string,
): string {
  const start = new Date(from).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
  if (!to) return formatToPresent(start);
  const end = new Date(to).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${start} – ${end}`;
}

export function CourseProfile() {
  const { t, i18n } = useTranslation(["courses", "common"]);
  const role = useAuthStore((s) => s.role);
  const isSuperAdmin = role === "superadmin";
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const numericId = id ? Number(id) : undefined;
  const courseId = Number.isFinite(numericId) ? numericId : undefined;

  // 0=Mon … 6=Sun — must match ScheduleEditor DAYS array convention
  const dayLabels = [
    t("days.mon", "Пн"),
    t("days.tue", "Вт"),
    t("days.wed", "Ср"),
    t("days.thu", "Чт"),
    t("days.fri", "Пт"),
    t("days.sat", "Сб"),
    t("days.sun", "Вс"),
  ];

  const examTypeLabels: Record<"weekly" | "monthly", string> = {
    weekly: t("examTypeLabel.weekly", "Еженедельный экзамен"),
    monthly: t("examTypeLabel.monthly", "Ежемесячный экзамен"),
  };

  const { data: course, isLoading, isError, refetch } = useCourse(courseId);
  const { data: schedule } = useCourseSchedule(courseId);
  const { data: mentorHistory } = useCourseMentorHistory(courseId, isSuperAdmin);
  const { data: progressChart } = useCourseProgressChart(courseId);
  const { data: mentorProfile } = useMentorProfile(course?.mentor_id);

  const copyCourse = useCopyCourse();
  const deleteCourse = useDeleteCourse();

  const [editOpen, setEditOpen] = useState(false);
  const [copyConfirmOpen, setCopyConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; visible: boolean; variant: "success" | "error" }>({
    message: "",
    visible: false,
    variant: "success",
  });
  const toastTimeoutRef = useRef<number | undefined>(undefined);

  const showToast = (message: string, variant: "success" | "error" = "success") => {
    setToast({ message, visible: true, variant });
    window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  };

  const handleCopy = () => {
    if (!course || !schedule) return;
    const base = buildCourseFormValues(course);
    const payload = buildCourseCreatePayload({
      ...base,
      title: `${course.title} (${t("copySuffix", "копия")})`,
      schedules: schedule.map((s) => ({
        day_of_week: String(s.day_of_week),
        time_start: formatTime(s.time_start),
        time_end: formatTime(s.time_end),
      })),
    });

    copyCourse.mutate(
      { id: course.id, payload },
      {
        onSuccess: (created) => {
          setCopyConfirmOpen(false);
          showToast(t("courseCopied", "Курс скопирован"));
          navigate(`/courses/${created.id}`);
        },
        onError: () => showToast(t("courseCopyError", "Не удалось скопировать курс"), "error"),
      },
    );
  };

  const handleDelete = () => {
    if (!course) return;
    deleteCourse.mutate(course.id, {
      onSuccess: () => navigate("/courses"),
      onError: () => showToast(t("courseDeleteError", "Не удалось удалить курс"), "error"),
    });
  };

  const backLink = (
    <Link to="/courses" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline">
      <ArrowLeft size={16} /> {t("common:nav.courses", "Курсы")}
    </Link>
  );

  if (!courseId) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <div className="rounded-2xl border border-border bg-card p-6 text-muted">{t("notFound", "Курс не найден")}</div>
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

  if (isError || !course) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted">{t("loadError", "Не удалось загрузить курс")}</p>
          <Button type="button" variant="secondary" onClick={() => refetch()}>
            {t("common:retry", "Повторить")}
          </Button>
        </div>
      </div>
    );
  }

  const isActive = course.status === "active";

  return (
    <div className="flex flex-col gap-5">
      {backLink}

      <div className="overflow-hidden rounded-xl border border-border-warm bg-card">
        {course.photo_path && (
          <div className="h-44 w-full overflow-hidden border-b border-border-warm bg-strip">
            <img
              src={resolveMediaUrl(course.photo_path) ?? undefined}
              alt={course.title}
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={[
                  "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
                  isActive ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-600",
                ].join(" ")}
              >
                {isActive ? t("common:enums.courseStatus.active", "Активен") : t("common:enums.courseStatus.archived", "Архив")}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                {examTypeLabels[course.exam_type]}
              </span>
            </div>
            <h1 className="mt-1.5 text-xl font-bold text-ink">{course.title}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">{course.description}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              to={`/journals/${course.id}`}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-xs transition-colors duration-150 hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              <BookOpen size={16} />
              <span>{t("openJournal", "Журнал курса")}</span>
            </Link>
            {isSuperAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  aria-label={t("common:edit", "Редактировать")}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-strip hover:text-ink"
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setCopyConfirmOpen(true)}
                  aria-label={t("duplicate", "Дублировать")}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-strip hover:text-ink"
                >
                  <Copy size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(true)}
                  aria-label={t("common:delete", "Удалить")}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-red-600 transition-colors duration-150 hover:bg-red-50"
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-beige px-6 py-4">
          {mentorProfile && (
            <span className="flex items-center gap-2">
              <PersonAvatar
                firstName={mentorProfile.user.first_name}
                lastName={mentorProfile.user.last_name}
                photoUrl={resolveMediaUrl(mentorProfile.user.thumbnail_path ?? mentorProfile.user.photo_path) ?? undefined}
                size={28}
              />
              <span className="text-sm text-nav">
                {mentorProfile.user.first_name} {mentorProfile.user.last_name}
              </span>
            </span>
          )}
          <span className="flex items-center gap-1.5 text-sm text-nav">
            <Calendar size={14} />
            {formatDateOnly(course.start_date, i18n.language)} – {formatDateOnly(course.end_date, i18n.language)}
          </span>
          <span className="ml-auto whitespace-nowrap text-[17px] font-bold tabular-nums text-maroon">
            {formatMoney(course.price, { suffix: ` TJS/${t("month", "мес")}` })}
          </span>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${isSuperAdmin ? "lg:grid-cols-2" : ""}`}>
        <div className="rounded-xl border border-border-warm bg-card p-5">
          <h3 className="text-[15px] font-semibold text-ink">{t("schedule", "Расписание")}</h3>
          {!schedule || schedule.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{t("noSchedule", "Расписание не задано")}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {schedule.map((row) => (
                <li key={row.id} className="flex items-center justify-between rounded-lg bg-strip px-3 py-2 text-sm">
                  <span className="font-medium text-ink">{dayLabels[row.day_of_week] ?? row.day_of_week}</span>
                  <span className="text-nav">
                    {formatTime(row.time_start)} – {formatTime(row.time_end)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {isSuperAdmin && (
          <div className="rounded-xl border border-border-warm bg-card p-5">
            <h3 className="text-[15px] font-semibold text-ink">{t("mentorHistory", "История менторов")}</h3>
            {!mentorHistory || mentorHistory.length === 0 ? (
              <p className="mt-3 text-sm text-muted">{t("noMentorHistory", "Смен ментора не было")}</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {mentorHistory.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3 rounded-lg bg-strip px-3 py-2">
                    <PersonAvatar firstName={entry.mentor.first_name} lastName={entry.mentor.last_name} size={26} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {entry.mentor.first_name} {entry.mentor.last_name}
                      </p>
                      <p className="text-xs text-muted">
                        {formatAssignedRange(entry.assigned_from, entry.assigned_to, i18n.language, (start) =>
                          t("assignedFromPresent", { start, defaultValue: `с ${start} — по наст. время` }),
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {progressChart && <CourseProgressChart data={progressChart} />}

      <CourseRosterSection courseId={course.id} onToast={showToast} />

      <CourseFormPanel
        open={editOpen}
        course={course}
        onClose={() => setEditOpen(false)}
        onSaved={() => showToast(t("courseUpdated", "Курс обновлён"))}
      />

      <ConfirmDialog
        open={copyConfirmOpen}
        title={t("duplicateTitle", "Дублировать курс")}
        message={t("duplicateMsg", { title: course.title, defaultValue: `Создать копию курса «${course.title}» с тем же расписанием, ценой и ментором?` })}
        confirmLabel={t("duplicate", "Дублировать")}
        pending={copyCourse.isPending}
        onConfirm={handleCopy}
        onCancel={() => setCopyConfirmOpen(false)}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title={t("deleteTitle", "Удалить курс")}
        message={t("deleteMsg", { title: course.title, defaultValue: `Удалить курс «${course.title}»? Это действие нельзя отменить.` })}
        pending={deleteCourse.isPending}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      <Toast message={toast.message} show={toast.visible} variant={toast.variant} />
    </div>
  );
}
