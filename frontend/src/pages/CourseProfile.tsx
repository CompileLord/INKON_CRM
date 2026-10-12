import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, BookOpen, Calendar, Clock, RotateCcw } from "lucide-react";
import { useAuthStore, type AuthState } from "../store/authStore";
import {
  useCopyCourse,
  useCourse,
  useCourseJournals,
  useDeleteCourse,
} from "../lib/courses/hooks";
import { useMentorProfile } from "../lib/users/hooks";
import { resolveMediaUrl } from "../lib/users/media";
import { formatDate } from "../i18n/formatters";
import { formatMoney } from "../lib/money";
import { AuthApiError } from "../lib/auth/errors";
import { getCourseSchedule } from "../lib/courses/endpoints";
import { Button } from "../components/ui/Button";
import { BrandActivityIndicator } from "../components/ui/BrandActivityIndicator";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { CourseFormPanel } from "../components/courses/CourseFormPanel";
import { AdminCourseMenu } from "../components/courses/AdminCourseMenu";
import { CourseOverviewPane } from "../components/courses/CourseOverviewPane";
import { CourseStudentsPane } from "../components/courses/CourseStudentsPane";
import { CourseProgressPane } from "../components/courses/CourseProgressPane";
import type { SortOption, ViewMode } from "../components/courses/CourseProgressChart";
import {
  buildCourseJournalUrl,
  consumeSavedCourseDetailContext,
  getSavedCourseDetailContext,
  getSafeCourseReturnUrl,
  isInternalReturnSignal,
  recordCourseDetailNavigation,
} from "../lib/courses/returnContext";
import type { CourseCreate, CourseResponse, CourseScheduleCreate } from "../lib/courses/types";

type TabId = "overview" | "students" | "progress";

function parseSafeTab(raw: string | null): TabId {
  if (raw === "students" || raw === "progress") {
    return raw;
  }
  return "overview";
}

