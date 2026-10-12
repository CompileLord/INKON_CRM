import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Menu } from "@base-ui/react/menu";
import {
  AlertCircle,
  MoreVertical,
  RotateCcw,
  Search,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { PersonAvatar } from "../ui/PersonAvatar";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Button } from "../ui/Button";
import { BrandActivityIndicator } from "../ui/BrandActivityIndicator";
import { EnrollmentStatusBadge } from "../enrollments/EnrollmentStatusBadge";
import { EnrollStudentModal } from "./EnrollStudentModal";
import {
  useCourseRosterPage,
  useWithdrawEnrollment,
} from "../../lib/enrollments/hooks";
import { locateRosterStudent } from "../../lib/enrollments/endpoints";
import { resolveMediaUrl } from "../../lib/users/media";
import { formatMoney } from "../../lib/money";
import { formatDate, formatNumber } from "../../i18n/formatters";
import { recordCourseDetailNavigation } from "../../lib/courses/returnContext";
import type {
  CourseRosterItem,
  CourseRosterParams,
  EnrollmentStatus,
} from "../../lib/enrollments/types";

export type CourseRosterSortOption =
  | "enrolled_desc"
  | "enrolled_asc"
  | "name_asc"
  | "name_desc"
  | "price_desc"
  | "price_asc";

interface CourseRosterSectionProps {
  courseId: number;
  courseTitle: string;
  coursePrice: string;
  isSuperAdmin: boolean;
  isMentor: boolean;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  sortOption: CourseRosterSortOption;
  onSortOptionChange: (s: CourseRosterSortOption) => void;
  page: number;
  onPageChange: (p: number) => void;
  statusFilter: EnrollmentStatus | undefined;
  onStatusFilterChange: (s: EnrollmentStatus | undefined) => void;
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
  const { t } = useTranslation(["courses", "common"]);

  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [withdrawTarget, setWithdrawTarget] = useState<CourseRosterItem | null>(null);
  const [withdrawErrorMessage, setWithdrawErrorMessage] = useState<string | undefined>(undefined);
  const [newlyEnrolledStudentId, setNewlyEnrolledStudentId] = useState<number | null>(null);
  const [enrollRefreshErrorStudentId, setEnrollRefreshErrorStudentId] = useState<number | null>(null);
  const [isRetryingEnrollRefresh, setIsRetryingEnrollRefresh] = useState(false);
  const [pendingRevealStudentId, setPendingRevealStudentId] = useState<number | null>(null);
  const [highlightedStudentId, setHighlightedStudentId] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const enrollButtonRef = useRef<HTMLButtonElement | null>(null);
  const studentRowRefs = useRef<Map<number, HTMLElement>>(new Map());
  const desktopStudentNameRefs = useRef<Map<number, HTMLElement>>(new Map());
  const mobileStudentNameRefs = useRef<Map<number, HTMLElement>>(new Map());
  const isWithdrawSubmittingRef = useRef(false);

  const withdrawMutation = useWithdrawEnrollment();

  const rosterParams: CourseRosterParams = {
    page,
    page_size: 10,
    search: searchQuery.trim() || undefined,
    sort: sortOption,
    status: statusFilter,
  };

  const {
    data: rosterData,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useCourseRosterPage(courseId, rosterParams);

  useEffect(() => {
    if (!isLoading) {
      onReady?.();
    }
  }, [isLoading, onReady]);

  useEffect(() => {
    if (!rosterData || pendingRevealStudentId === null || isLoading || isFetching) return;
    const targetItem = rosterData.items.find(
      (item) => item.student_id === pendingRevealStudentId,
    );
    if (targetItem) {
      setHighlightedStudentId(pendingRevealStudentId);
      setPendingRevealStudentId(null);
      const isDesktop =
        typeof window !== "undefined" &&
        window.matchMedia("(min-width: 768px)").matches;
      const targetMap = isDesktop
        ? desktopStudentNameRefs
        : mobileStudentNameRefs;
      const fallbackMap = isDesktop
        ? mobileStudentNameRefs
        : desktopStudentNameRefs;
      const nameElem =
        targetMap.current.get(pendingRevealStudentId) ??
        fallbackMap.current.get(pendingRevealStudentId);
      if (nameElem) {
        nameElem.focus();
      }
    }
  }, [rosterData, pendingRevealStudentId, isLoading, isFetching]);

  useEffect(() => {
    if (newlyEnrolledStudentId === null || !rosterData) return;
    if (
      rosterData.items.some(
        (item) => item.student_id === newlyEnrolledStudentId,
      )
    ) {
      setNewlyEnrolledStudentId(null);
    }
  }, [newlyEnrolledStudentId, rosterData]);

  const handleSearchInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    onSearchQueryChange(e.target.value);
  };

