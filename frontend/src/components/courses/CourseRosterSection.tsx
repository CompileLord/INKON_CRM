import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
import { Input } from "../ui/Input";
import { ListboxPicker, type ListboxOption } from "../ui/ListboxPicker";
import { Pagination } from "../ui/Pagination";
import { SectionCard } from "../ui/SectionCard";
import { EnrollStudentModal } from "./EnrollStudentModal";
import { BillingModeDialog, type BillingModeTarget } from "../enrollments/BillingModeDialog";
import { WithdrawalPreviewPanel } from "./WithdrawalPreviewPanel";
import { CourseRosterRow, CourseRosterSkeleton } from "./CourseRosterRow";
import { CourseDetailDeparture } from "./CourseDetailDeparture";
import { useRosterEnrollFlow } from "./useRosterEnrollFlow";
import { useCourseRosterPage, useWithdrawEnrollment, useWithdrawalPreview } from "../../lib/enrollments/hooks";
import { formatNumber } from "../../i18n/formatters";
import { DEFAULT_ROSTER_STATUS_FILTER, type CourseRosterItem, type CourseRosterParams, type RosterStatusFilter } from "../../lib/enrollments/types";

export type CourseRosterSortOption = "enrolled_desc" | "enrolled_asc" | "name_asc" | "name_desc" | "price_desc" | "price_asc";

const SORT_OPTIONS: readonly CourseRosterSortOption[] = ["enrolled_desc", "enrolled_asc", "name_asc", "name_desc", "price_desc", "price_asc"];
const STATUS_VALUES: readonly string[] = ["all", "active", "withdrawn", "completed"];

interface CourseRosterSectionProps {
  courseId: number;
  courseTitle: string;
  coursePrice: string;
  isSuperAdmin: boolean;
  isMentor: boolean;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  sortOption: CourseRosterSortOption;
  onSortOptionChange: (sort: CourseRosterSortOption) => void;
  page: number;
  onPageChange: (page: number) => void;
  statusFilter: RosterStatusFilter;
  onStatusFilterChange: (status: RosterStatusFilter) => void;
  onToast: (message: string, variant: "success" | "error") => void;
  onReady?: () => void;
}

