import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, AlertTriangle, BookOpen, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { CoursePagination } from "../components/courses/CoursePagination";
import { CourseCard } from "../components/courses/CourseCard";
import { CourseListRow } from "../components/courses/CourseListRow";
import { PhoneCourseRow } from "../components/courses/PhoneCourseRow";
import {
  CoursesToolbar,
  type SortOption,
  type StatusFilter,
  type ViewMode,
} from "../components/courses/CoursesToolbar";
import { EmptyState } from "../components/courses/EmptyState";
import { BrandActivityIndicator } from "../components/ui/BrandActivityIndicator";
import { CourseFormPanel } from "../components/courses/CourseFormPanel";
import {
  useCopyCourse,
  useCourses,
  useDeleteCourse,
} from "../lib/courses/hooks";
import { getCourseSchedule } from "../lib/courses/endpoints";
import { useMentors } from "../lib/users/hooks";
import { useAuthStore } from "../store/authStore";
import { compareMoney } from "../lib/money";
import {
  buildValidatedCourseListUrl,
  getSavedScrollForCourseList,
  parseSafePageParam,
  recordCourseListNavigation,
} from "../lib/courses/returnContext";
import type { CourseCreate, CourseResponse, CourseScheduleResponse } from "../lib/courses/types";

const PAGE_SIZE = 12;

