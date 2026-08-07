/**
 * `date_of_birth` is a date-only string ("YYYY-MM-DD"), not a datetime.
 * `new Date("YYYY-MM-DD")` parses it as UTC midnight, and `.toISOString()`
 * converts back through UTC — both shift the calendar day by one in any
 * timezone behind UTC. These helpers stay in local-date arithmetic instead.
 */

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function dateOnlyToDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return null;

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

export function dateToDateOnly(date: Date | null | undefined): string | null {
  if (!date) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
