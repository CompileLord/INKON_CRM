import i18n from "./index";

export const SCHOOL_TIMEZONE = "Asia/Dushanbe";

const localeMap: Record<string, string> = {
  ru: "ru-RU",
  en: "en-US",
  tg: "tg-TJ",
};

const TAJIK_FALLBACK_LOCALE = "ru-RU";

function isLocaleSupportedByIntl(locale: string): boolean {
  return Intl.NumberFormat.supportedLocalesOf([locale]).length > 0
    && Intl.DateTimeFormat.supportedLocalesOf([locale]).length > 0;
}

export function getActiveLocale(lng?: string): string {
  const current = lng || i18n.language || "ru";
  const mapped = localeMap[current] || "ru-RU";
  return mapped === "tg-TJ" && !isLocaleSupportedByIntl(mapped) ? TAJIK_FALLBACK_LOCALE : mapped;
}

export function formatDate(
  date: string | Date | null | undefined,
  lng?: string,
  timeZone?: string
): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  return new Intl.DateTimeFormat(getActiveLocale(lng), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(d);
}

export function formatDateTime(
  date: string | Date | null | undefined,
  lng?: string,
  timeZone?: string
): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  return new Intl.DateTimeFormat(getActiveLocale(lng), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(d);
}

export function formatTime(
  date: string | Date | null | undefined,
  lng?: string,
  timeZone?: string
): string {
  if (!date) return "";
  if (typeof date === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(date) && !timeZone) {
    return date.slice(0, 5);
  }
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  return new Intl.DateTimeFormat(getActiveLocale(lng), {
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(d);
}

export function formatSchoolLessonDateTime(
  date: string | Date | null | undefined,
  lng?: string
): string {
  return formatDateTime(date, lng, SCHOOL_TIMEZONE);
}

export function formatSchoolLessonDate(
  date: string | Date | null | undefined,
  lng?: string
): string {
  return formatDate(date, lng, SCHOOL_TIMEZONE);
}

export function formatSchoolLessonTime(
  date: string | Date | null | undefined,
  lng?: string
): string {
  return formatTime(date, lng, SCHOOL_TIMEZONE);
}

function isTajikRequestedWithoutIntlSupport(lng?: string): boolean {
  const current = lng || i18n.language || "ru";
  return (localeMap[current] || "ru-RU") === "tg-TJ" && !isLocaleSupportedByIntl("tg-TJ");
}

function getSchoolWeekdayIndexMondayFirst(date: Date): number {
  const [year, month, day] = getSchoolCalendarDate(date).split("-").map(Number);
  const sundayFirstIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (sundayFirstIndex + 6) % 7;
}

export function formatSchoolLessonWeekday(
  date: string | Date | null | undefined,
  lng?: string
): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  if (isTajikRequestedWithoutIntlSupport(lng)) {
    return i18n.t(`student:weekdays.${getSchoolWeekdayIndexMondayFirst(d)}`, { lng: "tg" });
  }
  return new Intl.DateTimeFormat(getActiveLocale(lng), {
    weekday: "short",
    timeZone: SCHOOL_TIMEZONE,
  }).format(d);
}

export function getSchoolCalendarDate(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: SCHOOL_TIMEZONE }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
  return value("year") + "-" + value("month") + "-" + value("day");
}

export function schoolCalendarDateToTimestamp(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + "T00:00:00+05:00");
  return Number.isNaN(date.getTime()) || getSchoolCalendarDate(date) !== value ? null : date.toISOString();
}

export function getSchoolMonthRange(date: Date = new Date()): { start: string; end: string } {
  const calendarDate = getSchoolCalendarDate(date);
  const [year, month] = calendarDate.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = calendarDate.substring(0, 7);
  return { start: prefix + "-01", end: prefix + "-" + String(lastDay).padStart(2, "0") };
}

export function formatRecentRelativeTime(
  date: string | Date | null | undefined,
  lng?: string,
  now: Date = new Date()
): string | null {
  if (!date) return null;
  const moment = typeof date === "string" ? new Date(date) : date;
  if (isNaN(moment.getTime())) return null;
  const elapsedMinutes = Math.floor((now.getTime() - moment.getTime()) / 60000);
  if (elapsedMinutes < 0 || elapsedMinutes >= 60) return null;
  return new Intl.RelativeTimeFormat(getActiveLocale(lng), { numeric: "auto" }).format(-elapsedMinutes, "minute");
}

export function formatPercentage(value: number, lng?: string): string {
  return `${formatNumber(value, lng, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

export function formatNumber(value: number, lng?: string, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(getActiveLocale(lng), options).format(value);
}
