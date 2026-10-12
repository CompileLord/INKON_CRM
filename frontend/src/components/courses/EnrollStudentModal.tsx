import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import axios from "axios";
import { AlertCircle, RotateCcw, Search, UserRound, X } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { PersonAvatar } from "../ui/PersonAvatar";
import { BrandActivityIndicator } from "../ui/BrandActivityIndicator";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { resolveMediaUrl } from "../../lib/users/media";
import { formatMoney } from "../../lib/money";
import { AuthApiError } from "../../lib/auth/errors";
import { useEligibleCandidates, useEnrollStudent } from "../../lib/enrollments/hooks";
import type { EligibleCandidateResponse } from "../../lib/enrollments/types";

interface EnrollStudentModalProps {
  open: boolean;
  courseId: number;
  courseTitle: string;
  coursePrice: string;
  onClose: () => void;
  onEnrolled: (enrolledStudentId: number) => void;
}

export function EnrollStudentModal({
  open,
  courseId,
  courseTitle,
  coursePrice,
  onClose,
  onEnrolled,
}: EnrollStudentModalProps) {
  const { t } = useTranslation(["courses", "common"]);
  const [search, setSearch] = useState("");
  const [candidatePage, setCandidatePage] = useState(1);
  const [selectedCandidate, setSelectedCandidate] = useState<EligibleCandidateResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSubmittingRef = useRef(false);
  const debouncedSearch = useDebouncedValue(search, 300);

  const enrollMutation = useEnrollStudent();

  const {
    data: candidateData,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useEligibleCandidates(
    open ? courseId : undefined,
    {
      search: debouncedSearch.trim() || undefined,
      page: candidatePage,
      page_size: 10,
    },
    open,
  );

  useEffect(() => {
    if (open) {
      setSearch("");
      setCandidatePage(1);
      setSelectedCandidate(null);
      setErrorMessage(null);
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  }, [open, courseId]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCandidatePage(1);
  };

  const handleClearSearch = () => {
    setSearch("");
    setCandidatePage(1);
  };

  const isPendingOrSubmitting = enrollMutation.isPending || isSubmitting;

  const handleSelectCandidate = (candidate: EligibleCandidateResponse) => {
    if (isPendingOrSubmitting || isSubmittingRef.current) return;
    setSelectedCandidate(candidate);
    setErrorMessage(null);
  };

  const handleDeselectCandidate = () => {
    if (isPendingOrSubmitting || isSubmittingRef.current) return;
    setSelectedCandidate(null);
  };

  const handleSubmit = async () => {
    if (!selectedCandidate || isPendingOrSubmitting || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setErrorMessage(null);

    const studentToEnrollId = selectedCandidate.id;

    try {
      await enrollMutation.mutateAsync({
        course_id: courseId,
        student_id: studentToEnrollId,
      });
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      onEnrolled(studentToEnrollId);
    } catch (err: unknown) {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      let status: number | undefined;
      if (err instanceof AuthApiError) {
        status = err.status;
      } else if (axios.isAxiosError(err)) {
        status = err.response?.status;
      } else if (
        typeof err === "object" &&
        err !== null &&
        "status" in err &&
        typeof (err as { status?: unknown }).status === "number"
      ) {
        status = (err as { status: number }).status;
      }

      if (status === 409) {
        setErrorMessage(t("enrollment.duplicateConflict"));
      } else {
        setErrorMessage(t("enrollment.genericError"));
      }
    }
  };

  const handleClose = () => {
    if (isPendingOrSubmitting || isSubmittingRef.current) return;
    onClose();
  };

  const totalPages = candidateData?.total_pages ?? 1;
  const items = candidateData?.items ?? [];
  const totalCandidates = candidateData?.total ?? 0;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t("enrollment.modalTitle")}
      maxWidthClassName="sm:max-w-[560px]"
      fullScreenOnMobile={true}
      closeDisabled={isPendingOrSubmitting || isSubmittingRef.current}
      footer={
        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={isPendingOrSubmitting || isSubmittingRef.current}
            className="w-full sm:w-auto min-h-[44px]"
          >
            {t("common:cancel")}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSubmit}
            disabled={!selectedCandidate || isPendingOrSubmitting || isSubmittingRef.current}
            loading={isPendingOrSubmitting}
            className="w-full sm:w-auto min-h-[44px]"
          >
            {isPendingOrSubmitting
              ? t("enrollment.enrolling")
              : t("enrollment.enrollSubmit")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-border-warm bg-strip p-3.5 flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-ink break-words">{courseTitle}</span>
            <span className="text-sm font-semibold tabular-nums text-maroon dark:text-accent">
              {formatMoney(coursePrice)} {t("currencyPerMonth")}
            </span>
          </div>
          <p className="text-xs text-muted">
            {t("enrollment.readOnlyTermsNotice")}
          </p>
        </div>

        {errorMessage ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span className="flex-1 break-words">{errorMessage}</span>
          </div>
        ) : null}

        <div className="relative">
          <Search
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            disabled={enrollMutation.isPending || isSubmittingRef.current}
            placeholder={t("enrollment.searchPlaceholder")}
            aria-label={t("enrollment.searchPlaceholder")}
            className="w-full min-h-[48px] rounded-xl border border-control-border bg-card pl-10 pr-12 py-2.5 text-base sm:text-sm text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon dark:focus-visible:ring-accent"
          />
          {search ? (
            <button
              type="button"
              onClick={handleClearSearch}
              disabled={enrollMutation.isPending || isSubmittingRef.current}
              aria-label={t("students.resetSearch")}
              className="absolute right-1 top-1/2 -translate-y-1/2 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>

        {selectedCandidate ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-maroon dark:border-accent bg-beige/60 dark:bg-row-hover p-3">
            <div className="flex items-center gap-3 min-w-0">
              <PersonAvatar
                firstName={selectedCandidate.first_name}
                lastName={selectedCandidate.last_name}
                photoUrl={resolveMediaUrl(selectedCandidate.thumbnail_path ?? selectedCandidate.photo_path) ?? undefined}
                size={36}
              />
              <div className="min-w-0 flex-1">
                <p className="break-words text-base md:text-sm font-semibold text-ink">
                  {selectedCandidate.first_name} {selectedCandidate.last_name}
                </p>
                <p className="break-words text-xs text-muted">
                  {selectedCandidate.email}
                  {selectedCandidate.phone ? ` • ${selectedCandidate.phone}` : ""}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={handleDeselectCandidate}
              disabled={isPendingOrSubmitting || isSubmittingRef.current}
              className="shrink-0 text-xs min-h-[44px] px-3.5"
            >
              {t("enrollment.changeCandidate")}
            </Button>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 min-h-[220px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider">
              {t("enrollment.candidatesTitle")}
            </span>
            {isFetching && !isLoading ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted">
                <BrandActivityIndicator size={12} />
                <span>{t("updating")}</span>
              </span>
            ) : null}
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-2 py-4">
              <div className="flex items-center justify-center py-2">
                <BrandActivityIndicator size={24} />
              </div>
              {Array.from({ length: 4 }, (_, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 rounded-xl p-3 border border-border bg-strip motion-safe:animate-pulse min-h-[52px]"
                >
                  <div className="h-4 w-4 rounded-full bg-border shrink-0" />
                  <div className="h-9 w-9 rounded-full bg-border shrink-0" />
                  <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <div className="h-4 w-32 rounded bg-border" />
                    <div className="h-3 w-48 rounded bg-border" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div
              role="alert"
              className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-center"
            >
              <AlertCircle size={22} className="text-destructive" />
              <p className="text-sm font-medium text-destructive">
                {t("enrollment.candidatesLoadError")}
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => refetch()}
                className="min-h-[44px] gap-1.5"
              >
                <RotateCcw size={14} />
                <span>{t("common:retry")}</span>
              </Button>
            </div>
          ) : totalCandidates === 0 && !debouncedSearch ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-strip p-8 text-center">
              <UserRound size={28} className="text-muted" />
              <p className="text-sm font-medium text-ink">
                {t("enrollment.emptyCandidates")}
              </p>
              <p className="text-xs text-muted max-w-sm">
                {t("enrollment.emptyCandidatesHelp")}
              </p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-strip p-8 text-center">
              <p className="text-sm font-medium text-ink">
                {t("enrollment.noMatches", { query: debouncedSearch })}
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={handleClearSearch}
                className="mt-2 min-h-[44px]"
              >
                {t("students.resetSearch")}
              </Button>
            </div>
          ) : (
            <div
              role="radiogroup"
              aria-label={t("enrollment.candidatesTitle")}
              className="flex flex-col gap-1.5"
            >
              {items.map((candidate) => {
                const isSelected = selectedCandidate?.id === candidate.id;
                return (
                  <label
                    key={candidate.id}
                    className={`flex items-center gap-3 rounded-xl p-3 text-left motion-safe:transition-[background-color,border-color,transform] motion-safe:duration-150 motion-safe:ease-out min-h-[52px] border cursor-pointer select-none focus-within:ring-2 focus-within:ring-maroon dark:focus-within:ring-accent motion-safe:active:scale-[0.96] ${
                      isSelected
                        ? "border-maroon bg-beige dark:border-accent dark:bg-row-hover"
                        : "border-border bg-card hover:bg-row-hover"
                    }`}
                  >
                    <input
                      type="radio"
                      name="eligible-candidate"
                      value={candidate.id}
                      checked={isSelected}
                      disabled={isPendingOrSubmitting || isSubmittingRef.current}
                      onChange={() => handleSelectCandidate(candidate)}
                      className="h-4 w-4 shrink-0 text-maroon accent-maroon focus:ring-0"
                    />

                    <PersonAvatar
                      firstName={candidate.first_name}
                      lastName={candidate.last_name}
                      photoUrl={resolveMediaUrl(candidate.thumbnail_path ?? candidate.photo_path) ?? undefined}
                      size={36}
                    />

                    <div className="min-w-0 flex-1">
                      <span className="text-base md:text-sm font-medium text-ink break-words block">
                        {candidate.first_name} {candidate.last_name}
                      </span>
                      <span className="text-xs text-muted break-words block">
                        {candidate.email}
                        {candidate.phone ? ` • ${candidate.phone}` : ""}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-border pt-3 mt-1">
              <Button
                type="button"
                variant="secondary"
                disabled={candidatePage <= 1 || isFetching || isLoading || enrollMutation.isPending || isSubmittingRef.current}
                onClick={() => setCandidatePage((p) => Math.max(1, p - 1))}
                className="min-h-[44px] text-xs"
              >
                {t("paginationPrev")}
              </Button>
              <span className="text-xs tabular-nums text-muted">
                {t("paginationPage", { page: candidatePage, total: totalPages })}
              </span>
              <Button
                type="button"
                variant="secondary"
                disabled={candidatePage >= totalPages || isFetching || isLoading || enrollMutation.isPending || isSubmittingRef.current}
                onClick={() => setCandidatePage((p) => Math.min(totalPages, p + 1))}
                className="min-h-[44px] text-xs"
              >
                {t("paginationNext")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
