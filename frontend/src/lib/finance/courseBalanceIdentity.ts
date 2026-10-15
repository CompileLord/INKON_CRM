import type { DebtItem } from "./types";

export class CourseBalanceIdentity {
  static displayName(debt: DebtItem): string {
    return `${debt.student.first_name} ${debt.student.last_name}`;
  }

  static studentIdsSharingAName(debts: readonly DebtItem[]): Set<number> {
    const idsByName: Map<string, Set<number>> = new Map();
    for (const debt of debts) {
      const name: string = CourseBalanceIdentity.displayName(debt).trim().toLowerCase();
      idsByName.set(name, (idsByName.get(name) ?? new Set<number>()).add(debt.student.id));
    }
    const ambiguous: Set<number> = new Set();
    for (const ids of idsByName.values()) if (ids.size > 1) ids.forEach((id) => ambiguous.add(id));
    return ambiguous;
  }
}
