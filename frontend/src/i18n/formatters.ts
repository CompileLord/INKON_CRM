import i18n from "./index";

const localeMap: Record<string, string> = {
  ru: "ru-RU",
  en: "en-US",
  tg: "tg-TJ",
};

export function getActiveLocale(lng?: string): string {
  const current = lng || i18n.language || "ru";
  return localeMap[current] || "ru-RU";
}

export function formatDate(date: string | Date | null | undefined, lng?: string): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  return new Intl.DateTimeFormat(getActiveLocale(lng), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function formatDateTime(date: string | Date | null | undefined, lng?: string): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  return new Intl.DateTimeFormat(getActiveLocale(lng), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatTime(date: string | Date | null | undefined, lng?: string): string {
  if (!date) return "";
  if (typeof date === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(date)) {
    return date.slice(0, 5);
  }
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  return new Intl.DateTimeFormat(getActiveLocale(lng), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
