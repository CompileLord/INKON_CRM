import { useState } from "react";
import type { JournalStudentResponse } from "./types";

interface RememberedOrder {
  journalId: number;
  studentIds: number[];
}

export class JournalStudentOrdering {
  static pinFirst(students: readonly JournalStudentResponse[], pinnedStudentId: number | null): JournalStudentResponse[] {
    if (pinnedStudentId === null) return [...students];
    const pinned: JournalStudentResponse[] = students.filter((student) => student.student_id === pinnedStudentId);
    return [...pinned, ...students.filter((student) => student.student_id !== pinnedStudentId)];
  }

  static stabilize(
    rememberedIds: readonly number[],
    students: readonly JournalStudentResponse[],
  ): JournalStudentResponse[] {
    const byId: Map<number, JournalStudentResponse> = new Map(students.map((student) => [student.student_id, student]));
    const remembered: JournalStudentResponse[] = rememberedIds.flatMap((id) => {
      const student: JournalStudentResponse | undefined = byId.get(id);
      return student ? [student] : [];
    });
    const rememberedSet: Set<number> = new Set(rememberedIds);
    const arrivals: JournalStudentResponse[] = students.filter((student) => !rememberedSet.has(student.student_id));
    return [...remembered, ...arrivals];
  }
}

export function useStableStudentOrder(
  journalId: number,
  students: readonly JournalStudentResponse[],
): JournalStudentResponse[] {
  const [remembered, setRemembered] = useState<RememberedOrder>({
    journalId,
    studentIds: students.map((student) => student.student_id),
  });
  const knownIds: readonly number[] = remembered.journalId === journalId ? remembered.studentIds : [];
  const ordered: JournalStudentResponse[] = JournalStudentOrdering.stabilize(knownIds, students);
  const orderedIds: number[] = ordered.map((student) => student.student_id);
  const changed: boolean =
    remembered.journalId !== journalId ||
    orderedIds.length !== remembered.studentIds.length ||
    orderedIds.some((id, index) => id !== remembered.studentIds[index]);
  if (changed) setRemembered({ journalId, studentIds: orderedIds });
  return ordered;
}
