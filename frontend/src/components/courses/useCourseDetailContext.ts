import { useEffect, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import {
  consumeSavedCourseDetailContext,
  getSavedCourseDetailContext,
  isInternalReturnSignal,
  type CourseDetailReturnContext,
} from "../../lib/courses/returnContext";
import type { EnrollmentStatus } from "../../lib/enrollments/types";
import type { CourseRosterSortOption } from "./CourseRosterSection";
import type { ProgressSortOption } from "./CourseProgressPane";

export type CourseTabId = "overview" | "students" | "progress";

const ROSTER_SORTS: readonly string[] = ["enrolled_desc", "enrolled_asc", "name_asc", "name_desc", "price_desc", "price_asc"];
const PROGRESS_SORTS: readonly string[] = ["score_desc", "score_asc", "name_asc", "name_desc"];
const LEGACY_PROGRESS_SORTS: readonly string[] = ["avg_desc", "latest_desc"];

class SavedContextReader {
  private readonly courseId: number | undefined;
  private readonly isReturning: boolean;

  constructor(courseId: number | undefined, isReturning: boolean) {
    this.courseId = courseId;
    this.isReturning = isReturning;
  }

  private saved(): CourseDetailReturnContext | null {
    if (!this.courseId || !this.isReturning) return null;
    return getSavedCourseDetailContext(this.courseId);
  }

  progressSearch(): string {
    const saved: CourseDetailReturnContext | null = this.saved();
    return saved?.tab === "progress" ? (saved.search ?? "") : "";
  }

  progressSort(): ProgressSortOption {
    return SavedContextReader.normalizeProgressSort(this.saved()?.tab === "progress" ? this.saved()?.sort : undefined);
  }

  rosterSearch(): string {
    const saved: CourseDetailReturnContext | null = this.saved();
    return saved?.tab === "students" ? (saved.search ?? "") : "";
  }

  rosterSort(): CourseRosterSortOption {
    const saved: CourseDetailReturnContext | null = this.saved();
    return saved?.tab === "students" ? SavedContextReader.normalizeRosterSort(saved.sort) : "enrolled_desc";
  }

  rosterPage(): number {
    const saved: CourseDetailReturnContext | null = this.saved();
    return saved?.tab === "students" && saved.rosterPage ? saved.rosterPage : 1;
  }

  rosterStatus(): EnrollmentStatus | undefined {
    const saved: CourseDetailReturnContext | null = this.saved();
    return saved?.tab === "students" ? saved.rosterStatus : undefined;
  }

  static normalizeProgressSort(sort: string | undefined): ProgressSortOption {
    if (sort !== undefined && PROGRESS_SORTS.includes(sort)) return sort as ProgressSortOption;
    if (sort !== undefined && LEGACY_PROGRESS_SORTS.includes(sort)) return "score_desc";
    return "score_desc";
  }

  static normalizeRosterSort(sort: string | undefined): CourseRosterSortOption {
    return sort !== undefined && ROSTER_SORTS.includes(sort) ? (sort as CourseRosterSortOption) : "enrolled_desc";
  }
}

export interface CourseDetailContext {
  progressSearch: string;
  setProgressSearch: (query: string) => void;
  progressSort: ProgressSortOption;
  setProgressSort: (sort: ProgressSortOption) => void;
  rosterSearch: string;
  setRosterSearch: (query: string) => void;
  rosterSort: CourseRosterSortOption;
  setRosterSort: (sort: CourseRosterSortOption) => void;
  rosterPage: number;
  setRosterPage: (page: number) => void;
  rosterStatus: EnrollmentStatus | undefined;
  setRosterStatus: (status: EnrollmentStatus | undefined) => void;
  markPaneReady: (tab: CourseTabId) => void;
  resetPaneReadiness: () => void;
  cancelScrollRestore: () => void;
}

export function useCourseDetailContext(courseId: number | undefined, activeTab: CourseTabId, isPaneDataReady: boolean): CourseDetailContext {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialReader: SavedContextReader = new SavedContextReader(courseId, isInternalReturnSignal(location.state, searchParams));

  const [progressSearch, setProgressSearch] = useState<string>(() => initialReader.progressSearch());
  const [progressSort, setProgressSort] = useState<ProgressSortOption>(() => initialReader.progressSort());
  const [rosterSearch, setRosterSearch] = useState<string>(() => initialReader.rosterSearch());
  const [rosterSort, setRosterSort] = useState<CourseRosterSortOption>(() => initialReader.rosterSort());
  const [rosterPage, setRosterPage] = useState<number>(() => initialReader.rosterPage());
  const [rosterStatus, setRosterStatus] = useState<EnrollmentStatus | undefined>(() => initialReader.rosterStatus());
  const [readyTab, setReadyTab] = useState<CourseTabId | null>(null);

  const restoredContextRef = useRef<number | null>(null);
  const pendingScrollYRef = useRef<number | null>(null);
  const previousCourseIdRef = useRef<number | undefined>(courseId);

  useEffect(() => {
    const cancelScroll = (): void => {
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
    if (!courseId || restoredContextRef.current === courseId) return;
    if (!isInternalReturnSignal(location.state, searchParams)) return;
    const saved: CourseDetailReturnContext | null = consumeSavedCourseDetailContext(courseId);
    if (!saved) return;
    restoredContextRef.current = courseId;

    if (saved.tab === "students") {
      if (saved.search !== undefined) setRosterSearch(saved.search);
      if (saved.sort !== undefined && ROSTER_SORTS.includes(saved.sort)) setRosterSort(saved.sort as CourseRosterSortOption);
      if (saved.rosterPage !== undefined && saved.rosterPage > 0) setRosterPage(saved.rosterPage);
      if (saved.rosterStatus !== undefined) setRosterStatus(saved.rosterStatus);
    } else {
      if (saved.search !== undefined) setProgressSearch(saved.search);
      if (saved.sort) setProgressSort(SavedContextReader.normalizeProgressSort(saved.sort));
    }

    setSearchParams(
      (previous: URLSearchParams) => {
        const next: URLSearchParams = new URLSearchParams(previous);
        next.delete("return");
        next.delete("returned");
        if (saved.tab && saved.tab !== "overview") next.set("tab", saved.tab);
        else next.delete("tab");
        if (saved.periodId) next.set("period", String(saved.periodId));
        return next;
      },
      { replace: true },
    );
    if (saved.scrollY > 0) pendingScrollYRef.current = saved.scrollY;
  }, [courseId, location.state, searchParams, setSearchParams]);

  useEffect(() => {
    if (previousCourseIdRef.current === courseId) return;
    previousCourseIdRef.current = courseId;
    if (isInternalReturnSignal(location.state, searchParams)) return;
    setRosterSearch("");
    setRosterSort("enrolled_desc");
    setRosterPage(1);
    setRosterStatus(undefined);
    setProgressSearch("");
    setProgressSort("score_desc");
  }, [courseId, location.state, searchParams]);

  const isCurrentPaneSettled: boolean = isPaneDataReady && readyTab === activeTab;

  useEffect(() => {
    if (!isCurrentPaneSettled) return;
    if (pendingScrollYRef.current === null || pendingScrollYRef.current <= 0) return;
    const targetY: number = pendingScrollYRef.current;
    const restore = (): void => {
      const maxScroll: number = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const scrollToY: number = document.documentElement.scrollHeight > 0 ? Math.min(targetY, maxScroll) : targetY;
      window.scrollTo({ top: scrollToY, behavior: "instant" as ScrollBehavior });
      pendingScrollYRef.current = null;
    };
    restore();
    const frameId: number = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frameId);
  }, [isCurrentPaneSettled, activeTab]);

  return {
    progressSearch,
    setProgressSearch,
    progressSort,
    setProgressSort,
    rosterSearch,
    setRosterSearch,
    rosterSort,
    setRosterSort,
    rosterPage,
    setRosterPage,
    rosterStatus,
    setRosterStatus,
    markPaneReady: setReadyTab,
    resetPaneReadiness: () => setReadyTab(null),
    cancelScrollRestore: () => {
      pendingScrollYRef.current = null;
    },
  };
}
