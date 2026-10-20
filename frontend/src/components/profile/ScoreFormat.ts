import { formatNumber } from "../../i18n/formatters";

type ScoreValue = number | null | undefined;

export class ScoreFormat {
  static hasRatio(score: ScoreValue, max: ScoreValue): score is number {
    return typeof score === "number" && typeof max === "number" && max > 0;
  }

  static points(value: number, language: string): string {
    return formatNumber(value, language, { maximumFractionDigits: 1 });
  }

  static ratio(score: ScoreValue, max: ScoreValue, language: string): string | null {
    if (!ScoreFormat.hasRatio(score, max)) return null;
    return `${ScoreFormat.points(score, language)} / ${ScoreFormat.points(max as number, language)}`;
  }

  static percentHint(score: ScoreValue, max: ScoreValue, language: string): string | null {
    if (!ScoreFormat.hasRatio(score, max)) return null;
    const share: number = (score * 100) / (max as number);
    if (share > 100) return null;
    return `${formatNumber(share, language, { maximumFractionDigits: 0 })}%`;
  }

  static shareLabel(share: ScoreValue, language: string): string | null {
    if (typeof share !== "number" || share > 100) return null;
    return `${formatNumber(share, language, { maximumFractionDigits: 0 })}%`;
  }
}
