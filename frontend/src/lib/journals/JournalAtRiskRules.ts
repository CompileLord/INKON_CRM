import type { JournalStudentResponse } from "./types";

export class JournalAtRiskRules {
  static readonly MINIMUM_HEALTHY_PERCENTAGE: number = 60;
  static readonly CONSECUTIVE_ABSENCE_LIMIT: number = 3;

  static hasLowPercentage(student: JournalStudentResponse): boolean {
    const summary = student.summary;
    return summary !== null && summary.total_lessons > 0 && summary.percentage < JournalAtRiskRules.MINIMUM_HEALTHY_PERCENTAGE;
  }

  static hasConsecutiveAbsences(student: JournalStudentResponse, lessonDates: readonly string[], today: string): boolean {
    const entriesByDate: Map<string, boolean> = new Map(student.entries.map((entry) => [entry.lesson_date, entry.attendance]));
    const heldDates: string[] = [...lessonDates].filter((date) => date <= today).sort();
    let streak: number = 0;
    for (const date of heldDates) {
      const attended: boolean | undefined = entriesByDate.get(date);
      streak = attended === false ? streak + 1 : 0;
      if (streak >= JournalAtRiskRules.CONSECUTIVE_ABSENCE_LIMIT) return true;
    }
    return false;
  }

  static isAtRisk(student: JournalStudentResponse, lessonDates: readonly string[], today: string): boolean {
    return JournalAtRiskRules.hasLowPercentage(student) || JournalAtRiskRules.hasConsecutiveAbsences(student, lessonDates, today);
  }
}