  const handleClearSearch = () => {
    onSearchQueryChange("");
  };

  const handleStatusChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const raw = e.target.value;
    if (raw === "active" || raw === "withdrawn" || raw === "completed") {
      onStatusFilterChange(raw);
    } else {
      onStatusFilterChange(undefined);
    }
  };

  const handleSortChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onSortOptionChange(e.target.value as CourseRosterSortOption);
  };

  const handleEnrolledSuccess = async (studentId: number) => {
    setEnrollModalOpen(false);
    onToast(t("enrollment.successToast"), "success");
    setEnrollRefreshErrorStudentId(null);
    try {
      const result = await refetch();
      if (result.isError || !result.data) {
        setNewlyEnrolledStudentId(null);
        setEnrollRefreshErrorStudentId(studentId);
      } else {
        const items = result.data.items ?? [];
        if (items.some((item) => item.student_id === studentId)) {
          setNewlyEnrolledStudentId(null);
        } else {
          setNewlyEnrolledStudentId(studentId);
        }
      }
    } catch {
      setNewlyEnrolledStudentId(null);
      setEnrollRefreshErrorStudentId(studentId);
    }
    enrollButtonRef.current?.focus();
  };

  const handleRetryEnrollRefresh = async () => {
    if (!enrollRefreshErrorStudentId || isRetryingEnrollRefresh) return;
    const targetStudentId = enrollRefreshErrorStudentId;
    setIsRetryingEnrollRefresh(true);
    try {
      const result = await refetch();
      if (result.isError || !result.data) {
        onToast(t("students.loadError"), "error");
      } else {
        setEnrollRefreshErrorStudentId(null);
        const items = result.data.items ?? [];
        if (items.some((item) => item.student_id === targetStudentId)) {
          setNewlyEnrolledStudentId(null);
        } else {
          setNewlyEnrolledStudentId(targetStudentId);
        }
      }
    } catch {
      onToast(t("students.loadError"), "error");
    } finally {
      setIsRetryingEnrollRefresh(false);
    }
  };

  const handleDismissEnrollRefreshError = () => {
    setEnrollRefreshErrorStudentId(null);
    enrollButtonRef.current?.focus();
  };

  const handleLocateEnrolledStudent = async () => {
    if (!newlyEnrolledStudentId || isLocating) return;
    const targetId = newlyEnrolledStudentId;
    setIsLocating(true);
    try {
      const location = await locateRosterStudent(courseId, targetId, {
        page_size: 10,
        sort: sortOption,
      });
      setPendingRevealStudentId(targetId);
      setNewlyEnrolledStudentId(null);
      onSearchQueryChange("");
      onStatusFilterChange(undefined);
      onPageChange(location.page);
    } catch {
      onToast(t("students.loadError"), "error");
    } finally {
      setIsLocating(false);
    }
  };

  const handleDismissHiddenNotice = () => {
    setNewlyEnrolledStudentId(null);
    enrollButtonRef.current?.focus();
  };

  const handleOpenWithdraw = (item: CourseRosterItem) => {
    setWithdrawErrorMessage(undefined);
    setWithdrawTarget(item);
  };

  const handleCancelWithdraw = () => {
    if (!withdrawMutation.isPending && !isWithdrawSubmittingRef.current) {
      setWithdrawTarget(null);
      setWithdrawErrorMessage(undefined);
    }
  };

  const handleConfirmWithdraw = async () => {
    if (!withdrawTarget || withdrawMutation.isPending || isWithdrawSubmittingRef.current) return;
    isWithdrawSubmittingRef.current = true;
    setWithdrawErrorMessage(undefined);
    try {
      await withdrawMutation.mutateAsync({
        id: withdrawTarget.enrollment_id,
        studentId: withdrawTarget.student_id,
        courseId: withdrawTarget.course_id,
      });
      isWithdrawSubmittingRef.current = false;
      setWithdrawTarget(null);
      onToast(t("students.withdrawSuccess"), "success");
      enrollButtonRef.current?.focus();
    } catch {
      isWithdrawSubmittingRef.current = false;
      setWithdrawErrorMessage(t("students.withdrawError"));
    }
  };

  const handleStudentLinkClick = () => {
    recordCourseDetailNavigation(courseId, {
      tab: "students",
      search: searchQuery,
      sort: sortOption,
      rosterPage: page,
      rosterStatus: statusFilter,
      scrollY: typeof window !== "undefined" ? window.scrollY : 0,
    });
    if (typeof window !== "undefined" && window.history) {
      try {
        const currentState = window.history.state;
        const usr =
          typeof currentState === "object" && currentState !== null && "usr" in currentState
            ? (currentState as { usr: Record<string, unknown> }).usr
            : {};
        window.history.replaceState(
          {
            ...currentState,
            usr: {
              ...usr,
              fromInternalReturn: true,
            },
          },
          "",
        );
      } catch {}
    }
  };

  const total = rosterData?.total ?? 0;
  const totalPages = rosterData?.total_pages ?? 1;
  const items = rosterData?.items ?? [];

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border-warm bg-card p-4 sm:p-5 md:p-6 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-strip text-maroon dark:text-accent">
            <Users size={18} />
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-ink">
              {t("students.title")}
            </h2>
            {rosterData !== undefined ? (
              <span className="rounded-full bg-strip px-2.5 py-0.5 text-xs font-semibold tabular-nums text-muted border border-border">
                {formatNumber(rosterData.total)}
              </span>
            ) : null}
          </div>
          {isFetching && !isLoading ? (
            <span
              aria-live="polite"
              className="inline-flex items-center gap-1 text-xs text-muted"
            >
              <BrandActivityIndicator size={12} />
              <span>{t("updating")}</span>
            </span>
          ) : null}
        </div>

        {isSuperAdmin ? (
          <Button
            ref={enrollButtonRef}
            type="button"
            variant="primary"
            onClick={() => setEnrollModalOpen(true)}
            className="min-h-[44px] gap-1.5"
          >
            <UserPlus size={16} />
            <span>{t("enrollment.action")}</span>
          </Button>
        ) : null}
      </div>

      {isMentor && !isSuperAdmin ? (
        <div className="rounded-xl border border-border bg-strip px-3.5 py-2 text-xs text-muted">
          {t("students.readOnlyMentorNotice")}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchInputChange}
            placeholder={t("students.searchPlaceholder")}
            aria-label={t("students.searchPlaceholder")}
            className="w-full min-h-[48px] rounded-xl border border-control-border bg-card pl-10 pr-12 py-2.5 text-base sm:text-sm text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon dark:focus-visible:ring-accent"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={handleClearSearch}
              aria-label={t("students.resetSearch")}
              className="absolute right-1 top-1/2 -translate-y-1/2 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={statusFilter ?? "all"}
            onChange={handleStatusChange}
            aria-label={t("students.filterAll")}
            className="min-h-[44px] rounded-xl border border-control-border bg-card px-3 py-2 text-base sm:text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon dark:focus-visible:ring-accent"
          >
            <option value="all">{t("students.filterAll")}</option>
            <option value="active">{t("students.filterActive")}</option>
            <option value="withdrawn">{t("students.filterWithdrawn")}</option>
            <option value="completed">{t("students.filterCompleted")}</option>
          </select>

          <select
            value={sortOption}
            onChange={handleSortChange}
            aria-label={t("sortLabel")}
            className="min-h-[44px] rounded-xl border border-control-border bg-card px-3 py-2 text-base sm:text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon dark:focus-visible:ring-accent"
          >
            <option value="enrolled_desc">{t("students.sortEnrolledDesc")}</option>
            <option value="enrolled_asc">{t("students.sortEnrolledAsc")}</option>
            <option value="name_asc">{t("students.sortNameAsc")}</option>
            <option value="name_desc">{t("students.sortNameDesc")}</option>
            <option value="price_desc">{t("students.sortPriceDesc")}</option>
            <option value="price_asc">{t("students.sortPriceAsc")}</option>
          </select>
        </div>
      </div>

      {enrollRefreshErrorStudentId !== null ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle size={18} className="text-destructive shrink-0" />
            <span className="text-sm font-medium text-destructive break-words">
              {t("students.enrollSuccessRefreshError")}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="secondary"
              onClick={handleRetryEnrollRefresh}
              loading={isRetryingEnrollRefresh}
              disabled={isRetryingEnrollRefresh}
              className="min-h-[44px] text-xs gap-1.5"
            >
              <RotateCcw size={14} />
              <span>{t("common:retry")}</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleDismissEnrollRefreshError}
              className="min-h-[44px] text-xs"
            >
              {t("students.dismiss")}
            </Button>
          </div>
        </div>
      ) : null}

      {newlyEnrolledStudentId !== null &&
      enrollRefreshErrorStudentId === null &&
      !isError &&
      !isLoading &&
      !isFetching &&
      !rosterData?.items.some((item) => item.student_id === newlyEnrolledStudentId) ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-maroon dark:border-accent bg-beige/60 dark:bg-row-hover p-3.5"
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-maroon dark:text-accent shrink-0" />
            <span className="text-sm font-medium text-ink">
              {t("students.hiddenEnrolledNotice")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleLocateEnrolledStudent}
              loading={isLocating}
              disabled={isLocating}
              className="min-h-[44px] text-xs"
            >
              {t("students.viewEnrolledStudent")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleDismissHiddenNotice}
              className="min-h-[44px] text-xs"
            >
              {t("students.dismiss")}
            </Button>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-center py-4 bg-strip/30">
            <BrandActivityIndicator size={28} />
          </div>
          {Array.from({ length: 5 }, (_, idx) => (
            <div
              key={idx}
              className="p-3.5 sm:p-4 bg-card motion-safe:animate-pulse"
            >
              <div className="hidden md:flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-border shrink-0" />
                  <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <div className="h-4 w-32 rounded bg-border" />
                    <div className="h-3 w-48 rounded bg-border" />
                  </div>
                </div>
                <div className="flex items-center gap-6 shrink-0">
                  <div className="h-6 w-16 rounded-full bg-border" />
                  <div className="flex flex-col items-end gap-1">
                    <div className="h-4 w-20 rounded bg-border" />
                    <div className="h-3 w-16 rounded bg-border" />
                  </div>
                  <div className="h-9 w-9 rounded-xl bg-border" />
                </div>
              </div>

              <div className="flex md:hidden flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-border shrink-0" />
                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                      <div className="h-4 w-28 rounded bg-border" />
                      <div className="h-3 w-40 rounded bg-border" />
                    </div>
                  </div>
                  <div className="h-9 w-9 rounded-xl bg-border shrink-0" />
                </div>
                <div className="flex items-center justify-between border-t border-border pt-2">
                  <div className="h-5 w-14 rounded-full bg-border" />
                  <div className="h-4 w-24 rounded bg-border" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : isError && items.length === 0 && enrollRefreshErrorStudentId === null ? (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-8 text-center"
        >
          <AlertCircle size={24} className="text-destructive" />
          <p className="text-sm font-medium text-destructive">
            {t("students.loadError")}
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
      ) : (
        <>
          {isError && items.length > 0 && enrollRefreshErrorStudentId === null ? (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle size={16} className="shrink-0" />
                <span className="break-words">{t("students.loadError")}</span>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => refetch()}
                className="shrink-0 min-h-[44px] px-3 text-xs gap-1"
              >
                <RotateCcw size={12} />
                <span>{t("common:retry")}</span>
              </Button>
            </div>
          ) : null}

          {total === 0 && !searchQuery && !statusFilter ? (
            <div className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-border bg-strip p-10 text-center">
              <Users size={32} className="text-muted" />
              <p className="text-base font-semibold text-ink">
                {t("students.emptyRoster")}
              </p>
              <p className="text-sm text-muted max-w-md">
                {isSuperAdmin
                  ? t("students.emptyRosterAdminHelp")
                  : t("students.emptyRosterMentorHelp")}
              </p>
              {isSuperAdmin ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setEnrollModalOpen(true)}
                  className="mt-2 min-h-[44px] gap-1.5"
                >
                  <UserPlus size={16} />
                  <span>{t("enrollment.action")}</span>
                </Button>
              ) : null}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-border bg-strip p-10 text-center">
              <p className="text-base font-semibold text-ink">
                {t("students.noMatches", { query: searchQuery })}
              </p>
              <p className="text-sm text-muted max-w-md">
                {t("students.noMatchesHelp")}
              </p>
              <div className="flex items-center gap-2 mt-2">
                {searchQuery ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleClearSearch}
                    className="min-h-[44px]"
                  >
                    {t("students.resetSearch")}
                  </Button>
                ) : null}
                {statusFilter ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => onStatusFilterChange(undefined)}
                    className="min-h-[44px]"
                  >
                    {t("students.resetFilter")}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border rounded-xl border border-border overflow-hidden">
              {items.map((item) => {
                const isHighlighted = highlightedStudentId === item.student_id;
                const studentName = `${item.student.first_name} ${item.student.last_name}`.trim();
                const canLinkToProfile = isSuperAdmin || isMentor;

                return (
                  <div
                    key={item.id}
                    data-testid="roster-row"
                    ref={(elem) => {
                      if (elem) {
                        studentRowRefs.current.set(item.student_id, elem);
                      } else {
                        studentRowRefs.current.delete(item.student_id);
                      }
                    }}
                    tabIndex={isHighlighted ? 0 : -1}
                    className={`p-3.5 sm:p-4 transition-colors motion-safe:duration-150 ${
                      isHighlighted
                        ? "bg-beige/70 dark:bg-row-hover ring-2 ring-maroon dark:ring-accent"
                        : "bg-card hover:bg-row-hover"
                    }`}
                  >
                    <div className="hidden md:flex flex-wrap items-center justify-between gap-4">
                      <div data-testid="student-identity" className="flex items-center gap-3 min-w-[280px] flex-1">
                        <PersonAvatar
                          firstName={item.student.first_name}
                          lastName={item.student.last_name}
                          photoUrl={resolveMediaUrl(item.student.thumbnail_path ?? item.student.photo_path) ?? undefined}
                          size={36}
                        />
                        <div className="min-w-0 flex-1">
                          {canLinkToProfile ? (
                            <Link
                              to={`/students/${item.student_id}`}
                              ref={(elem) => {
                                if (elem) {
                                  desktopStudentNameRefs.current.set(item.student_id, elem);
                                } else {
                                  desktopStudentNameRefs.current.delete(item.student_id);
                                }
                              }}
                               onClick={handleStudentLinkClick}
                              className="break-words text-base md:text-sm font-semibold text-ink hover:text-maroon dark:hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon min-h-[44px] flex items-center"
                            >
                              {studentName}
                            </Link>
                          ) : (
                            <p
                              ref={(elem) => {
                                if (elem) {
                                  desktopStudentNameRefs.current.set(item.student_id, elem);
                                } else {
                                  desktopStudentNameRefs.current.delete(item.student_id);
                                }
                              }}
                              tabIndex={isHighlighted ? 0 : -1}
                              className="break-words text-base md:text-sm font-semibold text-ink min-h-[44px] flex items-center"
                            >
                              {studentName}
                            </p>
                          )}
                          <p className="break-words text-xs text-muted">
                            {item.student.email}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 sm:gap-6 justify-end">
                        <EnrollmentStatusBadge status={item.status} />

                        <div className="flex flex-col items-end text-right">
                          <span className="text-sm font-semibold tabular-nums text-ink">
                            {formatMoney(item.price_at_enrollment)} {t("currencyPerMonth")}
                          </span>
                          <span className="text-xs text-muted tabular-nums">
                            {formatDate(item.enrolled_at)}
                          </span>
                        </div>

                        {isSuperAdmin && item.status === "active" ? (
                          <Menu.Root>
                            <Menu.Trigger
                              type="button"
                              aria-label={`${t("students.studentActions")}: ${studentName}`}
                              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-muted motion-safe:transition-[background-color,color,transform] motion-safe:duration-150 motion-safe:ease-out hover:bg-strip hover:text-ink motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical size={18} />
                            </Menu.Trigger>
                            <Menu.Portal>
                              <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
                                <Menu.Popup
                                  className="min-w-44 overflow-hidden rounded-xl border border-border bg-card p-1 text-ink shadow-lg motion-safe:animate-[card-scale-in_200ms_ease-out] origin-[var(--transform-origin)]"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Menu.Item
                                    className="flex w-full min-h-[44px] items-center gap-2.5 px-3 py-2 text-sm font-medium text-destructive motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out hover:bg-destructive/10 focus:bg-destructive/10 focus-visible:outline-none cursor-pointer select-none"
                                    onClick={() => handleOpenWithdraw(item)}
                                  >
                                    <UserMinus size={15} className="shrink-0" />
                                    <span>{t("students.withdraw")}</span>
                                  </Menu.Item>
                                </Menu.Popup>
                              </Menu.Positioner>
                            </Menu.Portal>
                          </Menu.Root>
                        ) : (
                          <div className="w-[44px]" />
                        )}
                      </div>
                    </div>

                    <div className="flex md:hidden flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div data-testid="student-identity" className="flex items-center gap-2.5 min-w-0 flex-1">
                          <PersonAvatar
                            firstName={item.student.first_name}
                            lastName={item.student.last_name}
                            photoUrl={resolveMediaUrl(item.student.thumbnail_path ?? item.student.photo_path) ?? undefined}
                            size={36}
                          />
                          <div className="min-w-0 flex-1">
                            {canLinkToProfile ? (
                              <Link
                                to={`/students/${item.student_id}`}
                                ref={(elem) => {
                                  if (elem) {
                                    mobileStudentNameRefs.current.set(item.student_id, elem);
                                  } else {
                                    mobileStudentNameRefs.current.delete(item.student_id);
                                  }
                                }}
                                onClick={handleStudentLinkClick}
                                className="break-words text-base md:text-sm font-semibold text-ink hover:text-maroon dark:hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon min-h-[44px] flex items-center"
                              >
                                {studentName}
                              </Link>
                            ) : (
                              <p
                                ref={(elem) => {
                                  if (elem) {
                                    mobileStudentNameRefs.current.set(item.student_id, elem);
                                  } else {
                                    mobileStudentNameRefs.current.delete(item.student_id);
                                  }
                                }}
                                tabIndex={isHighlighted ? 0 : -1}
                                className="break-words text-base md:text-sm font-semibold text-ink min-h-[44px] flex items-center"
                              >
                                {studentName}
                              </p>
                            )}
                            <p className="break-words text-xs text-muted">
                              {item.student.email}
                            </p>
                          </div>
                        </div>

                        {isSuperAdmin && item.status === "active" ? (
                          <Menu.Root>
                            <Menu.Trigger
                              type="button"
                              aria-label={`${t("students.studentActions")}: ${studentName}`}
                              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-muted motion-safe:transition-[background-color,color,transform] motion-safe:duration-150 motion-safe:ease-out hover:bg-strip hover:text-ink motion-safe:active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical size={18} />
                            </Menu.Trigger>
                            <Menu.Portal>
                              <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
                                <Menu.Popup
                                  className="min-w-44 overflow-hidden rounded-xl border border-border bg-card p-1 text-ink shadow-lg motion-safe:animate-[card-scale-in_200ms_ease-out] origin-[var(--transform-origin)]"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Menu.Item
                                    className="flex w-full min-h-[44px] items-center gap-2.5 px-3 py-2 text-sm font-medium text-destructive motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out hover:bg-destructive/10 focus:bg-destructive/10 focus-visible:outline-none cursor-pointer select-none"
                                    onClick={() => handleOpenWithdraw(item)}
                                  >
                                    <UserMinus size={15} className="shrink-0" />
                                    <span>{t("students.withdraw")}</span>
                                  </Menu.Item>
                                </Menu.Popup>
                              </Menu.Positioner>
                            </Menu.Portal>
                          </Menu.Root>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs">
                        <div className="flex items-center gap-2">
                          <EnrollmentStatusBadge status={item.status} />
                          <span className="text-muted tabular-nums">
                            {formatDate(item.enrolled_at)}
                          </span>
                        </div>
                        <span className="font-semibold tabular-nums text-ink">
                          {formatMoney(item.price_at_enrollment)} {t("currencyPerMonth")}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between border-t border-border pt-4 mt-1">
          <Button
            type="button"
            variant="secondary"
            disabled={page <= 1 || isLoading}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            className="min-h-[44px]"
          >
            {t("paginationPrev")}
          </Button>
          <span className="text-sm tabular-nums text-muted font-medium">
            {t("paginationPage", {
              page: formatNumber(page),
              total: formatNumber(totalPages),
            })}
          </span>
          <Button
            type="button"
            variant="secondary"
            disabled={page >= totalPages || isLoading}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            className="min-h-[44px]"
          >
            {t("paginationNext")}
          </Button>
        </div>
      ) : null}

      <EnrollStudentModal
        open={enrollModalOpen}
        courseId={courseId}
        courseTitle={courseTitle}
        coursePrice={coursePrice}
        onClose={() => setEnrollModalOpen(false)}
        onEnrolled={handleEnrolledSuccess}
      />

      <ConfirmDialog
        open={withdrawTarget !== null}
        title={t("students.withdrawTitle")}
        message={
          withdrawTarget
            ? t("students.withdrawMessage", {
                name: `${withdrawTarget.student.first_name} ${withdrawTarget.student.last_name}`.trim(),
                course: courseTitle,
              })
            : ""
        }
        confirmLabel={t("students.withdrawConfirm")}
        cancelLabel={t("common:cancel")}
        confirmVariant="destructive"
        pending={withdrawMutation.isPending || isWithdrawSubmittingRef.current}
        errorMessage={withdrawErrorMessage}
        onConfirm={handleConfirmWithdraw}
        onCancel={handleCancelWithdraw}
      />
    </div>
  );
}
