import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useCourse, useCourseJournals, useCourseProgressChart } from "../lib/courses/hooks";
import { useMentorProfile } from "../lib/users/hooks";
import { useCourseRoster } from "../lib/enrollments/hooks";
import { resolveMediaUrl } from "../lib/users/media";
import { PersonAvatar } from "../components/ui/PersonAvatar";
import { Button } from "../components/ui/Button";
import { Toast } from "../components/ui/Toast";
import { JournalScoreChart } from "../components/journals/JournalScoreChart";
import { JournalPeriodSection } from "../components/journals/JournalPeriodSection";
import { useTranslation } from "react-i18next";

/** Today's date at midnight, for comparing against a period's `period_end` to find the "current" one. */
function todayDateOnly(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function JournalDetail() {
  const { t } = useTranslation(["journals", "common"]);
  const { id } = useParams<{ id: string }>();
  const numericId = id ? Number(id) : undefined;
  const courseId = Number.isFinite(numericId) ? numericId : undefined;

  const { data: course, isLoading: courseLoading, isError: courseError, refetch: refetchCourse } = useCourse(courseId);
  const { data: mentorProfile } = useMentorProfile(course?.mentor_id);
  const { rows: roster } = useCourseRoster(courseId);
  const {
    data: periods,
    isLoading: periodsLoading,
    isError: periodsError,
    refetch: refetchPeriods,
  } = useCourseJournals(courseId);
  const { data: progressChart } = useCourseProgressChart(courseId);

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

  const orderedPeriods = useMemo(() => [...(periods ?? [])].sort((a, b) => a.period_start.localeCompare(b.period_start)), [periods]);

  const defaultExpandedId = useMemo(() => {
    if (orderedPeriods.length === 0) return undefined;
    const today = todayDateOnly();
    const current = orderedPeriods.find((p) => p.period_end >= today);
    return (current ?? orderedPeriods[orderedPeriods.length - 1]).id;
  }, [orderedPeriods]);

  const [expandedId, setExpandedId] = useState<number | undefined>(undefined);
  const effectiveExpandedId = expandedId ?? defaultExpandedId;

  const backLink = (
    <Link to="/journals" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline">
      <ArrowLeft size={16} /> {t("backToJournals")}
    </Link>
  );

  if (!courseId) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <div className="rounded-2xl border border-border bg-card p-6 text-muted">{t("notFound")}</div>
      </div>
    );
  }

  if (courseLoading) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <div className="rounded-2xl border border-border bg-card p-6 text-muted">{t("common:loading")}</div>
      </div>
    );
  }

  if (courseError || !course) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted">{t("loadFailedCourse")}</p>
          <Button type="button" variant="secondary" onClick={() => refetchCourse()}>
            {t("common:retry")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {backLink}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink">{course.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {mentorProfile && (
              <span className="flex items-center gap-2">
                <PersonAvatar
                  firstName={mentorProfile.user.first_name}
                  lastName={mentorProfile.user.last_name}
                  photoUrl={resolveMediaUrl(mentorProfile.user.thumbnail_path ?? mentorProfile.user.photo_path) ?? undefined}
                  size={24}
                />
                <span className="text-sm text-nav">
                  {mentorProfile.user.first_name} {mentorProfile.user.last_name}
                </span>
              </span>
            )}
            <span className="text-sm text-muted">{t("studentsCount", { count: roster.length })}</span>
          </div>
        </div>
      </div>

      <JournalScoreChart data={progressChart} />

      {periodsLoading ? (
        <div className="rounded-xl border border-border-warm bg-card p-6 text-center text-sm text-muted">
          {t("common:loading")}
        </div>
      ) : periodsError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border-warm bg-card p-6 text-center">
          <p className="text-sm text-muted">{t("loadFailed")}</p>
          <Button type="button" variant="secondary" onClick={() => refetchPeriods()}>
            {t("common:retry")}
          </Button>
        </div>
      ) : orderedPeriods.length === 0 ? (
        <div className="rounded-xl border border-border-warm bg-card p-8 text-center text-sm text-muted">
          {t("noPeriodsYet")}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {[...orderedPeriods].reverse().map((period) => {
            const periodIndex = orderedPeriods.findIndex((p) => p.id === period.id) + 1;
            return (
              <JournalPeriodSection
                key={period.id}
                courseId={courseId}
                period={period}
                periodIndex={periodIndex}
                expanded={effectiveExpandedId === period.id}
                onToggle={() =>
                  setExpandedId((current) => {
                    const currentlyExpanded = current ?? defaultExpandedId;
                    return currentlyExpanded === period.id ? -1 : period.id;
                  })
                }
                onToast={showToast}
              />
            );
          })}
        </div>
      )}

      <Toast message={toast.message} show={toast.visible} variant={toast.variant} />
    </div>
  );
}
