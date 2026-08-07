import { httpClient } from "../auth/httpClient";
import type {
  GradingQueueItemResponse,
  JournalBatchUpdateResponse,
  JournalDetailResponse,
  JournalEntryUpdate,
  JournalExamMaxScoreUpdate,
  JournalExamMaxScoreUpdateResponse,
  JournalStudentSummaryResponse,
  JournalStudentSummaryUpdate,
} from "./types";

export function getJournal(id: number): Promise<JournalDetailResponse> {
  return httpClient.get<JournalDetailResponse>(`/journals/${id}`).then((res) => res.data);
}

export function getMentorGradingQueue(): Promise<GradingQueueItemResponse[]> {
  return httpClient.get<GradingQueueItemResponse[]>("/mentors/me/grading-queue").then((res) => res.data);
}

export function batchUpdateJournalEntries(
  id: number,
  payload: JournalEntryUpdate[],
): Promise<JournalBatchUpdateResponse> {
  return httpClient
    .put<JournalBatchUpdateResponse>(`/journals/${id}/entries`, payload)
    .then((res) => res.data);
}

export function updateJournalStudentSummary(
  journalId: number,
  studentId: number,
  payload: JournalStudentSummaryUpdate,
): Promise<JournalStudentSummaryResponse> {
  return httpClient
    .patch<JournalStudentSummaryResponse>(`/journals/${journalId}/students/${studentId}/summary`, payload)
    .then((res) => res.data);
}

export function updateJournalExamMaxScore(
  id: number,
  payload: JournalExamMaxScoreUpdate,
): Promise<JournalExamMaxScoreUpdateResponse> {
  return httpClient
    .patch<JournalExamMaxScoreUpdateResponse>(`/journals/${id}/exam-max-score`, payload)
    .then((res) => res.data);
}

