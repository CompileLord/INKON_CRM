import { useTranslation } from "react-i18next";
import { ScoreFormat } from "./ScoreFormat";

interface ScoreFigureProps {
  score: number | null | undefined;
  max: number | null | undefined;
  showPercent?: boolean;
  className?: string;
}

export function ScoreFigure({ score, max, showPercent = true, className = "" }: ScoreFigureProps) {
  const { t, i18n } = useTranslation("ui");
  const ratio: string | null = ScoreFormat.ratio(score, max, i18n.language);
  if (ratio === null) {
    return <span aria-label={t("missing")} className={`tabular-nums text-muted ${className}`}>—</span>;
  }
  const percent: string | null = showPercent ? ScoreFormat.percentHint(score, max, i18n.language) : null;
  return (
    <span className={`tabular-nums ${className}`}>
      <span className="font-semibold text-ink">{ratio}</span>
      {percent !== null && <span className="ml-1.5 text-xs text-muted">{percent}</span>}
    </span>
  );
}
