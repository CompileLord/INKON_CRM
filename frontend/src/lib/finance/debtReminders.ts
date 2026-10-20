import type { DebtItem, DebtReminderResult } from "./types";

export interface DebtReminderTally {
  queued: number;
  skipped: number;
}

export class DebtReminders {
  static canRemind(debt: DebtItem): boolean {
    return debt.parent_telegram_linked === true;
  }

  static eligibleStudentIds(debts: readonly DebtItem[]): number[] {
    const ids: Set<number> = new Set();
    for (const debt of debts) {
      if (DebtReminders.canRemind(debt)) ids.add(debt.student.id);
    }
    return [...ids];
  }

  static tally(results: readonly DebtReminderResult[]): DebtReminderTally {
    const queued: number = results.filter((result) => result.outcome === "queued").length;
    return { queued, skipped: results.length - queued };
  }
}
