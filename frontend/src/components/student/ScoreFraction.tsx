import { formatNumber, formatPercentage } from "../../i18n/formatters";

interface ScoreFractionProps {
  score: number;
  maximum: number;
  showPercentage?: boolean;
  scoreClassName?: string;
}

const SCORE_FRACTION_DIGITS: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };

export function ScoreFraction({ score, maximum, showPercentage = false, scoreClassName = "text-ink" }: ScoreFractionProps) {
  const hasMaximum: boolean = maximum > 0;
  return (
    <span data-score-fraction className="inline-flex flex-wrap items-baseline gap-x-1.5 tabular-nums">
      <span className={`font-semibold ${scoreClassName}`}>{formatNumber(score, undefined, SCORE_FRACTION_DIGITS)}</span>
      {hasMaximum && <span className="font-normal text-muted">/ {formatNumber(maximum, undefined, SCORE_FRACTION_DIGITS)}</span>}
      {hasMaximum && showPercentage && (
        <span className="text-sm font-normal text-muted" data-score-percentage>{formatPercentage((score * 100) / maximum)}</span>
      )}
    </span>
  );
}
