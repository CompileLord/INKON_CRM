export class CalendarDates {
  static toIso(year: number, month: number, day: number): string {
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  static isValidIso(value: string): boolean {
    const match: RegExpMatchArray | null = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match === null) return false;
    const parsed: Date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return parsed.getUTCFullYear() === Number(match[1]) && parsed.getUTCMonth() === Number(match[2]) - 1 && parsed.getUTCDate() === Number(match[3]);
  }

  static parseTyped(text: string): string | null {
    const match: RegExpMatchArray | null = text.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (match === null) return null;
    const iso: string = CalendarDates.toIso(Number(match[3]), Number(match[2]), Number(match[1]));
    return CalendarDates.isValidIso(iso) ? iso : null;
  }

  static addDays(iso: string, days: number): string {
    const [year, month, day]: number[] = iso.split("-").map(Number);
    const shifted: Date = new Date(Date.UTC(year, month - 1, day + days));
    return CalendarDates.toIso(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
  }

  static addMonths(iso: string, months: number): string {
    const [year, month, day]: number[] = iso.split("-").map(Number);
    const firstOfTarget: Date = new Date(Date.UTC(year, month - 1 + months, 1));
    const lastDay: number = new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0)).getUTCDate();
    return CalendarDates.toIso(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, Math.min(day, lastDay));
  }

  static monthGrid(iso: string): string[] {
    const [year, month]: number[] = iso.split("-").map(Number);
    const firstWeekday: number = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
    const start: string = CalendarDates.toIso(year, month, 1);
    return Array.from({ length: 42 }, (_, index) => CalendarDates.addDays(start, index - firstWeekday));
  }
}
