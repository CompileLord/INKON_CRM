import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { batchUpdateJournalEntries, getJournal, getMentorGradingQueue, updateJournalExamMaxScore, updateJournalStudentSummary } from "./endpoints";
import type { JournalEntryUpdate, JournalExamMaxScoreUpdate, JournalStudentSummaryUpdate } from "./types";

export function useJournal(journalId: number | undefined) {
  return useQuery({
    queryKey: ["journals", "detail", journalId],
    queryFn: () => getJournal(journalId!),
    enabled: journalId !== undefined,
    staleTime: 30_000,
  });
}

export function useMentorGradingQueue(enabled = true) {
  return useQuery({
    queryKey: ["mentors", "me", "grading-queue"],
    queryFn: () => getMentorGradingQueue(),
    enabled,
  });
}

export function useBatchUpdateJournalEntries(journalId: number | undefined, courseId?: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: JournalEntryUpdate[]) => batchUpdateJournalEntries(journalId!, payload),
    onSuccess: () => {
      if (courseId !== undefined) {
        queryClient.invalidateQueries({ queryKey: ["courses", "progress-chart", courseId] });
      }
    },
  });
}

export function useUpdateJournalStudentSummary(journalId: number | undefined, courseId?: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ studentId, payload }: { studentId: number; payload: JournalStudentSummaryUpdate }) =>
      updateJournalStudentSummary(journalId!, studentId, payload),
    onSuccess: () => {
      if (courseId !== undefined) {
        queryClient.invalidateQueries({ queryKey: ["courses", "progress-chart", courseId] });
      }
    },
  });
}

export function useUpdateJournalExamMaxScore(journalId: number | undefined, courseId?: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: JournalExamMaxScoreUpdate) =>
      updateJournalExamMaxScore(journalId!, payload),
    onSuccess: (data) => {
      if (journalId) {
        queryClient.setQueryData<any>(["journals", "detail", journalId], (old: any) => {
          if (!old) return old;
          return {
            ...old,
            exam_max_score: data.journal.exam_max_score,
            students: old.students.map((student: any) => {
              const summaryMatch = data.summaries.find((s: any) => s.student_id === student.student_id);
              return summaryMatch ? { ...student, summary: { ...student.summary, ...summaryMatch } } : student;
            }),
          };
        });
      }
      if (courseId !== undefined) {
        queryClient.invalidateQueries({ queryKey: ["courses", "progress-chart", courseId] });
      }
    },
  });
}

