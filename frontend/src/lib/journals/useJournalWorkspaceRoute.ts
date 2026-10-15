import { useCallback, useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { UseQueryResult } from "@tanstack/react-query";
import { useJournal } from "./hooks";
import type { JournalPeriod } from "../courses/types";
import type { JournalDetailResponse } from "./types";
import {
  JournalWorkspaceSelection,
  LESSON_QUERY_KEY,
  PERIOD_QUERY_KEY,
  STUDENT_QUERY_KEY,
  TAB_QUERY_KEY,
  VIEW_QUERY_KEY,
  type GradebookView,
  type LessonResolution,
  type PeriodResolution,
  type WorkspaceTab,
} from "./JournalWorkspaceSelection";

export type JournalRouteNoticeKind = "period" | "lesson";

interface JournalRouteLocationState {
  journalRouteNotice?: JournalRouteNoticeKind[];
}

interface UseJournalWorkspaceRouteArguments {
  periods: JournalPeriod[] | undefined;
  today: string;
}

export interface JournalWorkspaceRoute {
  periodResolution: PeriodResolution;
  journalQuery: UseQueryResult<JournalDetailResponse>;
  lessonResolution: LessonResolution;
  tab: WorkspaceTab;
  view: GradebookView;
  studentId: number | null;
  notices: JournalRouteNoticeKind[];
  selectPeriod: (periodId: number) => void;
  selectLesson: (lessonDate: string) => void;
  selectTab: (tab: WorkspaceTab) => void;
  selectView: (view: GradebookView) => void;
  selectStudent: (studentId: number | null) => void;
  dismissNotices: () => void;
}

function noticesFromState(state: unknown): JournalRouteNoticeKind[] {
  if (typeof state !== "object" || state === null || !("journalRouteNotice" in state)) return [];
  const raw: unknown = (state as JournalRouteLocationState).journalRouteNotice;
  if (!Array.isArray(raw)) return [];
  return raw.filter((kind): kind is JournalRouteNoticeKind => kind === "period" || kind === "lesson");
}

export function useJournalWorkspaceRoute({
  periods,
  today,
}: UseJournalWorkspaceRouteArguments): JournalWorkspaceRoute {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const rawPeriod: string | null = searchParams.get(PERIOD_QUERY_KEY);
  const rawLesson: string | null = searchParams.get(LESSON_QUERY_KEY);
  const rawTab: string | null = searchParams.get(TAB_QUERY_KEY);
  const rawView: string | null = searchParams.get(VIEW_QUERY_KEY);

  const periodResolution: PeriodResolution = JournalWorkspaceSelection.resolvePeriod(periods ?? [], rawPeriod, today);
  const journalQuery: UseQueryResult<JournalDetailResponse> = useJournal(periodResolution.period?.id);
  const lessonDates: string[] | undefined = journalQuery.data?.lesson_dates;
  const lessonResolution: LessonResolution = JournalWorkspaceSelection.resolveLesson(lessonDates ?? [], rawLesson, today);
  const tabParse = JournalWorkspaceSelection.parseTab(rawTab);
  const viewParse = JournalWorkspaceSelection.parseView(rawView);

  const periodsLoaded: boolean = periods !== undefined;
  const lessonsLoaded: boolean = lessonDates !== undefined;
  const staleKeys: string[] = [];
  if (periodsLoaded && periodResolution.queryInvalid) {
    staleKeys.push(PERIOD_QUERY_KEY);
  }
  if (lessonsLoaded && lessonResolution.queryInvalid && rawLesson !== null) {
    staleKeys.push(LESSON_QUERY_KEY);
  }
  if (tabParse.queryInvalid) staleKeys.push(TAB_QUERY_KEY);
  if (viewParse.queryInvalid) staleKeys.push(VIEW_QUERY_KEY);

  const staleSignature: string = staleKeys.join("|");
  const currentNotices: JournalRouteNoticeKind[] = noticesFromState(location.state);
  const noticeSignature: string = currentNotices.join("|");

  useEffect(() => {
    if (staleSignature === "") return;
    const keysToDrop: string[] = staleSignature.split("|");
    const existingNotices: JournalRouteNoticeKind[] = noticesFromState({
      journalRouteNotice: noticeSignature === "" ? [] : noticeSignature.split("|"),
    });
    const noticesToAdd: JournalRouteNoticeKind[] = keysToDrop.flatMap((key) =>
      key === PERIOD_QUERY_KEY ? (["period"] as const) : key === LESSON_QUERY_KEY ? (["lesson"] as const) : [],
    );
    const mergedNotices: JournalRouteNoticeKind[] = Array.from(new Set([...existingNotices, ...noticesToAdd]));
    setSearchParams(
      (previous) => {
        const next: URLSearchParams = new URLSearchParams(previous);
        keysToDrop.forEach((key) => next.delete(key));
        return next;
      },
      { replace: true, state: { journalRouteNotice: mergedNotices } satisfies JournalRouteLocationState },
    );
  }, [staleSignature, noticeSignature, setSearchParams]);

  const update = useCallback(
    (mutate: (next: URLSearchParams) => void, replace: boolean): void => {
      setSearchParams(
        (previous) => {
          const next: URLSearchParams = new URLSearchParams(previous);
          mutate(next);
          return next;
        },
        { replace },
      );
    },
    [setSearchParams],
  );

  const selectPeriod = useCallback(
    (periodId: number): void =>
      update((next) => {
        next.set(PERIOD_QUERY_KEY, String(periodId));
        next.delete(LESSON_QUERY_KEY);
        next.delete(STUDENT_QUERY_KEY);
      }, false),
    [update],
  );

  const selectLesson = useCallback(
    (lessonDate: string): void => update((next) => next.set(LESSON_QUERY_KEY, lessonDate), true),
    [update],
  );

  const selectTab = useCallback(
    (tab: WorkspaceTab): void =>
      update((next) => {
        if (tab === "gradebook") next.delete(TAB_QUERY_KEY);
        else next.set(TAB_QUERY_KEY, tab);
      }, true),
    [update],
  );

  const selectView = useCallback(
    (view: GradebookView): void =>
      update((next) => {
        if (view === "grid") {
          next.delete(VIEW_QUERY_KEY);
          next.delete(STUDENT_QUERY_KEY);
        } else next.set(VIEW_QUERY_KEY, view);
      }, true),
    [update],
  );

  const selectStudent = useCallback(
    (studentId: number | null): void =>
      update((next) => {
        if (studentId === null) next.delete(STUDENT_QUERY_KEY);
        else next.set(STUDENT_QUERY_KEY, String(studentId));
      }, true),
    [update],
  );

  const dismissNotices = useCallback((): void => {
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [navigate, location.pathname, location.search]);

  return {
    periodResolution,
    journalQuery,
    lessonResolution,
    tab: tabParse.tab,
    view: viewParse.view,
    studentId: JournalWorkspaceSelection.parseStudentId(searchParams.get(STUDENT_QUERY_KEY)),
    notices: currentNotices,
    selectPeriod,
    selectLesson,
    selectTab,
    selectView,
    selectStudent,
    dismissNotices,
  };
}
