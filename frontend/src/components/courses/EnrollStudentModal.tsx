import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { EnrollBillingFields, isAcceptableFee } from "../enrollments/EnrollBillingFields";
import { EnrollmentPreviewPanel } from "../enrollments/EnrollmentPreviewPanel";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { formatTjs } from "../../lib/money";
import { useEligibleCandidates, useEnrollmentPreview, useEnrollStudent } from "../../lib/enrollments/hooks";
import { EnrollCandidateList } from "./EnrollCandidateList";
import { enrollFailureKey, type EnrollFailureKey } from "./enrollFailureKey";
import type { EligibleCandidateResponse, EnrollmentPreviewRequest } from "../../lib/enrollments/types";

interface EnrollStudentModalProps {
  open: boolean;
  courseId: number;
  courseTitle: string;
  coursePrice: string;
  initialStudent?: EligibleCandidateResponse;
  onClose: () => void;
  onEnrolled: (enrolledStudentId: number) => void;
}

export function EnrollStudentModal({ open, courseId, courseTitle, coursePrice, initialStudent, onClose, onEnrolled }: EnrollStudentModalProps) {
  const { t, i18n } = useTranslation(["courses", "common"]);
  const [search, setSearch] = useState<string>("");
  const [candidatePage, setCandidatePage] = useState<number>(1);
  const [selected, setSelected] = useState<EligibleCandidateResponse[]>(initialStudent ? [initialStudent] : []);
  const [enrolled, setEnrolled] = useState<EligibleCandidateResponse[]>([]);
  const [failures, setFailures] = useState<Record<number, EnrollFailureKey>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isGrant, setIsGrant] = useState<boolean>(false);
  const [monthlyFee, setMonthlyFee] = useState<string>(coursePrice);

  const isSubmittingRef = useRef<boolean>(false);
  const debouncedSearch: string = useDebouncedValue(search, 300);
  const enrollMutation = useEnrollStudent();
  const isBusy: boolean = enrollMutation.isPending || isSubmitting;

  const feeIsValid: boolean = isGrant || isAcceptableFee(monthlyFee);
  const previewStudentId: number | undefined = selected[0]?.id;
  const previewRequest: EnrollmentPreviewRequest | null = useMemo(
    () =>
      open && previewStudentId !== undefined && feeIsValid
        ? {
            student_id: previewStudentId,
            course_id: courseId,
            billing_mode: isGrant ? "grant" : "paid",
            ...(isGrant ? {} : { price_at_enrollment: monthlyFee.trim() }),
          }
        : null,
    [open, previewStudentId, feeIsValid, courseId, isGrant, monthlyFee],
  );
  const debouncedPreviewRequest: EnrollmentPreviewRequest | null = useDebouncedValue(previewRequest, 400);
  const previewIsSettled: boolean = JSON.stringify(previewRequest) === JSON.stringify(debouncedPreviewRequest);
  const preview = useEnrollmentPreview(debouncedPreviewRequest);

  const { data: candidateData, isLoading, isFetching, isError, refetch } = useEligibleCandidates(
    open ? courseId : undefined,
    { search: debouncedSearch.trim() || undefined, page: candidatePage, page_size: 10 },
    open,
  );

  useEffect(() => {
    if (open) {
      setSearch("");
      setCandidatePage(1);
      setSelected(initialStudent ? [initialStudent] : []);
      setEnrolled([]);
      setFailures({});
      setIsSubmitting(false);
      setIsGrant(false);
      setMonthlyFee(coursePrice);
      isSubmittingRef.current = false;
    }
  }, [open, courseId, initialStudent?.id]);

  const selectedIds: ReadonlySet<number> = useMemo(() => new Set(selected.map((candidate: EligibleCandidateResponse) => candidate.id)), [selected]);
  const enrolledIds: ReadonlySet<number> = useMemo(() => new Set(enrolled.map((candidate: EligibleCandidateResponse) => candidate.id)), [enrolled]);
  const rows: EligibleCandidateResponse[] = useMemo(() => {
    const pageItems: EligibleCandidateResponse[] = candidateData?.items ?? [];
    const pageIds: Set<number> = new Set(pageItems.map((candidate: EligibleCandidateResponse) => candidate.id));
    const pinned: EligibleCandidateResponse[] = [
      ...enrolled,
      ...selected.filter((candidate: EligibleCandidateResponse) => !pageIds.has(candidate.id) && !enrolledIds.has(candidate.id)),
    ];
    return [...pinned, ...pageItems.filter((candidate: EligibleCandidateResponse) => !enrolledIds.has(candidate.id))];
  }, [candidateData, enrolled, enrolledIds, selected]);

  const handleToggle = (candidate: EligibleCandidateResponse): void => {
    if (isBusy || isSubmittingRef.current) return;
    setFailures((previous: Record<number, EnrollFailureKey>) => {
      const { [candidate.id]: _removed, ...rest } = previous;
      return rest;
    });
    setSelected((previous: EligibleCandidateResponse[]) =>
      previous.some((item: EligibleCandidateResponse) => item.id === candidate.id)
        ? previous.filter((item: EligibleCandidateResponse) => item.id !== candidate.id)
        : [...previous, candidate],
    );
  };

  const handleSubmit = async (): Promise<void> => {
    if (selected.length === 0 || isBusy || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setFailures({});
    let lastEnrolledId: number | null = null;
    let failureCount = 0;

    for (const candidate of selected) {
      try {
        await enrollMutation.mutateAsync({
          course_id: courseId,
          student_id: candidate.id,
          billing_mode: isGrant ? "grant" : "paid",
          ...(isGrant ? {} : { price_at_enrollment: monthlyFee.trim() }),
        });
        lastEnrolledId = candidate.id;
        setEnrolled((previous: EligibleCandidateResponse[]) => [...previous, candidate]);
        setSelected((previous: EligibleCandidateResponse[]) => previous.filter((item: EligibleCandidateResponse) => item.id !== candidate.id));
      } catch (error: unknown) {
        failureCount += 1;
        setFailures((previous: Record<number, EnrollFailureKey>) => ({ ...previous, [candidate.id]: enrollFailureKey(error) }));
      }
    }

    isSubmittingRef.current = false;
    setIsSubmitting(false);
    if (failureCount === 0 && lastEnrolledId !== null) onEnrolled(lastEnrolledId);
  };

  const handleClose = (): void => {
    if (isBusy || isSubmittingRef.current) return;
    const lastEnrolled: EligibleCandidateResponse | undefined = enrolled[enrolled.length - 1];
    if (lastEnrolled) onEnrolled(lastEnrolled.id);
    else onClose();
  };

  const failedCount: number = Object.keys(failures).length;
  const submitDisabledReason: string = selected.length === 0 ? t("common:disabledReason.selectStudent") : !feeIsValid ? t("common:disabledReason.fixFee") : "";

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t("enrollment.modalTitle")}
      maxWidthClassName="sm:max-w-[560px]"
      fullScreenOnMobile={true}
      closeDisabled={isBusy || isSubmittingRef.current}
      footer={
        <div className="flex flex-col-reverse items-center justify-end gap-3 sm:flex-row">
          <Button type="button" variant="secondary" onClick={handleClose} disabled={isBusy || isSubmittingRef.current} className="min-h-[44px] w-full sm:w-auto">
            {enrolled.length > 0 ? t("common:close") : t("common:cancel")}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSubmit}
            disabled={selected.length === 0 || !feeIsValid || isBusy || isSubmittingRef.current}
            disabledReason={submitDisabledReason}
            loading={isBusy}
            className="min-h-[44px] w-full sm:w-auto"
          >
            {isBusy ? t("enrollment.enrolling") : selected.length > 0 ? t("enrollment.enrollSubmitCount", { count: selected.length }) : t("enrollment.enrollSubmit")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5 rounded-xl border border-border-warm bg-strip p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="break-words text-sm font-semibold text-ink">{courseTitle}</span>
            <span className="text-sm font-semibold tabular-nums text-maroon-text dark:text-accent">
              {formatTjs(coursePrice, { perMonth: true, lng: i18n.language })}
            </span>
          </div>
          <p className="text-xs text-muted">{t("enrollment.readOnlyTermsNotice")}</p>
        </div>

        <EnrollBillingFields
          isGrant={isGrant}
          onGrantChange={setIsGrant}
          monthlyFee={monthlyFee}
          onMonthlyFeeChange={setMonthlyFee}
          feeIsValid={feeIsValid}
          disabled={isBusy}
        />

        {enrolled.length > 0 && failedCount > 0 ? (
          <p role="status" className="text-sm font-medium text-ink">
            {t("enrollment.resultSummary", { enrolled: enrolled.length, failed: failedCount })}
          </p>
        ) : null}

        {selected.length > 0 && previewRequest !== null ? (
          <EnrollmentPreviewPanel
            preview={preview.data}
            isLoading={!previewIsSettled || preview.isLoading}
            isError={previewIsSettled && preview.isError}
            onRetry={() => void preview.refetch()}
            studentCount={selected.length}
          />
        ) : null}

        <EnrollCandidateList
          search={search}
          debouncedSearch={debouncedSearch}
          onSearchChange={(value: string) => {
            setSearch(value);
            setCandidatePage(1);
          }}
          rows={rows}
          selectedIds={selectedIds}
          enrolledIds={enrolledIds}
          failures={failures}
          disabled={isBusy || isSubmittingRef.current}
          isLoading={isLoading}
          isFetching={isFetching}
          isError={isError}
          onRetry={() => void refetch()}
          totalCandidates={candidateData?.total ?? 0}
          page={candidatePage}
          totalPages={candidateData?.total_pages ?? 1}
          onPageChange={setCandidatePage}
          onToggle={handleToggle}
        />
      </div>
    </Modal>
  );
}
