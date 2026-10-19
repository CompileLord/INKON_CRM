import type { JournalEntryCommand } from "./journalCommands";
import type { JournalStudentResponse } from "./types";

export type JournalBulkFillKind = "markPresent" | "fillHomework";

export interface JournalBulkFillTarget {
  studentId: number;
  command: JournalEntryCommand;
}

export class JournalBulkFill {
  static readonly HOMEWORK_FILL_SCORE: number = 5;

  static targetsFor(
    kind: JournalBulkFillKind,
    students: readonly JournalStudentResponse[],
    lessonDate: string,
  ): JournalBulkFillTarget[] {
    const targets: JournalBulkFillTarget[] = [];
    for (const student of students) {
      const entry = student.entries.find((candidate) => candidate.lesson_date === lessonDate);
      const attended: boolean = entry?.attendance ?? false;
      const score: number = entry?.score ?? 0;
      if (kind === "markPresent" && !attended) {
        targets.push({ studentId: student.student_id, command: { kind: "attendance", attended: true } });
      }
      if (kind === "fillHomework" && attended && score === 0) {
        targets.push({ studentId: student.student_id, command: { kind: "score", score: JournalBulkFill.HOMEWORK_FILL_SCORE } });
      }
    }
    return targets;
  }
}
