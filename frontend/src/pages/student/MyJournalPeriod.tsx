import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import { useJournal } from "../../lib/journals/hooks";
import { useCourse } from "../../lib/courses/hooks";
import { formatDate } from "../../i18n/formatters";
import { ScoreBreakdown } from "../../components/student/ScoreBreakdown";

export function MyJournalPeriod() {
  const { journalId } = useParams<{ journalId: string }>();
  const numericJournalId = journalId ? Number(journalId) : undefined;
  const { t, i18n } = useTranslation(["student", "journals", "common"]);
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});

  const { data: journal, isLoading, isError, refetch } = useJournal(numericJournalId);
  const { data: course } = useCourse(journal?.course_id);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 animate-pulse">
        <div className="h-6 w-32 rounded bg-card" />
        <div className="h-20 rounded-2xl bg-card border border-border-warm" />
        <div className="h-48 rounded-2xl bg-card border border-border-warm" />
        <div className="h-64 rounded-2xl bg-card border border-border-warm" />
      </div>
    );
  }

  if (isError || !journal || !journal.students || journal.students.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Link to="/my/courses" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-maroon hover:underline">
          <ArrowLeft size={16} /> {t("backToCourses", "К списку курсов")}
        </Link>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted">{t("common:error", "Период журнала не найден")}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg border border-border-warm bg-card px-4 py-2 text-sm font-medium text-ink hover:bg-strip"
          >
            {t("common:retry", "Повторить")}
          </button>
        </div>
      </div>
    );
  }

  const studentData = journal.students?.[0];
  const entriesMap = new Map((studentData?.entries || []).map((e) => [e.lesson_date, e]));

  const toggleComment = (dateStr: string) => {
    setExpandedComments((prev) => ({ ...prev, [dateStr]: !prev[dateStr] }));
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 5.4.1 Header */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border-warm bg-card p-6">
        <Link
          to={journal.course_id ? `/my/courses/${journal.course_id}` : "/my/courses"}
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-maroon dark:text-accent hover:underline"
        >
          <ArrowLeft size={16} /> {course ? course.title : t("backToCourse", "К курсу")}
        </Link>

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-ink">{journal.period_label}</h1>
            <p className="mt-0.5 text-xs text-muted">
              {formatDate(journal.period_start, i18n.language)} – {formatDate(journal.period_end, i18n.language)}
              {course && ` · ${course.title}`}
            </p>
          </div>
        </div>
      </div>

      {/* 5.4.2 Score breakdown */}
      {studentData?.summary && (
        <ScoreBreakdown
          summary={studentData.summary}
          myRank={journal.my_rank}
          classSize={journal.class_size}
          classAvgPercentage={journal.class_avg_percentage}
        />
      )}

      {/* 5.4.3 Lesson list */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border-warm bg-card p-5">
        <h3 className="text-base font-bold text-ink">{t("lessonsList", "Занятия и оценки")}</h3>

        <div className="flex flex-col divide-y divide-border-warm/60">
          {journal.lesson_dates.map((dateStr) => {
            const entry = entriesMap.get(dateStr);
            const isUpcoming = !entry;
            const isAbsent = entry && !entry.attendance;
            const isExpanded = expandedComments[dateStr];
            const hasComment = entry && entry.comment && entry.comment.trim().length > 0;
            const isLongComment = hasComment && entry.comment!.length > 60;

            return (
              <div
                key={dateStr}
                className={[
                  "flex flex-col gap-1.5 py-3 px-2 rounded-xl transition-colors",
                  isAbsent ? "bg-strip opacity-85" : isUpcoming ? "opacity-60" : "hover:bg-row-hover",
                ].join(" ")}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums text-ink">
                      {formatDate(dateStr, i18n.language)}
                    </span>

                    {isUpcoming ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted">
                        <Clock size={14} /> {t("upcomingLesson", "Предстоит")}
                      </span>
                    ) : entry.attendance ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle2 size={16} /> {t("attended", "Был(а)")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
                        <XCircle size={16} /> {t("absent", "Пропуск")}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold tabular-nums text-ink">
                      {isUpcoming ? "—" : entry.score}
                    </span>
                  </div>
                </div>

                {/* Mentor comment */}
                {hasComment && entry && (
                  <div className="mt-1 flex flex-col gap-1 text-xs text-muted bg-beige/60 p-2.5 rounded-xl border border-border-warm/40">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`italic ${!isExpanded && isLongComment ? "line-clamp-2" : ""}`}>
                        <MessageSquare size={13} className="inline mr-1.5 text-maroon dark:text-accent" />
                        {entry.comment}
                      </p>
                      {isLongComment && (
                        <button
                          type="button"
                          onClick={() => toggleComment(dateStr)}
                          className="shrink-0 text-[11px] font-semibold text-maroon dark:text-accent hover:underline flex items-center gap-0.5"
                        >
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
