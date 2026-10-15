import React, { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCourseStaffProgress } from "../../lib/courses/hooks";
import type { CourseStaffProgressResponse, StaffProgressStudent } from "../../lib/courses/types";
import {
  JournalProgressRules,
  type ProgressPeriodRow,
  type StoredPeriodResult,
  type StudentPeriodComparison,
} from "../../lib/journals/JournalProgressRules";
import { formatNumber, formatPercentage, formatSchoolLessonDate, getSchoolCalendarDate } from "../../i18n/formatters";
import { useDesktop } from "../shell/useDesktop";
import { BrandActivityIndicator } from "../ui/BrandActivityIndicator";
import { JournalNotice, JournalPanelMessage } from "./JournalWorkspaceStates";

interface JournalProgressViewProps {
  courseId: number;
}

interface ProgressBarProps {
  percentage: number | null;
  domainMaximum: number;
  fillClassName: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ percentage, domainMaximum, fillClassName }) => {
  const referenceLeft: number = (JournalProgressRules.REFERENCE_PERCENTAGE / domainMaximum) * 100;
  const fillWidth: number = percentage === null ? 0 : Math.max(0, (percentage / domainMaximum) * 100);
  return (
    <div aria-hidden="true" data-testid="progress-bar" className="relative h-2 w-full min-w-16 overflow-hidden rounded-full bg-beige">
      <div className={`h-full rounded-full ${fillClassName}`} style={{ width: `${fillWidth}%` }} data-fill={fillWidth} />
      <div className="absolute inset-y-0 w-px bg-ink/40" style={{ left: `${Math.min(referenceLeft, 99.5)}%` }} />
    </div>
  );
};

const CLASS_FILL = "bg-muted";
const STUDENT_FILL = "bg-maroon";

const SkeletonBar: React.FC<{ className: string }> = ({ className }) => (
  <div className={`rounded-md bg-beige-dark motion-safe:animate-pulse ${className}`} />
);