export function Courses() {
  const { t } = useTranslation(["courses", "common"]);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const role = useAuthStore((state) => state.role);
  const isSuperAdmin = role === "superadmin";
  const isMentor = role === "mentor";

  const [isTabletOrDesktop, setIsTabletOrDesktop] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 768px)").matches
      : true,
  );

  useEffect(() => {
    const priorScrollRestoration =
      typeof history !== "undefined" && "scrollRestoration" in history
        ? history.scrollRestoration
        : "auto";
    if (typeof history !== "undefined" && "scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
    const media = window.matchMedia("(min-width: 768px)");
    const handler = (event: MediaQueryListEvent) => {
      setIsTabletOrDesktop(event.matches);
    };
    media.addEventListener("change", handler);
    return () => {
      if (typeof history !== "undefined" && "scrollRestoration" in history) {
        history.scrollRestoration = priorScrollRestoration;
      }
      media.removeEventListener("change", handler);
    };
  }, []);

  const rawStatus = searchParams.get("status");
  const status: StatusFilter =
    rawStatus === "active" || rawStatus === "archived" ? rawStatus : "all";

  const page = parseSafePageParam(searchParams.get("page"));

  const search = searchParams.get("q") ?? "";

  const sortParam = searchParams.get("sort");
  const sort: SortOption = sortParam === "price" ? "price" : "newest";

  const [storedViewPreference, setStoredViewPreference] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "grid";
    try {
      const stored = localStorage.getItem("kitob_courses_view_preference");
      return stored === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });

  const rawView = searchParams.get("view");
  const view: ViewMode =
    rawView === "list"
      ? "list"
      : rawView === "grid"
        ? "grid"
        : storedViewPreference;

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseResponse | undefined>(undefined);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetCourse, setDeleteTargetCourse] = useState<CourseResponse | undefined>(undefined);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | undefined>(undefined);

  const [copyConfirmOpen, setCopyConfirmOpen] = useState(false);
  const [copyTargetCourse, setCopyTargetCourse] = useState<CourseResponse | undefined>(undefined);
  const [copyErrorMessage, setCopyErrorMessage] = useState<string | undefined>(undefined);
  const [isCopyPending, setIsCopyPending] = useState(false);

  const [toast, setToast] = useState<{
    message: string;
    visible: boolean;
    variant: "success" | "error";
  }>({
    message: "",
    visible: false,
    variant: "success",
  });
  const toastTimeoutRef = useRef<number | undefined>(undefined);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const addCourseButtonRef = useRef<HTMLButtonElement | null>(null);
  const editInvokerRef = useRef<HTMLElement | null>(null);
  const deleteInvokerRef = useRef<HTMLElement | null>(null);
  const duplicateInvokerRef = useRef<HTMLElement | null>(null);
  const deleteSuccessRef = useRef(false);
  const isMountedRef = useRef(true);
  const operationGenerationRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      operationGenerationRef.current++;
    };
  }, []);

  const getFormFinalFocus = (): HTMLElement | null => {
    if (editingCourse) {
      const invoker = editInvokerRef.current;
      if (invoker && invoker.isConnected) {
        return invoker;
      }
    } else {
      const addBtn = addCourseButtonRef.current;
      if (addBtn && addBtn.isConnected) {
        return addBtn;
      }
    }
    return searchInputRef.current;
  };

  const getDeleteFinalFocus = (): HTMLElement | null => {
    if (deleteSuccessRef.current) {
      return searchInputRef.current;
    }
    const invoker = deleteInvokerRef.current;
    if (invoker && invoker.isConnected) {
      return invoker;
    }
    return searchInputRef.current;
  };

  const getDuplicateFinalFocus = (): HTMLElement | null => {
    const invoker = duplicateInvokerRef.current;
    if (invoker && invoker.isConnected) {
      return invoker;
    }
    return searchInputRef.current;
  };

  const deleteMutation = useDeleteCourse();
  const copyMutation = useCopyCourse();

  const {
    data: coursesPage,
    isLoading,
    isPlaceholderData,
    isError,
    isFetching,
    refetch,
  } = useCourses({
    status: status === "all" ? undefined : status,
    page,
    page_size: PAGE_SIZE,
  });

  const { data: mentorsPage } = useMentors({ page_size: 100 }, isSuperAdmin);

  const hasRestoredScrollRef = useRef(false);
  const currentValidatedUrl = useMemo(
    () => buildValidatedCourseListUrl(searchParams.toString()),
    [searchParams],
  );

  useEffect(() => {
    hasRestoredScrollRef.current = false;
  }, [currentValidatedUrl]);

  useEffect(() => {
    if (isLoading || isPlaceholderData || !coursesPage) return;
    if (hasRestoredScrollRef.current) return;

    const savedScrollY = getSavedScrollForCourseList(searchParams.toString());
    if (typeof savedScrollY === "number" && savedScrollY > 0) {
      hasRestoredScrollRef.current = true;
      const frameId = requestAnimationFrame(() => {
        window.scrollTo({ top: savedScrollY, behavior: "auto" });
      });
      return () => {
        cancelAnimationFrame(frameId);
      };
    }
  }, [coursesPage, isLoading, isPlaceholderData, searchParams]);

  const handleNavigateOut = () => {
    recordCourseListNavigation(searchParams.toString());
  };

  const filtered = useMemo(() => {
    if (isPlaceholderData || !coursesPage) return [];
    const query = search.trim().toLowerCase();
    const items = coursesPage.items ?? [];
    const result = query
      ? items.filter((c) => c.title.toLowerCase().includes(query))
      : items;

    return [...result].sort((a, b) => {
      if (sort === "price") return compareMoney(a.price, b.price);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [coursesPage, isPlaceholderData, search, sort]);

  const showToast = (message: string, variant: "success" | "error" = "success") => {
    setToast({ message, visible: true, variant });
    window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(
      () => setToast((prev) => ({ ...prev, visible: false })),
      3000,
    );
  };

  const handleSearchChange = (newSearch: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newSearch.trim()) {
        next.set("q", newSearch);
      } else {
        next.delete("q");
      }
      return next;
    });
  };

  const handleStatusChange = (newStatus: StatusFilter) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newStatus === "all") {
        next.delete("status");
      } else {
        next.set("status", newStatus);
      }
      next.delete("page");
      return next;
    });
  };

  const handleSortChange = (newSort: SortOption) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newSort === "newest") {
        next.delete("sort");
      } else {
        next.set("sort", newSort);
      }
      return next;
    });
  };

  const handleViewChange = (newView: ViewMode) => {
    try {
      localStorage.setItem("kitob_courses_view_preference", newView);
    } catch {}
    setStoredViewPreference(newView);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("view", newView);
      return next;
    });
  };

  const resetStatus = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("status");
      next.delete("page");
      return next;
    });
  };

  const resetSearch = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("q");
      return next;
    });
  };

  const handlePageChange = (newPage: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newPage <= 1) {
        next.delete("page");
      } else {
        next.set("page", String(newPage));
      }
      return next;
    });
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const handleStartEdit = (course: CourseResponse, triggerElement?: HTMLElement | null) => {
    editInvokerRef.current = triggerElement ?? null;
    setEditingCourse(course);
    setPanelOpen(true);
  };

  const handleStartDuplicate = (course: CourseResponse, triggerElement?: HTMLElement | null) => {
    duplicateInvokerRef.current = triggerElement ?? null;
    setCopyTargetCourse(course);
    setCopyErrorMessage(undefined);
    setCopyConfirmOpen(true);
  };

  const handleCancelDuplicate = () => {
    if (isCopyPending) return;
    operationGenerationRef.current++;
    setCopyConfirmOpen(false);
    setCopyErrorMessage(undefined);
  };

  const handleConfirmCopy = async () => {
    if (!copyTargetCourse || isCopyPending) return;
    const opGen = ++operationGenerationRef.current;
    setCopyErrorMessage(undefined);
    setIsCopyPending(true);
    try {
      let schedule: CourseScheduleResponse[];
      try {
        schedule = await getCourseSchedule(copyTargetCourse.id);
      } catch {
        if (!isMountedRef.current || operationGenerationRef.current !== opGen) return;
        setCopyErrorMessage(t("courseCopyError"));
        setIsCopyPending(false);
        return;
      }
      if (!isMountedRef.current || operationGenerationRef.current !== opGen) return;
      if (!schedule || schedule.length === 0) {
        setCopyErrorMessage(t("courseCopyMissingSchedule"));
        setIsCopyPending(false);
        return;
      }
      const payload: CourseCreate = {
        title: `${copyTargetCourse.title} (${t("copySuffix")})`,
        description: copyTargetCourse.description ?? "",
        start_date: copyTargetCourse.start_date,
        end_date: copyTargetCourse.end_date,
        exam_type: copyTargetCourse.exam_type,
        price: copyTargetCourse.price,
        mentor_id: copyTargetCourse.mentor_id,
        schedules: schedule.map((s) => ({
          day_of_week: s.day_of_week,
          time_start: s.time_start,
          time_end: s.time_end,
        })),
      };
      const created = await copyMutation.mutateAsync({
        id: copyTargetCourse.id,
        payload,
      });
      if (!isMountedRef.current || operationGenerationRef.current !== opGen) return;
      setCopyConfirmOpen(false);
      setCopyTargetCourse(undefined);
      setCopyErrorMessage(undefined);
      showToast(t("courseCopied"));
      handleNavigateOut();
      navigate(`/courses/${created.id}`);
    } catch {
      if (!isMountedRef.current || operationGenerationRef.current !== opGen) return;
      setCopyErrorMessage(t("courseCopyError"));
    } finally {
      if (isMountedRef.current && operationGenerationRef.current === opGen) {
        setIsCopyPending(false);
      }
    }
  };

  const handleStartDelete = (course: CourseResponse, triggerElement?: HTMLElement | null) => {
    deleteInvokerRef.current = triggerElement ?? null;
    deleteSuccessRef.current = false;
    setDeleteTargetCourse(course);
    setDeleteErrorMessage(undefined);
    setDeleteConfirmOpen(true);
  };

  const handleCancelDelete = () => {
    if (deleteMutation.isPending) return;
    operationGenerationRef.current++;
    setDeleteConfirmOpen(false);
    setDeleteErrorMessage(undefined);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetCourse || deleteMutation.isPending) return;
    const opGen = ++operationGenerationRef.current;
    setDeleteErrorMessage(undefined);
    try {
      await deleteMutation.mutateAsync(deleteTargetCourse.id);
      if (!isMountedRef.current || operationGenerationRef.current !== opGen) return;
      deleteSuccessRef.current = true;
      setDeleteConfirmOpen(false);
      setDeleteErrorMessage(undefined);
      showToast(t("courseDeleted"));
    } catch {
      if (!isMountedRef.current || operationGenerationRef.current !== opGen) return;
      setDeleteErrorMessage(t("courseDeleteError"));
    }
  };

  const handleFormSaved = (action: "created" | "updated", _savedCourse: CourseResponse) => {
    showToast(action === "updated" ? t("courseUpdated") : t("courseCreated"));
  };

  const isTransitioningOwner = isPlaceholderData;
  const isInitialLoading = isLoading;
  const showLoadingSkeleton = isInitialLoading || isTransitioningOwner;
  const isBackgroundRefetchFailed = isError && Boolean(coursesPage) && !isPlaceholderData;
  const isHardError = isError && !coursesPage && !isPlaceholderData;
  const isOutOfRangePage =
    Boolean(coursesPage) &&
    !isPlaceholderData &&
    coursesPage!.total > 0 &&
    page > coursesPage!.total_pages;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        count={
          showLoadingSkeleton ? (
            <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-xs">
              <BrandActivityIndicator size={16} />
              <span>{t("loading")}</span>
            </span>
          ) : coursesPage ? (
            `(${coursesPage.total})`
          ) : undefined
        }
        actions={
          isSuperAdmin ? (
            <Button
              ref={addCourseButtonRef}
              variant="primary"
              onClick={() => {
                setEditingCourse(undefined);
                setPanelOpen(true);
              }}
              className="min-h-[44px] min-w-[44px] font-semibold shadow-xs"
            >
              <Plus size={18} className="mr-1.5" />
              {t("addCourse")}
            </Button>
          ) : undefined
        }
      />

      <CoursesToolbar
        search={search}
        onSearchChange={handleSearchChange}
        status={status}
        onStatusChange={handleStatusChange}
        sort={sort}
        onSortChange={handleSortChange}
        view={view}
        onViewChange={handleViewChange}
        isTabletOrDesktop={isTabletOrDesktop}
        searchInputRef={searchInputRef}
      />

      {isFetching && !isLoading && !isPlaceholderData ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-1.5 text-xs text-muted"
        >
          <BrandActivityIndicator size={14} />
          <span>{t("updating")}</span>
        </div>
      ) : null}

      {!isHardError ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted tabular-nums"
        >
          <span>
            {t("currentSortActive", {
              sort: t(`sort.${sort}`),
            })}
          </span>
          {search.trim() ? (
            showLoadingSkeleton || !coursesPage ? (
              <span className="inline-block h-4 w-28 rounded-[10px] bg-strip motion-safe:animate-pulse" />
            ) : (
              <span>
                {t("searchPageScope", {
                  count: filtered.length,
                  total: coursesPage.items.length,
                })}
              </span>
            )
          ) : null}
        </div>
      ) : null}

      {isBackgroundRefetchFailed ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-warning-surface bg-warning-surface/40 px-4 py-3 text-sm text-ink"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-warning shrink-0" />
            <span>{t("staleUpdateFailed")}</span>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => refetch()}
            className="min-h-[44px] min-w-[44px] text-xs font-semibold"
          >
            {t("common:retry")}
          </Button>
        </div>
      ) : null}

      {showLoadingSkeleton ? (
        isTabletOrDesktop ? (
          view === "grid" ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-5">
              {Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  className="flex flex-col overflow-hidden rounded-2xl border border-border-warm bg-card motion-safe:animate-pulse"
                >
                  <div className="relative h-28 shrink-0 bg-strip border-b border-border flex items-center justify-between p-3">
                    <div className="h-5 w-16 rounded-full bg-border" />
                  </div>
                  <div className="flex flex-1 flex-col justify-between gap-3 p-4 sm:p-5">
                    <div className="flex flex-col gap-2">
                      <div className="h-4 w-20 rounded-[10px] bg-strip" />
                      <div className="h-6 w-3/4 rounded-[10px] bg-strip" />
                      {isSuperAdmin ? (
                        <div className="h-4 w-1/2 rounded-[10px] bg-strip" />
                      ) : null}
                      <div className="h-4 w-2/3 rounded-[10px] bg-strip" />
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                      <div className="h-5 w-28 rounded-[10px] bg-strip" />
                      <div className="flex items-center gap-1">
                        {isMentor ? (
                          <div className="h-11 w-24 rounded-[10px] bg-strip" />
                        ) : null}
                        {isSuperAdmin ? (
                          <div className="h-11 w-11 rounded-[10px] bg-strip" />
                        ) : null}
                        <div className="h-11 w-11 rounded-[10px] bg-strip" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border-warm bg-card divide-y divide-border">
              {Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-center gap-4 px-5 py-3.5 motion-safe:animate-pulse"
                >
                  <div className="h-12 w-12 rounded-[10px] bg-strip shrink-0" />
                  <div className="min-w-44 flex-1 space-y-2">
                    <div className="h-4 w-44 rounded-[10px] bg-strip" />
                    <div className="h-3 w-24 rounded-[10px] bg-strip" />
                  </div>
                  {isSuperAdmin ? (
                    <div className="hidden w-44 shrink-0 md:flex">
                      <div className="h-4 w-32 rounded-[10px] bg-strip" />
                    </div>
                  ) : null}
                  <div className="hidden sm:inline-flex">
                    <div className="h-5 w-32 rounded-[10px] bg-strip" />
                  </div>
                  <div className="w-28 shrink-0">
                    <div className="h-4 w-20 rounded-[10px] bg-strip ml-auto" />
                  </div>
                  <div className="hidden sm:inline-flex">
                    <div className="h-5 w-16 rounded-full bg-strip" />
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-auto sm:ml-0">
                    {isMentor ? (
                      <div className="h-11 w-24 rounded-[10px] bg-strip" />
                    ) : null}
                    {isSuperAdmin ? (
                      <div className="h-11 w-11 rounded-[10px] bg-strip" />
                    ) : null}
                    <div className="h-11 w-11 rounded-[10px] bg-strip" />
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border-warm bg-card divide-y divide-border">
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3.5 sm:p-4 motion-safe:animate-pulse"
              >
                <div className="h-12 w-12 rounded-[10px] bg-strip shrink-0" />
                <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="h-6 w-36 rounded-[10px] bg-strip" />
                    <div className="h-5 w-14 rounded-full bg-strip" />
                  </div>
                  {isSuperAdmin ? (
                    <div className="h-4 w-28 rounded-[10px] bg-strip" />
                  ) : null}
                  <div className="h-4 w-36 rounded-[10px] bg-strip" />
                  <div className="h-4 w-20 rounded-[10px] bg-strip mt-0.5" />
                  {isMentor ? (
                    <div className="h-11 w-28 rounded-[10px] bg-strip mt-1" />
                  ) : null}
                </div>
                {isSuperAdmin ? (
                  <div className="h-11 w-11 rounded-[10px] bg-strip shrink-0 self-start" />
                ) : null}
              </div>
            ))}
          </div>
        )
      ) : isHardError ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border-warm bg-card p-10 text-center">
          <AlertCircle size={28} className="text-destructive" />
          <p className="text-sm font-semibold text-ink">{t("loadError")}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => refetch()}
            className="min-h-[44px] min-w-[44px] mt-2"
          >
            {t("common:retry")}
          </Button>
        </div>
      ) : coursesPage && coursesPage.total === 0 && status === "all" && !search ? (
        <EmptyState
          type="catalog"
          isSuperAdmin={isSuperAdmin}
          onCreateCourse={() => {
            setEditingCourse(undefined);
            setPanelOpen(true);
          }}
        />
      ) : coursesPage && coursesPage.total === 0 && status !== "all" && !search ? (
        <EmptyState type="status" onReset={resetStatus} />
      ) : isOutOfRangePage ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border-warm bg-card p-10 text-center">
          <BookOpen size={28} className="text-muted" />
          <p className="text-sm font-semibold text-ink">{t("noMatchesOnPage", { page })}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handlePageChange(1)}
            className="min-h-[44px] min-w-[44px] mt-2"
          >
            {t("common:back")}
          </Button>
          {coursesPage && coursesPage.total_pages > 1 ? (
            <div className="flex justify-center pt-4">
              <CoursePagination
                page={page}
                totalPages={coursesPage.total_pages}
                onPageChange={handlePageChange}
              />
            </div>
          ) : null}
        </div>
      ) : filtered.length === 0 && search ? (
        <div className="flex flex-col gap-4">
          <EmptyState type="search" searchQuery={search} page={page} onReset={resetSearch} />
          {coursesPage && coursesPage.total_pages > 1 ? (
            <div className="flex justify-center pt-2">
              <CoursePagination
                page={page}
                totalPages={coursesPage.total_pages}
                onPageChange={handlePageChange}
              />
            </div>
          ) : null}
        </div>
      ) : isTabletOrDesktop ? (
        <div className="flex flex-col gap-5">
          {view === "grid" ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-5">
              {filtered.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  mentor={mentorsPage?.items.find((m) => m.id === course.mentor_id)}
                  isSuperAdmin={isSuperAdmin}
                  isMentor={isMentor}
                  onNavigate={handleNavigateOut}
                  onEdit={handleStartEdit}
                  onDuplicate={handleStartDuplicate}
                  onDelete={handleStartDelete}
                />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border-warm bg-card divide-y divide-border">
              {filtered.map((course) => (
                <CourseListRow
                  key={course.id}
                  course={course}
                  mentor={mentorsPage?.items.find((m) => m.id === course.mentor_id)}
                  isSuperAdmin={isSuperAdmin}
                  isMentor={isMentor}
                  onNavigate={handleNavigateOut}
                  onEdit={handleStartEdit}
                  onDuplicate={handleStartDuplicate}
                  onDelete={handleStartDelete}
                />
              ))}
            </div>
          )}

          {coursesPage && coursesPage.total_pages > 1 ? (
            <div className="flex justify-center pt-2">
              <CoursePagination
                page={page}
                totalPages={coursesPage.total_pages}
                onPageChange={handlePageChange}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-2xl border border-border-warm bg-card divide-y divide-border">
            {filtered.map((course) => (
              <PhoneCourseRow
                key={course.id}
                course={course}
                mentor={mentorsPage?.items.find((m) => m.id === course.mentor_id)}
                isSuperAdmin={isSuperAdmin}
                isMentor={isMentor}
                onNavigate={handleNavigateOut}
                onEdit={handleStartEdit}
                onDuplicate={handleStartDuplicate}
                onDelete={handleStartDelete}
              />
            ))}
          </div>

          {coursesPage && coursesPage.total_pages > 1 ? (
            <div className="flex justify-center pt-2">
              <CoursePagination
                page={page}
                totalPages={coursesPage.total_pages}
                onPageChange={handlePageChange}
              />
            </div>
          ) : null}
        </div>
      )}

      {toast.visible ? (
        <div
          role="status"
          aria-live="polite"
          className={[
            "fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg motion-safe:animate-[card-scale-in_200ms_ease-out]",
            toast.variant === "success"
              ? "bg-maroon text-on-primary"
              : "bg-destructive text-on-destructive",
          ].join(" ")}
        >
          <span>{toast.message}</span>
        </div>
      ) : null}

      {isSuperAdmin ? (
        <CourseFormPanel
          open={panelOpen}
          course={editingCourse}
          finalFocus={getFormFinalFocus}
          onClose={() => {
            setPanelOpen(false);
            setEditingCourse(undefined);
          }}
          onSaved={handleFormSaved}
        />
      ) : null}

      <ConfirmDialog
        open={deleteConfirmOpen}
        title={t("deleteTitle")}
        message={
          deleteTargetCourse
            ? t("deleteMsg", { title: deleteTargetCourse.title })
            : ""
        }
        confirmLabel={t("delete")}
        cancelLabel={t("common:cancel")}
        pending={deleteMutation.isPending}
        errorMessage={deleteErrorMessage}
        finalFocus={getDeleteFinalFocus}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      <ConfirmDialog
        open={copyConfirmOpen}
        title={t("duplicateTitle")}
        message={
          copyTargetCourse
            ? t("duplicateMsg", { title: copyTargetCourse.title })
            : ""
        }
        confirmVariant="primary"
        confirmLabel={t("duplicate")}
        cancelLabel={t("common:cancel")}
        pending={isCopyPending}
        errorMessage={copyErrorMessage}
        finalFocus={getDuplicateFinalFocus}
        onConfirm={handleConfirmCopy}
        onCancel={handleCancelDuplicate}
      />
    </div>
  );
}
