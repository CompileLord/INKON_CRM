import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { PageContainer } from "../components/ui/PageContainer";
import { PageHeader } from "../components/ui/PageHeader";
import { Pagination } from "../components/ui/Pagination";
import { BrandActivityIndicator } from "../components/ui/BrandActivityIndicator";
import { CourseCard } from "../components/courses/CourseCard";
import { CourseListRow } from "../components/courses/CourseListRow";
import { CourseFormPanel } from "../components/courses/CourseFormPanel";
import { CoursesEmptyState } from "../components/courses/CoursesEmptyState";
import { CoursesSkeleton } from "../components/courses/CoursesSkeleton";
import { CoursesToolbar, type SortOption, type StatusFilter, type ViewMode } from "../components/courses/CoursesToolbar";
import { useCourseRowActions } from "../components/courses/useCourseRowActions";
import type { CourseMenuHandlers } from "../components/courses/useCourseMenu";
import { useCourses } from "../lib/courses/hooks";
import { useMentors } from "../lib/users/hooks";
import { useAuthStore } from "../store/authStore";
import { compareMoney } from "../lib/money";
import {
  buildValidatedCourseListUrl,
  getSavedScrollForCourseList,
  parseSafePageParam,
  recordCourseListNavigation,
} from "../lib/courses/returnContext";
import type { CourseResponse } from "../lib/courses/types";

const PAGE_SIZE: number = 12;
const VIEW_PREFERENCE_KEY: string = "kitob_courses_view_preference";

