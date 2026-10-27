import { useTranslation } from "react-i18next";
import { useCourses } from "../../lib/courses/hooks";
import { NextLessonFinder, type NextLesson } from "../../lib/dashboard/nextLesson";
import { formatSchoolLessonWeekday, formatTime } from "../../i18n/formatters";

export function useNextLessonText(): string | null {
  const { t, i18n } = useTranslation("dashboard");
  const { data } = useCourses({ status: "active", page_size: 100 });
  if (data === undefined) return null;
  const next: NextLesson | null = NextLessonFinder.find(data.items, new Date());
  if (next === null) return null;
  const time: string = formatTime(next.timeStart, i18n.language);
  if (next.dayOffset === 0) return t("nextLessonToday", { time });
  if (next.dayOffset === 1) return t("nextLessonTomorrow", { time });
  return t("nextLessonOnDay", { day: formatSchoolLessonWeekday(next.date, i18n.language), time });
}
