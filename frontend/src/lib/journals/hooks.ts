import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClassJournal, getJournal, getMentorGradingQueue, updateJournalExamMaxScore } from "./endpoints";
import type {
  JournalDetailResponse,
  JournalExamMaxScoreUpdate,
  JournalStudentSummaryResponse,
} from "./types";

export function useJournal(journalId: number | undefined) {
  return useQuery({
    queryKey: ["journals", "detail", journalId],
    queryFn: () => getJournal(journalId!),
    enabled: journalId !== undefined,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export type JournalReaderScope = "staff" | "student";

export function useScopedJournal(journalId: number | undefined, scope: JournalReaderScope) {
  return useQuery({
    queryKey: scope === "student" ? ["journals", "class", journalId] : ["journals", "detail", journalId],
    queryFn: () => (scope === "student" ? getClassJournal(journalId!) : getJournal(journalId!)),
    enabled: journalId !== undefined,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useMentorGradingQueue(enabled = true) {
  return useQuery({
    queryKey: ["mentors", "me", "grading-queue"],
    queryFn: () => getMentorGradingQueue(),
    enabled,
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
        queryClient.invalidateQueries({ queryKey: ["courses", "journal-metrics", courseId] });
        queryClient.invalidateQueries({ queryKey: ["courses", "staff-progress", courseId] });
      }
    },
  });
}

