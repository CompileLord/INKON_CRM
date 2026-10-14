import type { Location } from "react-router-dom";
import type { JournalPeriod } from "../courses/types";

export type PeriodTiming = "current" | "latest" | "upcoming" | "past";
export type PeriodSource = "query" | "current" | "latest" | "upcoming";
export type LessonSource = "query" | "today" | "latest" | "first";
export type WorkspaceTab = "gradebook" | "progress";
export type GradebookView = "grid" | "summary";

export interface PeriodResolution {
  period: JournalPeriod | undefined;
  source: PeriodSource | undefined;
  queryInvalid: boolean;
}

export interface LessonResolution {
  lesson: string | undefined;
  source: LessonSource | undefined;
  queryInvalid: boolean;
}

export const PERIOD_QUERY_KEY = "period";
export const LESSON_QUERY_KEY = "lesson";
export const TAB_QUERY_KEY = "tab";
export const VIEW_QUERY_KEY = "view";

const POSITIVE_INTEGER_PATTERN: RegExp = /^[1-9]\d*$/;

export class JournalWorkspaceSelection {
  static parseCourseId(rawCourseId: string | undefined): number | undefined {
    if (rawCourseId === undefined || !POSITIVE_INTEGER_PATTERN.test(rawCourseId)) return undefined;
    const parsed: number = Number(rawCourseId);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }

  static orderPeriods(periods: readonly JournalPeriod[]): JournalPeriod[] {
    return [...periods].sort((a, b) => a.period_start.localeCompare(b.period_start) || a.id - b.id);
  }

  static isDateActive(period: JournalPeriod, today: string): boolean {
    return period.period_start <= today && today <= period.period_end;
  }

  static resolvePeriod(
    periods: readonly JournalPeriod[],
    rawPeriod: string | null,
    today: string,
  ): PeriodResolution {
    if (periods.length === 0) return { period: undefined, source: undefined, queryInvalid: rawPeriod !== null };
    const ordered: JournalPeriod[] = JournalWorkspaceSelection.orderPeriods(periods);
    const requested: JournalPeriod | undefined =
      rawPeriod !== null && POSITIVE_INTEGER_PATTERN.test(rawPeriod)
        ? ordered.find((period) => period.id === Number(rawPeriod))
        : undefined;
    if (requested) return { period: requested, source: "query", queryInvalid: false };

    const queryInvalid: boolean = rawPeriod !== null;
    const dateActive: JournalPeriod | undefined = ordered.find((period) =>
      JournalWorkspaceSelection.isDateActive(period, today),
    );
    if (dateActive) return { period: dateActive, source: "current", queryInvalid };

    const started: JournalPeriod[] = ordered.filter((period) => period.period_start <= today);
    if (started.length > 0) return { period: started[started.length - 1], source: "latest", queryInvalid };
    return { period: ordered[0], source: "upcoming", queryInvalid };
  }

  static timingOf(period: JournalPeriod, periods: readonly JournalPeriod[], today: string): PeriodTiming {
    if (JournalWorkspaceSelection.isDateActive(period, today)) return "current";
    if (period.period_start > today) return "upcoming";
    const hasDateActivePeriod: boolean = periods.some((candidate) =>
      JournalWorkspaceSelection.isDateActive(candidate, today),
    );
    if (hasDateActivePeriod) return "past";
    const latestStarted: JournalPeriod | undefined = JournalWorkspaceSelection.orderPeriods(periods)
      .filter((candidate) => candidate.period_start <= today)
      .pop();
    return latestStarted?.id === period.id ? "latest" : "past";
  }

  static orderLessonDates(lessonDates: readonly string[]): string[] {
    return [...lessonDates].sort();
  }

  static resolveLesson(lessonDates: readonly string[], rawLesson: string | null, today: string): LessonResolution {
    const ordered: string[] = JournalWorkspaceSelection.orderLessonDates(lessonDates);
    const queryInvalid: boolean = rawLesson !== null && !ordered.includes(rawLesson);
    if (ordered.length === 0) return { lesson: undefined, source: undefined, queryInvalid };
    if (rawLesson !== null && ordered.includes(rawLesson)) return { lesson: rawLesson, source: "query", queryInvalid };
    if (ordered.includes(today)) return { lesson: today, source: "today", queryInvalid };
    const onOrBeforeToday: string[] = ordered.filter((date) => date <= today);
    if (onOrBeforeToday.length > 0) {
      return { lesson: onOrBeforeToday[onOrBeforeToday.length - 1], source: "latest", queryInvalid };
    }
    return { lesson: ordered[0], source: "first", queryInvalid };
  }

  static neighbourLesson(lessonDates: readonly string[], current: string | undefined, offset: -1 | 1): string | undefined {
    if (current === undefined) return undefined;
    const ordered: string[] = JournalWorkspaceSelection.orderLessonDates(lessonDates);
    const index: number = ordered.indexOf(current);
    if (index === -1) return undefined;
    return ordered[index + offset];
  }

  static parseTab(rawTab: string | null): { tab: WorkspaceTab; queryInvalid: boolean } {
    if (rawTab === null || rawTab === "gradebook") return { tab: "gradebook", queryInvalid: rawTab !== null };
    if (rawTab === "progress") return { tab: "progress", queryInvalid: false };
    return { tab: "gradebook", queryInvalid: true };
  }

  static parseView(rawView: string | null): { view: GradebookView; queryInvalid: boolean } {
    if (rawView === null || rawView === "grid") return { view: "grid", queryInvalid: rawView !== null };
    if (rawView === "summary") return { view: "summary", queryInvalid: false };
    return { view: "grid", queryInvalid: true };
  }

  static changesJournalContext(change: { currentLocation: Location; nextLocation: Location }): boolean {
    if (change.currentLocation.pathname !== change.nextLocation.pathname) return true;
    const currentPeriod: string | null = new URLSearchParams(change.currentLocation.search).get(PERIOD_QUERY_KEY);
    const nextPeriod: string | null = new URLSearchParams(change.nextLocation.search).get(PERIOD_QUERY_KEY);
    return currentPeriod !== nextPeriod;
  }
}
