import type { StudentJournalPeriod } from "../users/types";

export class StudentPeriodOrdering {
  static available(periods: readonly StudentJournalPeriod[]): StudentJournalPeriod[] {
    return periods.filter((period) => period.state !== "upcoming").sort((first, second) => second.period_start.localeCompare(first.period_start));
  }

  static upcoming(periods: readonly StudentJournalPeriod[]): StudentJournalPeriod[] {
    return periods.filter((period) => period.state === "upcoming").sort((first, second) => first.period_start.localeCompare(second.period_start));
  }

  static order(periods: readonly StudentJournalPeriod[]): StudentJournalPeriod[] {
    return [...StudentPeriodOrdering.available(periods), ...StudentPeriodOrdering.upcoming(periods)];
  }
}
