import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

export class PeriodNameFormatter {
  private static readonly PATTERN: RegExp = /^(Week|Month)\s+(\d+)$/i;

  static translate(label: string, translate: TFunction): string {
    const match: RegExpMatchArray | null = label.trim().match(PeriodNameFormatter.PATTERN);
    if (match === null) return label;
    const key: string = match[1].toLowerCase() === "week" ? "period.week" : "period.month";
    return translate(key, { ns: "ui", index: Number(match[2]) });
  }
}

export function usePeriodName(): (label: string) => string {
  const { t } = useTranslation("ui");
  return (label: string): string => PeriodNameFormatter.translate(label, t);
}
