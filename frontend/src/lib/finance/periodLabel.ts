import { formatDate, getActiveLocale, SCHOOL_TIMEZONE } from "../../i18n/formatters";
import { FinanceUrlState, type CollectionRange } from "./urlState";

export class PeriodLabel {
  static compact(range: CollectionRange, language?: string): string {
    if (FinanceUrlState.isWholeMonth(range)) {
      const [year, month] = range.from.split("-").map(Number);
      return new Intl.DateTimeFormat(getActiveLocale(language), { month: "short", year: "numeric", timeZone: "UTC" }).format(
        new Date(Date.UTC(year, month - 1, 1)),
      );
    }
    return `${formatDate(range.from, language, SCHOOL_TIMEZONE)} – ${formatDate(range.to, language, SCHOOL_TIMEZONE)}`;
  }
}