function CourseProfileOwner({ rawId }: { rawId: string | undefined }) {
  const { t } = useTranslation(["courses", "common"]);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const role = useAuthStore((s: AuthState) => s.role);
  const currentUserId = useAuthStore((s: AuthState) => s.userId);
  const isSuperAdmin = role === "superadmin";

  const numericId = rawId ? Number(rawId) : undefined;
  const courseId = Number.isSafeInteger(numericId) && (numericId as number) > 0 ? numericId : undefined;

  const rawTab = searchParams.get("tab");
  const activeTab = parseSafeTab(rawTab);

  const [imageError, setImageError] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [copyConfirmOpen, setCopyConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isCopyPending, setIsCopyPending] = useState(false);
  const [copyErrorMessage, setCopyErrorMessage] = useState<string | undefined>(undefined);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | undefined>(undefined);

  const [progressSearch, setProgressSearch] = useState(() => {
    if (!courseId) return "";
    const isReturning = isInternalReturnSignal(location.state, searchParams);
    if (!isReturning) return "";
    const saved = getSavedCourseDetailContext(courseId);
    return saved?.search ?? "";
  });
  const [progressSort, setProgressSort] = useState<SortOption>(() => {
    if (!courseId) return "avg_desc";
    const isReturning = isInternalReturnSignal(location.state, searchParams);
    if (!isReturning) return "avg_desc";
    const saved = getSavedCourseDetailContext(courseId);
    if (saved?.sort === "avg_desc" || saved?.sort === "name_asc" || saved?.sort === "latest_desc") {
      return saved.sort;
    }
    return "avg_desc";
  });
  const [progressView, setProgressView] = useState<ViewMode>(() => {
    if (!courseId) return "matrix";
    const isReturning = isInternalReturnSignal(location.state, searchParams);
    if (!isReturning) return "matrix";
    const saved = getSavedCourseDetailContext(courseId);
    if (saved?.view === "matrix" || saved?.view === "table") {
      return saved.view;
    }
    return "matrix";
  });

  const actionInvokerRef = useRef<HTMLElement | null>(null);
  const activeTabRef = useRef<HTMLButtonElement | null>(null);
  const tabListRef = useRef<HTMLDivElement | null>(null);

  const isMountedRef = useRef(true);
  const generationRef = useRef(0);
  const editGenerationRef = useRef(0);
  const restoredContextRef = useRef<number | null>(null);
  const pendingScrollYRef = useRef<number | null>(null);

  const [readyTab, setReadyTab] = useState<TabId | null>(null);

  const handlePaneReady = (tab: TabId) => {
    setReadyTab(tab);
  };

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

  const showToast = (message: string, variant: "success" | "error" = "success") => {
    setToast({ message, visible: true, variant });
    if (typeof window !== "undefined") {
      window.clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = window.setTimeout(
        () => setToast((prev) => ({ ...prev, visible: false })),
        3000,
      );
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      generationRef.current += 1;
      if (typeof window !== "undefined" && toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const cancelScroll = () => {
      pendingScrollYRef.current = null;
    };
    window.addEventListener("wheel", cancelScroll, { passive: true });
    window.addEventListener("touchstart", cancelScroll, { passive: true });
    window.addEventListener("keydown", cancelScroll, { passive: true });
    return () => {
      window.removeEventListener("wheel", cancelScroll);
      window.removeEventListener("touchstart", cancelScroll);
      window.removeEventListener("keydown", cancelScroll);
    };
  }, []);

  useEffect(() => {
    if (!courseId) return;
    if (restoredContextRef.current === courseId) return;

    const isReturning = isInternalReturnSignal(location.state, searchParams);
    if (!isReturning) return;

    const saved = consumeSavedCourseDetailContext(courseId);
    if (!saved) return;

    restoredContextRef.current = courseId;

    if (saved.search !== undefined) {
      setProgressSearch(saved.search);
    }
    if (
      saved.sort === "avg_desc" ||
      saved.sort === "name_asc" ||
      saved.sort === "latest_desc"
    ) {
      setProgressSort(saved.sort);
    }
    if (saved.view === "matrix" || saved.view === "table") {
      setProgressView(saved.view);
    }

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("return");
        next.delete("returned");
        if (saved.tab && saved.tab !== "overview") {
          next.set("tab", saved.tab);
        } else {
          next.delete("tab");
        }
        if (saved.periodId) {
          next.set("period", String(saved.periodId));
        }
        return next;
      },
      { replace: true },
    );

    if (saved.scrollY > 0) {
      pendingScrollYRef.current = saved.scrollY;
    }
  }, [courseId, location.state, searchParams, setSearchParams]);

  const {
    data: course,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useCourse(courseId);

  useEffect(() => {
    setImageError(false);
  }, [course?.photo_path]);

  const canQueryMentorProfile = Boolean(
    course?.mentor_id &&
      (isSuperAdmin || (role === "mentor" && currentUserId === course.mentor_id)),
  );
  const { data: mentorProfile } = useMentorProfile(
    canQueryMentorProfile ? course?.mentor_id : undefined,
  );

  const {
    data: journals,
    isLoading: isJournalsLoading,
    isError: isJournalsError,
    isSuccess: isJournalsSuccess,
    refetch: refetchJournals,
  } = useCourseJournals(activeTab === "progress" ? courseId : undefined);

  const isCurrentPaneSettled =
    Boolean(course) &&
    !isLoading &&
    readyTab === activeTab &&
    (activeTab !== "progress" || !isJournalsLoading);

  useEffect(() => {
    if (!isCurrentPaneSettled) return;
    if (pendingScrollYRef.current === null || pendingScrollYRef.current <= 0) return;

    const targetY = pendingScrollYRef.current;
    const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
    const maxScroll = Math.max(0, scrollableHeight);
    const scrollToY =
      document.documentElement.scrollHeight > 0
        ? Math.min(targetY, maxScroll)
        : targetY;

    window.scrollTo({ top: scrollToY, behavior: "instant" as ScrollBehavior });
    pendingScrollYRef.current = null;
  }, [isCurrentPaneSettled, activeTab]);

  useEffect(() => {
    if (activeTab !== "progress") return;
    if (isJournalsLoading || isJournalsError) return;
    const requestedPeriod = searchParams.get("period");
    if (!requestedPeriod) return;

    const parsedPeriodId = Number(requestedPeriod);
    const isStrictPositiveInt = Number.isSafeInteger(parsedPeriodId) && parsedPeriodId > 0;

    if (!isStrictPositiveInt) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("period");
          return next;
        },
        { replace: true },
      );
      return;
    }

    if (!journals) {
      return;
    }

    if (journals.length === 0) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("period");
          return next;
        },
        { replace: true },
      );
      return;
    }

    const isValidPeriod = journals.some((j) => j.id === parsedPeriodId);
    if (!isValidPeriod) {
      const fallbackPeriodId = journals[0].id;
      showToast(t("periodNotFoundHelp"), "error");
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("period", String(fallbackPeriodId));
          return next;
        },
        { replace: true },
      );
    }
  }, [
    activeTab,
    isJournalsLoading,
    isJournalsError,
    isJournalsSuccess,
    journals,
    searchParams,
    setSearchParams,
    t,
  ]);

  const copyMutation = useCopyCourse();
  const deleteMutation = useDeleteCourse();

  const handleTabClick = (nextTab: TabId) => {
    pendingScrollYRef.current = null;
    setReadyTab(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextTab === "overview") {
        next.delete("tab");
      } else {
        next.set("tab", nextTab);
      }
      return next;
    });
  };

  const handleTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const tabs: TabId[] = ["overview", "students", "progress"];
    const currentIndex = tabs.indexOf(activeTab);
    let nextIndex = currentIndex;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === "Home") {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      nextIndex = tabs.length - 1;
    }

    if (nextIndex !== currentIndex) {
      handleTabClick(tabs[nextIndex]);
      const buttons = tabListRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]',
      );
      buttons?.[nextIndex]?.focus();
    }
  };

  const handleOpenEdit = (_course: CourseResponse, invoker?: HTMLElement | null) => {
    actionInvokerRef.current = invoker ?? null;
    editGenerationRef.current = generationRef.current;
    setEditOpen(true);
  };

  const handleOpenDuplicate = (_course: CourseResponse, invoker?: HTMLElement | null) => {
    actionInvokerRef.current = invoker ?? null;
    setCopyErrorMessage(undefined);
    setCopyConfirmOpen(true);
  };

  const handleOpenDelete = (_course: CourseResponse, invoker?: HTMLElement | null) => {
    actionInvokerRef.current = invoker ?? null;
    setDeleteErrorMessage(undefined);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDuplicate = async () => {
    if (!course || isCopyPending) return;
    const opGen = generationRef.current;
    const targetCourseId = course.id;
    setIsCopyPending(true);
    setCopyErrorMessage(undefined);

    try {
      let existingSchedules: CourseScheduleCreate[] = [];
      try {
        const rawSchedule = await getCourseSchedule(targetCourseId);
        if (Array.isArray(rawSchedule) && rawSchedule.length > 0) {
          existingSchedules = rawSchedule.map((s) => ({
            day_of_week: s.day_of_week,
            time_start: s.time_start,
            time_end: s.time_end,
          }));
        }
      } catch {
        if (isMountedRef.current && generationRef.current === opGen) {
          setCopyErrorMessage(t("courseCopyError"));
          setIsCopyPending(false);
        }
        return;
      }

      if (!isMountedRef.current || generationRef.current !== opGen) {
        return;
      }

      if (!existingSchedules || existingSchedules.length === 0) {
        if (isMountedRef.current && generationRef.current === opGen) {
          setCopyErrorMessage(t("courseCopyMissingSchedule"));
          setIsCopyPending(false);
        }
        return;
      }

      if (!isMountedRef.current || generationRef.current !== opGen) {
        return;
      }

      const duplicatePayload: CourseCreate = {
        title: `${course.title} (${t("copySuffix")})`,
        description: course.description ?? "",
        start_date: course.start_date,
        end_date: course.end_date,
        exam_type: course.exam_type,
        price: course.price,
        mentor_id: course.mentor_id,
        schedules: existingSchedules,
      };

      const copied = await copyMutation.mutateAsync({
        id: targetCourseId,
        payload: duplicatePayload,
      });

      if (!isMountedRef.current || generationRef.current !== opGen) {
        return;
      }

      setCopyConfirmOpen(false);
      navigate(`/courses/${copied.id}`);
    } catch {
      if (!isMountedRef.current || generationRef.current !== opGen) {
        return;
      }
      setCopyErrorMessage(t("courseCopyError"));
    } finally {
      if (isMountedRef.current && generationRef.current === opGen) {
        setIsCopyPending(false);
      }
    }
  };

  const handleCancelDuplicate = () => {
    if (!isCopyPending) {
      setCopyConfirmOpen(false);
      setCopyErrorMessage(undefined);
    }
  };

  const handleConfirmDelete = async () => {
    if (!course || deleteMutation.isPending) return;
    const opGen = generationRef.current;
    const targetCourseId = course.id;
    setDeleteErrorMessage(undefined);

    try {
      await deleteMutation.mutateAsync(targetCourseId);
      if (!isMountedRef.current || generationRef.current !== opGen) {
        return;
      }
      setDeleteConfirmOpen(false);
      const safeReturnUrl = getSafeCourseReturnUrl();
      navigate(safeReturnUrl, { replace: true });
    } catch {
      if (!isMountedRef.current || generationRef.current !== opGen) {
        return;
      }
      setDeleteErrorMessage(t("courseDeleteError"));
    }
  };

  const handleCancelDelete = () => {
    if (!deleteMutation.isPending) {
      setDeleteConfirmOpen(false);
      setDeleteErrorMessage(undefined);
    }
  };

  const getActionFinalFocus = (): HTMLElement | null => {
    const invoker = actionInvokerRef.current;
    if (invoker && invoker.isConnected && invoker.offsetParent !== null) {
      return invoker;
    }
    const activeTabButton = activeTabRef.current;
    if (activeTabButton && activeTabButton.isConnected && activeTabButton.offsetParent !== null) {
      return activeTabButton;
    }
    const fallback = document.querySelector<HTMLElement>("main button:not([disabled]), main [tabindex='0']");
    return fallback;
  };

  const safeReturnUrl = getSafeCourseReturnUrl();
  const backLink = (
    <Link
      to={safeReturnUrl}
      className="inline-flex min-h-[44px] items-center gap-1.5 text-xs sm:text-sm font-medium text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon self-start"
    >
      <ArrowLeft size={16} />
      <span>{t("backToCourses")}</span>
    </Link>
  );

  const isAccessDenied =
    (error instanceof AuthApiError && error.status === 403) ||
    (typeof error === "object" && error !== null && (error as { status?: number }).status === 403);

  const isNotFound =
    !courseId ||
    (error instanceof AuthApiError && error.status === 404) ||
    (typeof error === "object" && error !== null && (error as { status?: number }).status === 404);

  if (isAccessDenied) {
    return (
      <div className="flex flex-col gap-4 sm:gap-6 min-w-0 max-w-full">
        {backLink}
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border-warm bg-card p-8 text-center shadow-xs">
          <p className="text-base font-semibold text-destructive">
            {t("accessDenied")}
          </p>
          <p className="text-sm text-muted">
            {t("accessDeniedHelp")}
          </p>
        </div>
      </div>
    );
  }

  if (isNotFound) {
    return (
      <div className="flex flex-col gap-4 sm:gap-6 min-w-0 max-w-full">
        {backLink}
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border-warm bg-card p-8 text-center shadow-xs">
          <p className="text-base font-semibold text-destructive">
            {t("notFound")}
          </p>
          <p className="text-sm text-muted">
            {t("notFoundHelp")}
          </p>
        </div>
      </div>
    );
  }

  if (isLoading && !course) {
    return (
      <div className="flex flex-col gap-4 sm:gap-6 min-w-0 max-w-full">
        {backLink}
        <div className="rounded-2xl border border-border-warm bg-card p-4 sm:p-5 md:p-6 shadow-xs min-w-0">
          <div className="flex flex-wrap md:flex-nowrap items-start justify-between gap-3 sm:gap-4 min-w-0">
            <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1">
              <div className="hidden md:flex h-20 w-20 shrink-0 rounded-xl bg-strip items-center justify-center">
                <BrandActivityIndicator size={28} />
              </div>
              <div className="flex-1 flex flex-col gap-2.5 min-w-0">
                <div className="h-7 w-3/4 max-w-md rounded-lg bg-strip motion-safe:animate-pulse" />
                <div className="h-4 w-1/2 max-w-xs rounded bg-strip motion-safe:animate-pulse" />
                <div className="h-4 w-1/3 max-w-[200px] rounded bg-strip motion-safe:animate-pulse" />
              </div>
            </div>
            <div className="h-11 w-32 rounded-[10px] bg-strip motion-safe:animate-pulse hidden md:block shrink-0" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 rounded-xl border border-border bg-strip p-3 sm:p-4 divide-y sm:divide-y-0 sm:divide-x divide-border min-w-0">
          {[1, 2, 3].map((cell) => (
            <div key={cell} className="flex flex-col justify-center pt-2 sm:pt-0 sm:px-3 first:pt-0 first:px-0 min-w-0 gap-1.5">
              <div className="h-3 w-20 rounded bg-border motion-safe:animate-pulse" />
              <div className="h-6 w-16 rounded bg-border motion-safe:animate-pulse" />
            </div>
          ))}
        </div>

        <div className="h-11 w-64 rounded-xl bg-strip motion-safe:animate-pulse" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 items-start min-w-0">
          <div className="md:col-span-2 h-64 rounded-2xl border border-border-warm bg-card p-4 sm:p-6 motion-safe:animate-pulse flex items-center justify-center">
            <BrandActivityIndicator size={32} />
          </div>
          <div className="md:col-span-1 h-64 rounded-2xl border border-border-warm bg-card p-4 sm:p-6 motion-safe:animate-pulse flex items-center justify-center">
            <BrandActivityIndicator size={28} />
          </div>
        </div>
      </div>
    );
  }

  if (isError && !course) {
    return (
      <div className="flex flex-col gap-4 sm:gap-6 min-w-0 max-w-full">
        {backLink}
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border-warm bg-card p-8 text-center shadow-xs">
          <p className="text-base font-semibold text-destructive">
            {t("loadError")}
          </p>
          <p className="text-sm text-muted">
            {t("common:errorTryAgain")}
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => refetch()}
            className="mt-2 min-h-[44px] min-w-[44px] gap-1.5"
          >
            <RotateCcw size={14} />
            <span>{t("common:retry")}</span>
          </Button>
        </div>
      </div>
    );
  }

  if (!course) {
    return null;
  }

  const coursePhotoUrl =
    !imageError && course.photo_path ? resolveMediaUrl(course.photo_path) : null;

  const mentorName = mentorProfile
    ? `${mentorProfile.user.first_name} ${mentorProfile.user.last_name}`.trim()
    : null;

  const journalUrl = buildCourseJournalUrl(course.id);

  const handleJournalDeparture = () => {
    recordCourseDetailNavigation(course.id, {
      tab: activeTab,
      periodId: searchParams.get("period") ? Number(searchParams.get("period")) : undefined,
      search: progressSearch,
      sort: progressSort,
      view: progressView,
      scrollY: typeof window !== "undefined" ? window.scrollY : 0,
    });
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: t("tabs.overview") },
    { id: "students", label: t("tabs.students") },
    { id: "progress", label: t("tabs.progress") },
  ];

  return (
    <div className="flex flex-col gap-4 sm:gap-6 min-w-0 max-w-full">
      {backLink}

      {isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <span>{t("loadError")}</span>
          <Button
            type="button"
            variant="secondary"
            onClick={() => refetch()}
            className="min-h-[44px] min-w-[44px] gap-1.5"
          >
            <RotateCcw size={14} />
            <span>{t("common:retry")}</span>
          </Button>
        </div>
      ) : null}

      <div className="rounded-2xl border border-border-warm bg-card p-4 sm:p-5 md:p-6 shadow-xs min-w-0 max-w-full">
        <div className="flex flex-wrap md:flex-nowrap items-start justify-between gap-3 sm:gap-4 min-w-0">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1 order-1">
            <div className="hidden md:flex h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border-warm bg-strip items-center justify-center">
              {coursePhotoUrl ? (
                <img
                  src={coursePhotoUrl}
                  alt=""
                  onError={() => setImageError(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <BookOpen size={28} className="text-muted" />
              )}
            </div>

            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <h1 className="text-[24px] leading-[32px] md:text-[28px] md:leading-[36px] font-bold text-ink break-words min-w-0">
                  {course.title}
                </h1>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0 border ${
                    course.status === "active"
                      ? "bg-cream text-ink border-border-warm"
                      : "bg-strip text-muted border-border"
                  }`}
                >
                  {t(`filter.${course.status}`)}
                </span>
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

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted min-w-0">
                {mentorName ? (
                  <span className="font-medium text-ink break-words">
                    {mentorName}
                  </span>
                ) : null}
                {mentorName ? <span>•</span> : null}
                <span className="inline-flex items-center gap-1">
                  <Clock size={13} className="text-muted shrink-0" />
                  <span>{t(`examTypeLabel.${course.exam_type}`)}</span>
                </span>
                <span>•</span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Calendar size={13} className="text-muted shrink-0" />
                  <span>
                    {formatDate(course.start_date)} – {formatDate(course.end_date)}
                  </span>
                </span>
                <span className="hidden md:inline">•</span>
                <span className="hidden md:inline font-semibold tabular-nums text-ink">
                  {formatMoney(course.price)} {t("currencyPerMonth")}
                </span>
              </div>

              <div className="mt-2 md:hidden">
                <p className="text-base leading-6 font-semibold tabular-nums text-ink">
                  {formatMoney(course.price)} {t("currencyPerMonth")}
                </p>
              </div>
            </div>
          </div>

          {isSuperAdmin ? (
            <div className="shrink-0 order-2 md:order-3">
              <AdminCourseMenu
                course={course}
                onEdit={handleOpenEdit}
                onDuplicate={handleOpenDuplicate}
                onDelete={handleOpenDelete}
              />
            </div>
          ) : null}

          <Link
            to={journalUrl}
            onClick={handleJournalDeparture}
            className="order-3 md:order-2 w-full md:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-[10px] bg-maroon px-4 py-2.5 text-sm font-medium text-on-primary shadow-xs hover:bg-maroon-dark hover:shadow-sm motion-safe:transition-[background-color,transform,box-shadow,border-color,opacity] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.96] focus-visible:active:scale-100 focus-visible:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card text-center shrink-0"
          >
            <BookOpen size={16} />
            <span>{t("openJournal")}</span>
          </Link>
        </div>
      </div>

      <div className="relative max-w-full min-w-0">
        <div
          ref={tabListRef}
          role="tablist"
          aria-label={t("title")}
          className="flex overflow-x-auto no-scrollbar max-w-full min-w-0 border-b border-border gap-1"
          onKeyDown={handleTabKeyDown}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={isActive ? activeTabRef : undefined}
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => handleTabClick(tab.id)}
                className={`shrink-0 min-h-[44px] px-3.5 sm:px-4 py-2 text-sm rounded-t-xl border-b-2 motion-safe:transition-colors motion-safe:duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon ${
                  isActive
                    ? "bg-beige text-ink border-maroon dark:border-accent font-semibold dark:bg-row-hover"
                    : "border-transparent text-muted hover:text-ink hover:bg-strip/50 font-medium"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div
          className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-card to-transparent md:hidden"
          aria-hidden="true"
        />
      </div>

      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        tabIndex={0}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon rounded-2xl min-w-0 max-w-full"
      >
        {activeTab === "overview" ? (
          <CourseOverviewPane
            course={course}
            isSuperAdmin={isSuperAdmin}
            onReady={() => handlePaneReady("overview")}
          />
        ) : null}

        {activeTab === "students" ? (
          <CourseStudentsPane
            courseId={course.id}
            onToast={showToast}
            onReady={() => handlePaneReady("students")}
          />
        ) : null}

        {activeTab === "progress" ? (
          <div className="flex flex-col gap-4">
            {isJournalsError ? (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <span>{t("journalsLoadError")}</span>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => refetchJournals()}
                  className="min-h-[44px] min-w-[44px] gap-1.5"
                >
                  <RotateCcw size={14} />
                  <span>{t("common:retry")}</span>
                </Button>
              </div>
            ) : null}
            <CourseProgressPane
              courseId={course.id}
              searchQuery={progressSearch}
              onSearchQueryChange={setProgressSearch}
              sortOption={progressSort}
              onSortOptionChange={setProgressSort}
              viewMode={progressView}
              onViewModeChange={setProgressView}
              onReady={() => handlePaneReady("progress")}
            />
          </div>
        ) : null}
      </div>

      {editOpen ? (
        <CourseFormPanel
          open={editOpen}
          course={course}
          onClose={() => {
            if (!isMountedRef.current || generationRef.current !== editGenerationRef.current) return;
            setEditOpen(false);
            const invoker = getActionFinalFocus();
            invoker?.focus();
          }}
          onSaved={() => {
            if (!isMountedRef.current || generationRef.current !== editGenerationRef.current) return;
            setEditOpen(false);
            showToast(t("courseUpdated"));
            refetch();
            const invoker = getActionFinalFocus();
            invoker?.focus();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={copyConfirmOpen}
        title={t("duplicateTitle")}
        message={t("duplicateMsg", { title: course.title })}
        confirmLabel={t("duplicate")}
        cancelLabel={t("common:cancel")}
        confirmVariant="primary"
        pending={isCopyPending}
        errorMessage={copyErrorMessage}
        finalFocus={getActionFinalFocus}
        onConfirm={handleConfirmDuplicate}
        onCancel={handleCancelDuplicate}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title={t("deleteTitle")}
        message={t("deleteMsg", { title: course.title })}
        confirmLabel={t("delete")}
        cancelLabel={t("common:cancel")}
        confirmVariant="destructive"
        pending={deleteMutation.isPending}
        errorMessage={deleteErrorMessage}
        finalFocus={getActionFinalFocus}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      {toast.visible ? (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-4 right-4 z-50 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${
            toast.variant === "error"
              ? "bg-destructive text-on-destructive"
              : "bg-ink text-card"
          }`}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}

export function CourseProfile() {
  const { id } = useParams<{ id: string }>();
  return <CourseProfileOwner key={id ?? "unknown"} rawId={id} />;
}