export function CourseRosterSection({
  courseId,
  courseTitle,
  coursePrice,
  isSuperAdmin,
  isMentor,
  searchQuery,
  onSearchQueryChange,
  sortOption,
  onSortOptionChange,
  page,
  onPageChange,
  statusFilter,
  onStatusFilterChange,
  onToast,
  onReady,
}: CourseRosterSectionProps) {
  const { t } = useTranslation("courseDetail");
  const { t: tCommon } = useTranslation("common");
  const [enrollModalOpen, setEnrollModalOpen] = useState<boolean>(false);
  const [withdrawTarget, setWithdrawTarget] = useState<CourseRosterItem | null>(null);
  const [withdrawErrorMessage, setWithdrawErrorMessage] = useState<string | undefined>(undefined);
  const [billingModeTarget, setBillingModeTarget] = useState<BillingModeTarget | null>(null);
  const enrollButtonRef = useRef<HTMLButtonElement | null>(null);
  const isWithdrawSubmittingRef = useRef<boolean>(false);
  const withdrawMutation = useWithdrawEnrollment();
  const withdrawalPreview = useWithdrawalPreview(withdrawTarget?.enrollment_id ?? null);

  const rosterParams: CourseRosterParams = { page, page_size: 10, search: searchQuery.trim() || undefined, sort: sortOption, status: statusFilter === "all" ? undefined : statusFilter };
  const { data: rosterData, isLoading, isFetching, isError, refetch } = useCourseRosterPage(courseId, rosterParams);

  useEffect(() => {
    if (!isLoading) onReady?.();
  }, [isLoading, onReady]);

  const flow = useRosterEnrollFlow({
    courseId,
    sortOption,
    rosterData,
    isLoading,
    isFetching,
    isError,
    refetch,
    onToast,
    onSearchQueryChange,
    onStatusFilterChange,
    onPageChange,
    focusEnrollButton: () => enrollButtonRef.current?.focus(),
  });

  const items: CourseRosterItem[] = rosterData?.items ?? [];
  const total: number = rosterData?.total ?? 0;
  const totalPages: number = rosterData?.total_pages ?? 1;
  const hasRefreshError: boolean = flow.enrollRefreshErrorStudentId !== null;
  const isFiltered: boolean = searchQuery !== "" || statusFilter !== DEFAULT_ROSTER_STATUS_FILTER;

  const statusOptions: ListboxOption[] = STATUS_VALUES.map((value: string) => ({ value, label: t(`students.status.${value}`) }));
  const sortChoices: ListboxOption[] = SORT_OPTIONS.map((value: CourseRosterSortOption) => ({ value, label: t(`students.sort.${value}`) }));

  const recordDeparture = (): void => {
    CourseDetailDeparture.record(courseId, { tab: "students", search: searchQuery, sort: sortOption, rosterPage: page, rosterStatus: statusFilter });
  };

  const confirmWithdraw = async (): Promise<void> => {
    if (!withdrawTarget || withdrawMutation.isPending || isWithdrawSubmittingRef.current) return;
    isWithdrawSubmittingRef.current = true;
    setWithdrawErrorMessage(undefined);
    try {
      await withdrawMutation.mutateAsync({ id: withdrawTarget.enrollment_id, studentId: withdrawTarget.student_id, courseId: withdrawTarget.course_id });
      isWithdrawSubmittingRef.current = false;
      setWithdrawTarget(null);
      onToast(t("students.withdrawSuccess"), "success");
      enrollButtonRef.current?.focus();
    } catch {
      isWithdrawSubmittingRef.current = false;
      setWithdrawErrorMessage(t("students.withdrawError"));
    }
  };

  const enrollButton = (
    <Button ref={enrollButtonRef} type="button" onClick={() => setEnrollModalOpen(true)}>{t("students.enroll")}</Button>
  );

  const noticeClassName: string = "flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-strip px-3 py-2 text-sm text-ink";

  return (
    <SectionCard
      title={rosterData !== undefined ? `${t("students.title")} · ${formatNumber(total)}` : t("students.title")}
      actions={
        <>
          {isFetching && !isLoading ? <span aria-live="polite" className="text-xs text-muted">{t("updating")}</span> : null}
          {isSuperAdmin ? enrollButton : null}
        </>
      }
    >
      {isMentor && !isSuperAdmin ? <p className="text-sm text-muted">{t("students.readOnly")}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[200px] flex-1 sm:max-w-sm">
          <Input
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder={t("students.searchPlaceholder")}
            aria-label={t("students.searchPlaceholder")}
            leftAddon={<Search size={16} aria-hidden="true" />}
          />
        </div>
        <ListboxPicker
          label={t("students.statusLabel")}
          ariaLabel={t("students.statusLabel")}
          icon={null}
          options={statusOptions}
          value={statusFilter}
          onChange={(value: string) => onStatusFilterChange(value === "active" || value === "withdrawn" || value === "completed" ? value : "all")}
        />
        <ListboxPicker
          label={t("students.sortLabel")}
          ariaLabel={t("students.sortLabel")}
          icon={null}
          options={sortChoices}
          value={sortOption}
          onChange={(value: string) => onSortOptionChange(value as CourseRosterSortOption)}
          popupAlign="end"
        />
      </div>

      {hasRefreshError ? (
        <div role="alert" className={noticeClassName}>
          <span className="min-w-0 text-destructive">{t("students.refreshError")}</span>
          <span className="flex items-center gap-2">
            <Button type="button" variant="secondary" loading={flow.isRetryingEnrollRefresh} onClick={flow.retryRefresh}>{tCommon("retry")}</Button>
            <Button type="button" variant="secondary" onClick={flow.dismissRefreshError}>{t("students.dismiss")}</Button>
          </span>
        </div>
      ) : null}

      {flow.showHiddenNotice ? (
        <div role="status" className={noticeClassName}>
          <span className="min-w-0">{t("students.hiddenNotice")}</span>
          <span className="flex items-center gap-2">
            <Button type="button" variant="secondary" loading={flow.isLocating} onClick={flow.locateEnrolledStudent}>{t("students.showEnrolled")}</Button>
            <Button type="button" variant="secondary" onClick={flow.dismissHiddenNotice}>{t("students.dismiss")}</Button>
          </span>
        </div>
      ) : null}

      {isLoading ? (
        <CourseRosterSkeleton />
      ) : isError && items.length === 0 && !hasRefreshError ? (
        <ErrorState message={t("students.loadError")} onRetry={() => refetch()} />
      ) : (
        <>
          {isError && items.length > 0 && !hasRefreshError ? (
            <div role="alert" className={noticeClassName}>
              <span className="min-w-0 text-destructive">{t("students.loadError")}</span>
              <Button type="button" variant="secondary" onClick={() => refetch()}>{tCommon("retry")}</Button>
            </div>
          ) : null}
          {total === 0 && !isFiltered ? (
            <EmptyState
              title={t("students.empty")}
              description={isSuperAdmin ? t("students.emptyAdminHelp") : t("students.emptyMentorHelp")}
              action={isSuperAdmin ? <Button type="button" onClick={() => setEnrollModalOpen(true)}>{t("students.enroll")}</Button> : undefined}
            />
          ) : items.length === 0 ? (
            <EmptyState
              title={t("students.noMatches", { query: searchQuery })}
              description={t("students.noMatchesHelp")}
              action={
                <span className="flex items-center gap-2">
                  {searchQuery ? <Button type="button" variant="secondary" onClick={() => onSearchQueryChange("")}>{t("students.resetSearch")}</Button> : null}
                  {statusFilter !== DEFAULT_ROSTER_STATUS_FILTER ? <Button type="button" variant="secondary" onClick={() => onStatusFilterChange(DEFAULT_ROSTER_STATUS_FILTER)}>{t("students.resetFilter")}</Button> : null}
                </span>
              }
            />
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {items.map((item: CourseRosterItem) => (
                <CourseRosterRow
                  key={item.id}
                  item={item}
                  canOpenProfile={isSuperAdmin || isMentor}
                  canWithdraw={isSuperAdmin && item.status === "active"}
                  canSwitchBillingMode={isSuperAdmin && item.status === "active"}
                  isHighlighted={flow.highlightedStudentId === item.student_id}
                  registerName={flow.registerStudentName}
                  onStudentOpen={recordDeparture}
                  onSwitchBillingMode={(target: CourseRosterItem) =>
                    setBillingModeTarget({
                      enrollmentId: target.enrollment_id,
                      studentId: target.student_id,
                      courseId: target.course_id,
                      studentName: `${target.student.first_name} ${target.student.last_name}`.trim(),
                      courseTitle,
                      currentMode: target.billing_mode,
                    })
                  }
                  onWithdraw={(target: CourseRosterItem) => {
                    setWithdrawErrorMessage(undefined);
                    setWithdrawTarget(target);
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {totalPages > 1 ? <div className="flex justify-end"><Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} /></div> : null}

      <EnrollStudentModal
        open={enrollModalOpen}
        courseId={courseId}
        courseTitle={courseTitle}
        coursePrice={coursePrice}
        onClose={() => setEnrollModalOpen(false)}
        onEnrolled={(studentId: number) => {
          setEnrollModalOpen(false);
          void flow.handleEnrolled(studentId);
        }}
      />

      <BillingModeDialog target={billingModeTarget} onClose={() => setBillingModeTarget(null)} onToast={onToast} />

      <ConfirmDialog
        open={withdrawTarget !== null}
        title={t("students.withdrawTitle")}
        message={withdrawTarget ? t("students.withdrawMessage", { name: `${withdrawTarget.student.first_name} ${withdrawTarget.student.last_name}`.trim(), course: courseTitle }) : ""}
        details={
          <WithdrawalPreviewPanel
            preview={withdrawalPreview.data}
            isLoading={withdrawalPreview.isLoading}
            isError={withdrawalPreview.isError}
            onRetry={() => void withdrawalPreview.refetch()}
          />
        }
        confirmLabel={t("students.withdrawConfirm")}
        cancelLabel={tCommon("cancel")}
        confirmVariant="destructive"
        pending={withdrawMutation.isPending || isWithdrawSubmittingRef.current}
        errorMessage={withdrawErrorMessage}
        onConfirm={confirmWithdraw}
        onCancel={() => {
          if (withdrawMutation.isPending || isWithdrawSubmittingRef.current) return;
          setWithdrawTarget(null);
          setWithdrawErrorMessage(undefined);
        }}
      />
    </SectionCard>
  );
}
