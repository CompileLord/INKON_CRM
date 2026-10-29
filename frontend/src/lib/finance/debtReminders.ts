import type { DebtItem, DebtReminderResult } from "./types";

export interface DebtReminderTally {
  queued: number;
  skipped: number;
}

export class DebtReminders {
  static canRemind(debt: DebtItem): boolean {
    return debt.reminder_channel === "telegram" || debt.reminder_channel === "sms";
  }

  static withdrawnOnlyStudentIds(debts: readonly DebtItem[]): Set<number> {
    const withdrawn: Set<number> = new Set();
    const others: Set<number> = new Set();
    for (const debt of debts) {
      (debt.enrollment_status === "withdrawn" ? withdrawn : others).add(debt.student.id);
    }
    for (const id of others) withdrawn.delete(id);
    return withdrawn;
  }

  static eligibleStudentIds(debts: readonly DebtItem[]): number[] {
    const ids: Set<number> = new Set();
    const withdrawnOnly: Set<number> = DebtReminders.withdrawnOnlyStudentIds(debts);
    for (const debt of debts) {
      if (DebtReminders.canRemind(debt) && !withdrawnOnly.has(debt.student.id)) ids.add(debt.student.id);
    }
    return [...ids];
  }

  static tally(results: readonly DebtReminderResult[]): DebtReminderTally {
    const queued: number = results.filter((result) => result.outcome === "queued").length;
    return { queued, skipped: results.length - queued };
  }
}
