import React, { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCourseClassProgress, useCourseStaffProgress } from "../../lib/courses/hooks";
import type { CourseStaffProgressResponse } from "../../lib/courses/types";
import { JournalProgressRules, type ProgressChartStudent, type ProgressPeriodRow } from "../../lib/journals/JournalProgressRules";
import { getSchoolCalendarDate } from "../../i18n/formatters";
import { JournalChartPreference } from "../../lib/journals/JournalChartPreference";
import { ErrorState } from "../ui/ErrorState";
import { SectionCard } from "../ui/SectionCard";
import { PanelSkeleton, StaleNotice } from "../pane/PaneStates";
import { ProgressChart } from "./JournalProgressChart";
import { JournalProgressLegend } from "./JournalProgressLegend";

interface JournalProgressViewProps {
  courseId: number;
  readOnlySelfStudentId?: number;
}

export const JournalProgressView: React.FC<JournalProgressViewProps> = ({ courseId, readOnlySelfStudentId }) => {
  const { t } = useTranslation(["journals", "common"]);
  const selfStudentId: number | null = readOnlySelfStudentId ?? null;
  const staffQuery = useCourseStaffProgress(courseId, selfStudentId === null);
  const classQuery = useCourseClassProgress(courseId, selfStudentId !== null);
  const query = selfStudentId === null ? staffQuery : classQuery;
  const [visibleOverride, setVisibleOverride] = useState<Set<number> | null>(null);
  const [showAverage, setShowAverage] = useState<boolean>(true);
  const [showMaximum, setShowMaximum] = useState<boolean>(true);
  const [collapsed, setCollapsed] = useState<boolean>(() => JournalChartPreference.readStored() ?? false);

  const data: CourseStaffProgressResponse | undefined = query.data;
  const rows: ProgressPeriodRow[] = useMemo(() => (data ? JournalProgressRules.buildPeriodRows(data, getSchoolCalendarDate()) : []), [data]);
  const started: ProgressPeriodRow[] = useMemo(() => JournalProgressRules.startedRows(rows), [rows]);
  const students: ProgressChartStudent[] = useMemo(() => {
    if (!data) return [];
    const everyone: ProgressChartStudent[] = JournalProgressRules.chartStudents(data, started);
    return selfStudentId === null ? everyone : JournalProgressRules.onlyStudent(everyone, selfStudentId);
  }, [data, started, selfStudentId]);
  const visibleIds: Set<number> = useMemo(
    () => visibleOverride ?? JournalProgressRules.defaultVisibleIds(students, selfStudentId),
    [visibleOverride, students, selfStudentId],
  );

  const toggleStudent = (studentId: number): void => {
    const next: Set<number> = new Set(visibleIds);
    if (next.has(studentId)) next.delete(studentId);
    else next.add(studentId);
    setVisibleOverride(next);
  };
  const toggleCollapsed = (): void => {
    const next: boolean = !collapsed;
    setCollapsed(next);
    JournalChartPreference.writeCollapsed(next);
  };

  if (query.isError && !data) {
    return (
      <SectionCard title={t("journals:progress.scope")}>
        <ErrorState
          title={t("journals:workspace.progressLoadFailed")}
          message={t(selfStudentId === null ? "journals:progress.loadFailedBody" : "journals:progress.loadFailedBodyStudent")}
          onRetry={() => void query.refetch()}
        />
      </SectionCard>
    );
  }
  if (query.isLoading || !data) {
    return (
      <div data-testid="journal-progress-skeleton">
        <SectionCard title={t("journals:progress.scope")}>
          <PanelSkeleton label={t("common:loading")} rows={3} />
        </SectionCard>
      </div>
    );
  }

  const hasGradedData: boolean = started.some((_, periodIndex) => students.some((student) => student.results[periodIndex] !== null));
  if (!hasGradedData) return selfStudentId === null ? null : <p data-testid="progress-no-graded" className="text-sm text-muted">{t("journals:progress.noGradedYet")}</p>;

  return (
    <div data-testid="journal-progress">
      <SectionCard
        title={t("journals:progress.scope")}
        info={t("journals:progress.scopeNote")}
        actions={
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-label={t("journals:progress.scope")}
            onClick={toggleCollapsed}
            data-testid="progress-collapse-toggle"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] text-muted hover:bg-strip hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown aria-hidden="true" className={`h-4 w-4 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out ${collapsed ? "-rotate-90" : ""}`} />
          </button>
        }
      >
        {query.isError && <StaleNotice message={t("journals:progress.refreshFailed")} onRetry={() => void query.refetch()} />}
        {!collapsed && (
          <>
            <ProgressChart periods={started} students={students} visibleIds={visibleIds} showAverage={showAverage} showMaximum={showMaximum} selfStudentId={selfStudentId} dense={selfStudentId === null} />
            <JournalProgressLegend
              students={students}
              visibleIds={visibleIds}
              selfStudentId={selfStudentId}
              showAverage={showAverage}
              showMaximum={showMaximum}
              onToggleAverage={() => setShowAverage((current) => !current)}
              onToggleMaximum={() => setShowMaximum((current) => !current)}
              onToggleStudent={toggleStudent}
              onVisibleChange={setVisibleOverride}
            />
          </>
        )}
      </SectionCard>
    </div>
  );
};
