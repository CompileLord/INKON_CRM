import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { batchUpdateJournalEntries, getJournal, getMentorGradingQueue, updateJournalExamMaxScore, updateJournalStudentSummary } from "./endpoints";
import type {
  JournalDetailResponse,
  JournalEntryUpdate,
  JournalExamMaxScoreUpdate,
  JournalStudentSummaryResponse,
  JournalStudentSummaryUpdate,
} from "./types";

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
        queryClient.setQueryData<JournalDetailResponse>(["journals", "detail", journalId], (old) => {
          if (!old) return old;
          return {
            ...old,
            exam_max_score: data.journal.exam_max_score,
            students: old.students.map((student) => {
              const summaryMatch: JournalStudentSummaryResponse | undefined = data.summaries.find(
                (summary) => summary.student_id === student.student_id,
              );
              if (!summaryMatch) return student;
              return { ...student, summary: { ...student.summary, ...summaryMatch } };
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

