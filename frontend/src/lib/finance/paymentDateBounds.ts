import type { PaymentFilters } from "./api";

export interface PaymentDayRange {
  from: string | null;
  to: string | null;
}

export class PaymentDateBounds {
  private static readonly dushanbeOffset: string = "+05:00";

  static startOfDay(day: string): string {
    return `${day}T00:00:00${PaymentDateBounds.dushanbeOffset}`;
  }

  static endOfDay(day: string): string {
    return `${day}T23:59:59.999999${PaymentDateBounds.dushanbeOffset}`;
  }

  static toFilters(range: PaymentDayRange): Pick<PaymentFilters, "dateFrom" | "dateTo"> {
    return {
      ...(range.from ? { dateFrom: PaymentDateBounds.startOfDay(range.from) } : {}),
      ...(range.to ? { dateTo: PaymentDateBounds.endOfDay(range.to) } : {}),
    };
  }
}
