import { formatNumber } from "../../i18n/formatters";

interface CourseScoreProps {
  score: number;
  max?: number | null;
  scoreClassName?: string;
}

const COURSE_SCORE_DIGITS: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };

export function CourseScore({ score, max, scoreClassName = "text-ink" }: CourseScoreProps) {
  const scoreText: string = formatNumber(score, undefined, COURSE_SCORE_DIGITS);
  const hasMax: boolean = typeof max === "number" && max > 0;
  return (
    <span data-course-score className={`font-semibold tabular-nums ${scoreClassName}`}>
      {hasMax ? `${scoreText} / ${formatNumber(max as number, undefined, COURSE_SCORE_DIGITS)}` : scoreText}
    </span>
  );
}