export const JournalProgressView: React.FC<JournalProgressViewProps> = ({ courseId }) => {
  const { t } = useTranslation("journals");
  const isDesktop: boolean = useDesktop();
  const query = useCourseStaffProgress(courseId);
  const selectId: string = useId();
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

  const data: CourseStaffProgressResponse | undefined = query.data;

  if (query.isLoading) {
    return (
      <div role="status" aria-busy="true" data-testid="journal-progress-skeleton" className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border bg-beige px-4 py-3 text-sm text-muted">
          <BrandActivityIndicator size={18} aria-hidden="true" />
          <span>{t("loading")}</span>
        </div>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex min-h-[72px] items-center gap-4 border-b border-border px-4 last:border-b-0">
            <SkeletonBar className="h-4 w-40" />
            <SkeletonBar className="ml-auto h-4 w-20" />
            <SkeletonBar className="hidden h-4 w-28 lg:block" />
          </div>
        ))}
      </div>
    );
  }

  if (query.isError && !data) {
    return (
      <JournalPanelMessage
        tone="error"
        title={t("workspace.progressLoadFailed")}
        body={t("progress.loadFailedBody")}
        retryLabel={t("common:retry")}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (!data) return null;

  if (data.periods.length === 0) {
    return <JournalPanelMessage tone="empty" title={t("progress.noPeriodsTitle")} body={t("progress.noPeriodsBody")} />;
  }
  if (data.students.length === 0) {
    return <JournalPanelMessage tone="empty" title={t("progress.noStudentsTitle")} body={t("progress.noStudentsBody")} />;
  }

  const rows: ProgressPeriodRow[] = JournalProgressRules.buildPeriodRows(data, getSchoolCalendarDate());
  const selectedStudent: StaffProgressStudent | undefined = data.students.find((student) => student.student_id === selectedStudentId);
  const comparison: StudentPeriodComparison[] | null = selectedStudent
    ? JournalProgressRules.compareStudent(selectedStudent, data.periods)
    : null;
  const domainMaximum: number = JournalProgressRules.barDomainMaximum(rows, comparison);
  const studentName: string = selectedStudent ? `${selectedStudent.first_name} ${selectedStudent.last_name}` : "";

  const percentageText = (percentage: number | null): string =>
    percentage === null ? t("progress.unavailable") : formatPercentage(percentage);
  const totalText = (result: StoredPeriodResult | null): string =>
    result ? t("progress.totalOfMax", { score: formatNumber(result.score), max: formatNumber(result.maxScore) }) : t("progress.unavailable");
  const rangeText = (row: ProgressPeriodRow): string =>
    `${formatSchoolLessonDate(row.period.period_start)} – ${formatSchoolLessonDate(row.period.period_end)}`;
  const storedText = (row: ProgressPeriodRow): string =>
    t("progress.storedOf", { stored: row.storedCount, roster: row.rosterCount });
  const comparisonFor = (row: ProgressPeriodRow): StudentPeriodComparison | undefined =>
    comparison?.find((item) => item.periodId === row.period.id);
  const upcomingTag = (row: ProgressPeriodRow) =>
    row.upcoming ? (
      <span className="ml-2 inline-block rounded-full border border-info/30 bg-info-surface px-2 py-0.5 align-middle text-xs font-semibold text-info">
        {t("period.upcoming")}
      </span>
    ) : null;
  const notStarted = <span className="text-muted">{t("period.stateEmpty")}</span>;

  const selector = (
    <div className="flex flex-col gap-1 lg:max-w-sm">
      <label htmlFor={selectId} className="text-sm font-medium text-ink">
        {t("progress.compareLabel")}
      </label>
      <select
        id={selectId}
        value={selectedStudentId ?? ""}
        onChange={(event) => setSelectedStudentId(event.target.value === "" ? null : Number(event.target.value))}
        className="h-11 w-full rounded-[10px] border border-control-border bg-card px-3 text-base text-ink focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">{t("progress.classOnly")}</option>
        {data.students.map((student) => (
          <option key={student.student_id} value={student.student_id}>
            {student.first_name} {student.last_name}
          </option>
        ))}
      </select>
    </div>
  );

  const legend = (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" aria-label={t("progress.legendLabel")}>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className={`h-2 w-4 rounded-full ${CLASS_FILL}`} />
        {t("progress.classAverage")}
      </li>
      {selectedStudent && (
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className={`h-2 w-4 rounded-full ${STUDENT_FILL}`} />
          {studentName}
        </li>
      )}
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="h-3 w-px bg-ink/40" />
        {t("progress.referenceMark")}
      </li>
    </ul>
  );

  const table = (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full border-collapse text-left text-sm" aria-label={t("progress.tableLabel")}>
        <thead>
          <tr className="border-b border-border bg-beige text-xs font-semibold uppercase tracking-wide text-muted">
            <th scope="col" className="px-4 py-3">{t("progress.columns.period")}</th>
            <th scope="col" className="px-4 py-3">{t("progress.columns.stored")}</th>
            <th scope="col" className="px-4 py-3">{t("progress.columns.average")}</th>
            {selectedStudent && <th scope="col" className="px-4 py-3">{t("progress.columns.student", { name: studentName })}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const studentValue: StudentPeriodComparison | undefined = comparisonFor(row);
            return (
              <tr key={row.period.id} data-upcoming={row.upcoming} className="border-b border-border last:border-b-0">
                <th scope="row" className="min-w-0 px-4 py-3 align-top font-semibold text-ink">
                  <span className="block break-words">
                    {row.period.period_label}
                    {upcomingTag(row)}
                  </span>
                  <span className="block text-xs font-normal tabular-nums text-muted">{rangeText(row)}</span>
                </th>
                {row.upcoming ? (
                  <td colSpan={selectedStudent ? 3 : 2} className="px-4 py-3 align-top">{notStarted}</td>
                ) : (
                  <>
                    <td className="px-4 py-3 align-top tabular-nums text-ink">
                      {storedText(row)}
                      {row.unavailableCount > 0 && (
                        <span className="block text-xs text-muted">{t("progress.unavailableCount", { count: row.unavailableCount })}</span>
                      )}
                    </td>
                    <td className="min-w-48 px-4 py-3 align-top">
                      <div className="font-semibold tabular-nums text-ink">{percentageText(row.averagePercentage)}</div>
                      <ProgressBar percentage={row.averagePercentage} domainMaximum={domainMaximum} fillClassName={CLASS_FILL} />
                    </td>
                    {selectedStudent && (
                      <td className="min-w-48 px-4 py-3 align-top">
                        <div className="font-semibold tabular-nums text-ink">
                          {percentageText(studentValue?.result?.percentage ?? null)}
                        </div>
                        <div className="mb-1 text-xs tabular-nums text-muted">{totalText(studentValue?.result ?? null)}</div>
                        <ProgressBar percentage={studentValue?.result?.percentage ?? null} domainMaximum={domainMaximum} fillClassName={STUDENT_FILL} />
                      </td>
                    )}
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const list = (
    <ul data-testid="progress-results" className="divide-y divide-border border-y border-border" aria-label={t("progress.tableLabel")}>
      {rows.map((row) => {
        const studentValue: StudentPeriodComparison | undefined = comparisonFor(row);
        return (
          <li key={row.period.id} data-upcoming={row.upcoming} className="flex flex-col gap-1.5 py-3">
            <div className="min-w-0">
              <div className="break-words text-sm font-semibold text-ink">
                {row.period.period_label}
                {upcomingTag(row)}
              </div>
              <div className="text-xs tabular-nums text-muted">{rangeText(row)}</div>
            </div>
            {row.upcoming ? (
              <div className="text-sm">{notStarted}</div>
            ) : (
              <>
                <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted">{t("progress.columns.stored")}</dt>
                  <dd className="text-right tabular-nums text-ink">
                    {storedText(row)}
                    {row.unavailableCount > 0 && (
                      <span className="block text-xs text-muted">{t("progress.unavailableCount", { count: row.unavailableCount })}</span>
                    )}
                  </dd>
                  <dt className="text-muted">{t("progress.classAverage")}</dt>
                  <dd className="text-right font-semibold tabular-nums text-ink">{percentageText(row.averagePercentage)}</dd>
                </dl>
                <ProgressBar percentage={row.averagePercentage} domainMaximum={domainMaximum} fillClassName={CLASS_FILL} />
                {selectedStudent && (
                  <>
                    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-sm">
                      <dt className="min-w-0 break-words text-muted">{studentName}</dt>
                      <dd className="text-right font-semibold tabular-nums text-ink">
                        {percentageText(studentValue?.result?.percentage ?? null)}
                      </dd>
                      <dt className="text-muted">{t("progress.columns.total")}</dt>
                      <dd className="text-right tabular-nums text-ink">{totalText(studentValue?.result ?? null)}</dd>
                    </dl>
                    <ProgressBar percentage={studentValue?.result?.percentage ?? null} domainMaximum={domainMaximum} fillClassName={STUDENT_FILL} />
                  </>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex min-w-0 flex-col gap-2 lg:gap-3" data-testid="journal-progress">
      {query.isError && (
        <JournalNotice tone="warning" action={{ label: t("common:retry"), onClick: () => void query.refetch() }}>
          {t("progress.refreshFailed")}
        </JournalNotice>
      )}
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-semibold text-ink lg:text-lg" data-testid="progress-scope">
          {t("progress.scope")}
        </h2>
        <p className="text-sm text-muted">{t("progress.scopeNote")}</p>
      </div>
      {selector}
      {legend}
      {isDesktop ? table : list}
    </div>
  );
};
