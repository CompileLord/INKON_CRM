import type { QueryClient } from "@tanstack/react-query";
import type { JournalEntryValue, JournalSummaryValue } from "./journalCommands";
import type {
  JournalDetailResponse,
  JournalEmbeddedSummary,
  JournalEntryResponse,
  JournalStudentResponse,
  JournalStudentSummaryResponse,
} from "./types";

export class JournalDetailCache {
  private readonly queryClient: QueryClient;
  private readonly queryKey: readonly ["journals", "detail", number];

  constructor(queryClient: QueryClient, journalId: number) {
    this.queryClient = queryClient;
    this.queryKey = ["journals", "detail", journalId];
  }

  matches(queryKey: readonly unknown[]): boolean {
    return queryKey[0] === this.queryKey[0] && queryKey[1] === this.queryKey[1] && queryKey[2] === this.queryKey[2];
  }

  read(): JournalDetailResponse | undefined {
    return this.queryClient.getQueryData<JournalDetailResponse>(this.queryKey);
  }

  readEntry(studentId: number, lessonDate: string): JournalEntryResponse | undefined {
    return this.readStudent(studentId)?.entries.find((entry) => entry.lesson_date === lessonDate);
  }

  readSummary(studentId: number): JournalEmbeddedSummary | null | undefined {
    const student: JournalStudentResponse | undefined = this.readStudent(studentId);
    return student ? student.summary : undefined;
  }

  replace(detail: JournalDetailResponse): void {
    this.queryClient.setQueryData<JournalDetailResponse>(this.queryKey, detail);
  }

  writeEntry(studentId: number, lessonDate: string, value: JournalEntryValue, version: number): void {
    this.updateStudent(studentId, (student) => {
      const hasEntry: boolean = student.entries.some((entry) => entry.lesson_date === lessonDate);
      if (!hasEntry) return student;
      return {
        ...student,
        entries: student.entries.map((entry) =>
          entry.lesson_date === lessonDate
            ? {
                ...entry,
                attendance: value.attendance,
                score: value.score,
                comment: value.comment,
                has_comment: value.comment !== null && value.comment.trim().length > 0,
                version,
              }
            : entry,
        ),
      };
    });
  }

  removeEntry(studentId: number, lessonDate: string): void {
    this.updateStudent(studentId, (student) => ({
      ...student,
      entries: student.entries.filter((entry) => entry.lesson_date !== lessonDate),
    }));
  }

  writeSummaryDraft(studentId: number, value: JournalSummaryValue, version: number): void {
    this.updateStudent(studentId, (student) => ({
      ...student,
      summary: student.summary
        ? { ...student.summary, bonus_score: value.bonus_score, exam_score: value.exam_score, version }
        : null,
    }));
  }

  writeServerSummary(
    serverSummary: JournalStudentSummaryResponse,
    retainedDraft: JournalSummaryValue | null,
    retainedVersion: number,
  ): void {
    this.updateStudent(serverSummary.student_id, (student) => ({
      ...student,
      summary: {
        ...student.summary,
        ...serverSummary,
        ...(retainedDraft
          ? { bonus_score: retainedDraft.bonus_score, exam_score: retainedDraft.exam_score, version: retainedVersion }
          : {}),
      },
    }));
  }

  writeSummaryAbsent(studentId: number): void {
    this.updateStudent(studentId, (student) => ({ ...student, summary: null }));
  }

  private readStudent(studentId: number): JournalStudentResponse | undefined {
    return this.read()?.students.find((student) => student.student_id === studentId);
  }

  private updateStudent(
    studentId: number,
    transform: (student: JournalStudentResponse) => JournalStudentResponse,
  ): void {
    this.queryClient.setQueryData<JournalDetailResponse>(this.queryKey, (previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        students: previous.students.map((student) => (student.student_id === studentId ? transform(student) : student)),
      };
    });
  }
}