export function Courses() {
  const { t } = useTranslation(["courses", "common"]);
  const [searchParams, setSearchParams] = useSearchParams();
  const role = useAuthStore((state) => state.role);
  const isSuperAdmin: boolean = role === "superadmin";
  const isMentor: boolean = role === "mentor";

  const [isTabletOrDesktop, setIsTabletOrDesktop] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : true,
  );

  useEffect(() => {
    const priorScrollRestoration: ScrollRestoration =
      typeof history !== "undefined" && "scrollRestoration" in history ? history.scrollRestoration : "auto";
    if (typeof history !== "undefined" && "scrollRestoration" in history) history.scrollRestoration = "manual";
    const media: MediaQueryList = window.matchMedia("(min-width: 768px)");
    const handler = (event: MediaQueryListEvent): void => setIsTabletOrDesktop(event.matches);
    media.addEventListener("change", handler);
    return () => {
      if (typeof history !== "undefined" && "scrollRestoration" in history) history.scrollRestoration = priorScrollRestoration;
      media.removeEventListener("change", handler);
    };
  }, []);

  const rawStatus: string | null = searchParams.get("status");
  const status: StatusFilter = rawStatus === "active" || rawStatus === "archived" ? rawStatus : "all";
  const page: number = parseSafePageParam(searchParams.get("page"));
  const search: string = searchParams.get("q") ?? "";
  const sort: SortOption = searchParams.get("sort") === "price" ? "price" : "newest";

  const [storedViewPreference, setStoredViewPreference] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "grid";
    try {
      return localStorage.getItem(VIEW_PREFERENCE_KEY) === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  });
  const rawView: string | null = searchParams.get("view");
  const view: ViewMode = rawView === "list" ? "list" : rawView === "grid" ? "grid" : storedViewPreference;
  const renderedView: ViewMode = isTabletOrDesktop ? view : "list";

  const [panelOpen, setPanelOpen] = useState<boolean>(false);
  const [editingCourse, setEditingCourse] = useState<CourseResponse | undefined>(undefined);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const addCourseButtonRef = useRef<HTMLButtonElement | null>(null);
  const editInvokerRef = useRef<HTMLElement | null>(null);

  const { data: coursesPage, isLoading, isPlaceholderData, isError, isFetching, refetch } = useCourses({
    status: status === "all" ? undefined : status,
    page,
    page_size: PAGE_SIZE,
  });
  const { data: mentorsPage } = useMentors({ page_size: 100 }, isSuperAdmin);

  const hasRestoredScrollRef = useRef<boolean>(false);
  const currentValidatedUrl: string = useMemo(() => buildValidatedCourseListUrl(searchParams.toString()), [searchParams]);

  useEffect(() => {
    hasRestoredScrollRef.current = false;
  }, [currentValidatedUrl]);

  useEffect(() => {
    if (isLoading || isPlaceholderData || !coursesPage) return;
    if (hasRestoredScrollRef.current) return;
    const savedScrollY: number | null = getSavedScrollForCourseList(searchParams.toString());
    if (typeof savedScrollY === "number" && savedScrollY > 0) {
      hasRestoredScrollRef.current = true;
      const frameId: number = requestAnimationFrame(() => window.scrollTo({ top: savedScrollY, behavior: "auto" }));
      return () => cancelAnimationFrame(frameId);
    }
  }, [coursesPage, isLoading, isPlaceholderData, searchParams]);

  const handleNavigateOut = (): void => {
    recordCourseListNavigation(searchParams.toString());
  };
  const rowActions = useCourseRowActions({ searchInputRef, onNavigateOut: handleNavigateOut });

  const filtered = useMemo(() => {
    if (isPlaceholderData || !coursesPage) return [];
    const query: string = search.trim().toLowerCase();
    const items = coursesPage.items ?? [];
    const result = query ? items.filter((course) => course.title.toLowerCase().includes(query)) : items;
    return [...result].sort((left, right) => {
      if (sort === "price") return compareMoney(left.price, right.price);
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });
  }, [coursesPage, isPlaceholderData, search, sort]);

  const updateParams = (mutate: (next: URLSearchParams) => void): void => {
    setSearchParams((previous) => {
      const next: URLSearchParams = new URLSearchParams(previous);
      mutate(next);
      return next;
    });
  };
  const handleSearchChange = (value: string): void => updateParams((next) => (value.trim() ? next.set("q", value) : next.delete("q")));
  const handleStatusChange = (value: StatusFilter): void => updateParams((next) => {
    if (value === "all") next.delete("status");
    else next.set("status", value);
    next.delete("page");
  });
  const handleSortChange = (value: SortOption): void => updateParams((next) => (value === "newest" ? next.delete("sort") : next.set("sort", value)));
  const handleViewChange = (value: ViewMode): void => {
    try {
      localStorage.setItem(VIEW_PREFERENCE_KEY, value);
    } catch {}
    setStoredViewPreference(value);
    updateParams((next) => next.set("view", value));
  };
  const resetStatus = (): void => updateParams((next) => {
    next.delete("status");
    next.delete("page");
  });
  const resetSearch = (): void => updateParams((next) => next.delete("q"));
  const handlePageChange = (newPage: number): void => {
    updateParams((next) => (newPage <= 1 ? next.delete("page") : next.set("page", String(newPage))));
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const openCreatePanel = (): void => {
    setEditingCourse(undefined);
    setPanelOpen(true);
  };
  const handleStartEdit = (course: CourseResponse, triggerElement?: HTMLElement | null): void => {
    editInvokerRef.current = triggerElement ?? null;
    setEditingCourse(course);
    setPanelOpen(true);
  };
  const getFormFinalFocus = (): HTMLElement | null => {
    const invoker: HTMLElement | null = editingCourse ? editInvokerRef.current : addCourseButtonRef.current;
    return invoker && invoker.isConnected ? invoker : searchInputRef.current;
  };
  const menuHandlers: CourseMenuHandlers | null = isSuperAdmin
    ? { onEdit: handleStartEdit, onDuplicate: rowActions.startDuplicate, onDelete: rowActions.startDelete }
    : null;

  const showLoadingSkeleton: boolean = isLoading || isPlaceholderData;
  const isBackgroundRefetchFailed: boolean = isError && Boolean(coursesPage) && !isPlaceholderData;
  const isHardError: boolean = isError && !coursesPage && !isPlaceholderData;
  const isOutOfRangePage: boolean = Boolean(coursesPage) && !isPlaceholderData && coursesPage!.total > 0 && page > coursesPage!.total_pages;
  const mentorFor = (mentorId: number) => mentorsPage?.items.find((mentor) => mentor.id === mentorId);
  const pagination = coursesPage && coursesPage.total_pages > 1 ? (
    <div className="flex justify-center">
      <Pagination page={page} totalPages={coursesPage.total_pages} onPageChange={handlePageChange} />
    </div>
  ) : null;

  const renderBody = () => {
    if (showLoadingSkeleton) return <CoursesSkeleton mode={renderedView} showMentorColumn={isSuperAdmin} />;
    if (isHardError) {
      return (
        <div className="rounded-2xl border border-border bg-card">
          <ErrorState message={t("loadError")} onRetry={() => refetch()} />
        </div>
      );
    }
    if (coursesPage && coursesPage.total === 0 && status === "all" && !search) {
      return <CoursesEmptyState type="catalog" isSuperAdmin={isSuperAdmin} onCreateCourse={openCreatePanel} />;
    }
    if (coursesPage && coursesPage.total === 0 && status !== "all" && !search) {
      return <CoursesEmptyState type="status" onReset={resetStatus} />;
    }
    if (isOutOfRangePage) {
      return (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-card">
            <EmptyState
              title={t("noMatchesOnPage", { page })}
              action={<Button type="button" variant="secondary" onClick={() => handlePageChange(1)}>{t("common:back")}</Button>}
            />
          </div>
          {pagination}
        </div>
      );
    }
    if (filtered.length === 0 && search) {
      return (
        <div className="flex flex-col gap-4">
          <CoursesEmptyState type="search" searchQuery={search} page={page} onReset={resetSearch} />
          {pagination}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        {renderedView === "grid" ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-4">
            {filtered.map((course) => (
              <CourseCard key={course.id} course={course} mentor={mentorFor(course.mentor_id)} isMentor={isMentor} menuHandlers={menuHandlers} onNavigate={handleNavigateOut} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col rounded-2xl border border-border bg-card p-1">
            {filtered.map((course) => (
              <CourseListRow key={course.id} course={course} mentor={mentorFor(course.mentor_id)} showMentor={isSuperAdmin} isMentor={isMentor} menuHandlers={menuHandlers} onNavigate={handleNavigateOut} />
            ))}
          </div>
        )}
        {pagination}
      </div>
    );
  };

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        count={showLoadingSkeleton ? undefined : coursesPage ? `(${coursesPage.total})` : undefined}
        actions={isSuperAdmin ? (
          <Button ref={addCourseButtonRef} onClick={openCreatePanel}>
            <Plus size={18} aria-hidden="true" />
            {t("addCourse")}
          </Button>
        ) : undefined}
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
        showViewSwitch={isTabletOrDesktop}
        searchInputRef={searchInputRef}
      />

      {showLoadingSkeleton && (
        <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-sm text-muted">
          <BrandActivityIndicator size={16} />
          <span>{t("loading")}</span>
        </span>
      )}

      {isFetching && !isLoading && !isPlaceholderData && (
        <div role="status" aria-live="polite" className="flex items-center gap-1.5 text-sm text-muted">
          <BrandActivityIndicator size={14} />
          <span>{t("updating")}</span>
        </div>
      )}

      {!isHardError && search.trim() && !showLoadingSkeleton && coursesPage && (
        <p role="status" className="text-sm text-muted tabular-nums">
          {t("searchPageScope", { count: filtered.length, total: coursesPage.items.length })}
        </p>
      )}

      {isBackgroundRefetchFailed && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span>{t("staleUpdateFailed")}</span>
          <Button type="button" variant="secondary" onClick={() => refetch()}>{t("common:retry")}</Button>
        </div>
      )}

      {renderBody()}

      {rowActions.overlays}

      {isSuperAdmin && (
        <CourseFormPanel
          open={panelOpen}
          course={editingCourse}
          finalFocus={getFormFinalFocus}
          onClose={() => {
            setPanelOpen(false);
            setEditingCourse(undefined);
          }}
          onSaved={(action: "created" | "updated") => rowActions.showToast(action === "updated" ? t("courseUpdated") : t("courseCreated"))}
        />
      )}
    </PageContainer>
  );
}
