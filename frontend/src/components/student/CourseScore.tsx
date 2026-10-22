import { formatNumber } from "../../i18n/formatters";

interface CourseScoreProps {
  score: number;
  scoreClassName?: string;
}

const COURSE_SCORE_DIGITS: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };

export function CourseScore({ score, scoreClassName = "text-ink" }: CourseScoreProps) {
  return <span data-course-score className={`font-semibold tabular-nums ${scoreClassName}`}>{formatNumber(score, undefined, COURSE_SCORE_DIGITS)}</span>;
}
