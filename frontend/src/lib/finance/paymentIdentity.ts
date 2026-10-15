import type { PaymentItem } from "./types";

export class PaymentIdentity {
  static displayName(payment: PaymentItem): string | null {
    const name: string = [payment.student_first_name, payment.student_last_name]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(" ");
    return name || null;
  }

  static studentIdsSharingAName(payments: readonly PaymentItem[]): Set<number> {
    const idsByName: Map<string, Set<number>> = new Map();
    for (const payment of payments) {
      const name: string | null = PaymentIdentity.displayName(payment);
      if (name === null) continue;
      const key: string = name.toLowerCase();
      idsByName.set(key, (idsByName.get(key) ?? new Set<number>()).add(payment.student_id));
    }
    const ambiguous: Set<number> = new Set();
    for (const ids of idsByName.values()) if (ids.size > 1) ids.forEach((id) => ambiguous.add(id));
    return ambiguous;
  }
}
