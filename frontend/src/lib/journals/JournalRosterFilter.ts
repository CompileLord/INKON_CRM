import type { JournalStudentResponse } from "./types";

export class JournalRosterFilter {
  static normalize(query: string): string {
    return query.trim().toLocaleLowerCase();
  }

  static isActive(query: string): boolean {
    return JournalRosterFilter.normalize(query) !== "";
  }

  static matches(student: JournalStudentResponse, query: string): boolean {
    const normalized: string = JournalRosterFilter.normalize(query);
    if (normalized === "") return true;
    const haystacks: string[] = [
      `${student.first_name} ${student.last_name}`,
      `${student.last_name} ${student.first_name}`,
      student.first_name,
      student.last_name,
    ].map((value) => value.toLocaleLowerCase());
    return haystacks.some((value) => value.includes(normalized));
  }

  static visibleIds(students: readonly JournalStudentResponse[], query: string): Set<number> | null {
    if (!JournalRosterFilter.isActive(query)) return null;
    return new Set(
      students.filter((student) => JournalRosterFilter.matches(student, query)).map((student) => student.student_id),
    );
  }
}
