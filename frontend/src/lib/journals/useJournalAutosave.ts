import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { batchUpdateJournalEntries, updateJournalStudentSummary } from "./endpoints";
import type {
  JournalBatchUpdateResponse,
  JournalDetailResponse,
  JournalEntryConflictResponse,
  JournalEntryUpdate,
  JournalStudentSummaryResponse,
} from "./types";

export type CellSaveStatus = "dirty" | "saving" | "saved" | "error" | "conflict";
export type AggregateSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

interface SummaryDraft {
  studentId: number;
  bonus_score: number;
  exam_score: number;
  version: number;
}

const DEBOUNCE_MS = 700;
const MAX_LATENCY_MS = 3000;
const BACKOFF_DELAYS = [1000, 3000, 8000];

export function useJournalAutosave(journalId: number | undefined, courseId?: number) {
  const queryClient = useQueryClient();

  const dirtyRef = useRef<Map<string, JournalEntryUpdate>>(new Map());
  const inFlightRef = useRef<Map<string, JournalEntryUpdate>>(new Map());
  const summaryDirtyRef = useRef<Map<number, SummaryDraft>>(new Map());
  const summaryInFlightRef = useRef<Map<number, SummaryDraft>>(new Map());

  const [cellStatus, setCellStatus] = useState<Map<string, CellSaveStatus>>(new Map());
  const [aggregateStatus, setAggregateStatus] = useState<AggregateSaveStatus>("idle");
  const [conflicts, setConflicts] = useState<JournalEntryConflictResponse[]>([]);

  const isInFlightRef = useRef<boolean>(false);
  const needsReflushRef = useRef<boolean>(false);
  const retryCountRef = useRef<number>(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxLatencyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chartDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const invalidateChartDebounced = useCallback(() => {
    if (courseId === undefined) return;
    if (chartDebounceTimerRef.current) clearTimeout(chartDebounceTimerRef.current);
    chartDebounceTimerRef.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["courses", "progress-chart", courseId] });
    }, 5000);
  }, [courseId, queryClient]);

  const updateCacheWithApplied = useCallback(
    (applied: JournalBatchUpdateResponse["applied"], summaries: JournalStudentSummaryResponse[]) => {
      if (!journalId) return;

      queryClient.setQueryData<JournalDetailResponse>(["journals", "detail", journalId], (old) => {
        if (!old) return old;
        const updatedStudents = old.students.map((student) => {
          let studentModified = false;
          let newEntries = student.entries;

          applied.forEach((item) => {
            if (item.student_id === student.student_id) {
              studentModified = true;
              newEntries = newEntries.map((e) => {
                if (e.lesson_date === item.lesson_date) {
                  return {
                    ...e,
                    attendance: item.attendance,
                    score: item.score,
                    comment: item.comment ?? null,
                    has_comment: Boolean(item.comment && item.comment.trim().length > 0),
                    version: item.version,
                  };
                }
                return e;
              });
            }
          });

          const matchingSummary = summaries.find((s) => s.student_id === student.student_id);
          const newSummary = matchingSummary
            ? {
                ...student.summary,
                ...matchingSummary,
              }
            : student.summary;

          if (studentModified || matchingSummary) {
            return {
              ...student,
              entries: newEntries,
              summary: newSummary,
            };
          }
          return student;
        });

        return {
          ...old,
          students: updatedStudents,
        };
      });
    },
    [journalId, queryClient]
  );

  const updateCacheWithConflict = useCallback(
    (conflict: JournalEntryConflictResponse) => {
      if (!journalId || !conflict.current) return;
      const current = conflict.current;

      queryClient.setQueryData<JournalDetailResponse>(["journals", "detail", journalId], (old) => {
        if (!old) return old;
        return {
          ...old,
          students: old.students.map((student) => {
            if (student.student_id === conflict.student_id) {
              return {
                ...student,
                entries: student.entries.map((e) => {
                  if (e.lesson_date === conflict.lesson_date) {
                    return {
                      ...e,
                      attendance: current.attendance,
                      score: current.score,
                      comment: current.comment ?? null,
                      has_comment: Boolean(current.comment && current.comment.trim().length > 0),
                      version: current.version,
                    };
                  }
                  return e;
                }),
              };
            }
            return student;
          }),
        };
      });
    },
    [journalId, queryClient]
  );

  const flush = useCallback(
    async (_reason = "debounce") => {
      if (!journalId) return;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (maxLatencyTimerRef.current) {
        clearTimeout(maxLatencyTimerRef.current);
        maxLatencyTimerRef.current = null;
      }

      if (isInFlightRef.current) {
        needsReflushRef.current = true;
        return;
      }

      if (dirtyRef.current.size === 0 && summaryDirtyRef.current.size === 0) {
        return;
      }

      isInFlightRef.current = true;

      dirtyRef.current.forEach((val, key) => {
        inFlightRef.current.set(key, val);
      });
      dirtyRef.current.clear();

      summaryDirtyRef.current.forEach((val, key) => {
        summaryInFlightRef.current.set(key, val);
      });
      summaryDirtyRef.current.clear();

      setCellStatus((prev) => {
        const next = new Map(prev);
        inFlightRef.current.forEach((_, key) => {
          next.set(key, "saving");
        });
        return next;
      });
      setAggregateStatus("saving");

      try {
        const entriesPayload = Array.from(inFlightRef.current.values());
        let res: JournalBatchUpdateResponse = { applied: [], conflicts: [], summaries: [] };

        if (entriesPayload.length > 0) {
          res = await batchUpdateJournalEntries(journalId, entriesPayload);
        }

        const summaryPromises = Array.from(summaryInFlightRef.current.values()).map((s) =>
          updateJournalStudentSummary(journalId, s.studentId, {
            bonus_score: s.bonus_score,
            exam_score: s.exam_score,
            version: s.version,
          })
        );
        const summaryResults = await Promise.all(summaryPromises);

        updateCacheWithApplied(res.applied, [...res.summaries, ...summaryResults]);

        setCellStatus((prev) => {
          const next = new Map(prev);
          res.applied.forEach((item) => {
            const key = `${item.student_id}:${item.lesson_date}`;
            if (!dirtyRef.current.has(key)) {
              next.set(key, "saved");
              setTimeout(() => {
                setCellStatus((cur) => {
                  if (cur.get(key) === "saved") {
                    const copy = new Map(cur);
                    copy.delete(key);
                    return copy;
                  }
                  return cur;
                });
              }, 1500);
            }
          });
          res.conflicts.forEach((conflict) => {
            const key = `${conflict.student_id}:${conflict.lesson_date}`;
            next.set(key, "conflict");
            updateCacheWithConflict(conflict);
          });
          return next;
        });

        if (res.conflicts.length > 0) {
          setConflicts((prev) => [...prev, ...res.conflicts]);
        }

        inFlightRef.current.clear();
        summaryInFlightRef.current.clear();
        retryCountRef.current = 0;
        isInFlightRef.current = false;

        invalidateChartDebounced();

        if (dirtyRef.current.size > 0 || summaryDirtyRef.current.size > 0 || needsReflushRef.current) {
          needsReflushRef.current = false;
          flush("chained");
        } else {
          setAggregateStatus("saved");
          setTimeout(() => {
            setAggregateStatus((cur) => (cur === "saved" ? "idle" : cur));
          }, 2000);
        }
      } catch (err: any) {
        inFlightRef.current.forEach((val, key) => {
          dirtyRef.current.set(key, val);
        });
        inFlightRef.current.clear();

        summaryInFlightRef.current.forEach((val, key) => {
          summaryDirtyRef.current.set(key, val);
        });
        summaryInFlightRef.current.clear();

        isInFlightRef.current = false;

        if (err?.response?.status === 409 && err?.response?.data?.conflicts) {
          setAggregateStatus("error");
          return;
        }

        if (retryCountRef.current < BACKOFF_DELAYS.length) {
          const delay = BACKOFF_DELAYS[retryCountRef.current];
          retryCountRef.current += 1;
          setAggregateStatus("pending");
          debounceTimerRef.current = setTimeout(() => {
            flush("retry");
          }, delay);
        } else {
          setAggregateStatus("error");
          setCellStatus((prev) => {
            const next = new Map(prev);
            dirtyRef.current.forEach((_, key) => {
              next.set(key, "error");
            });
            return next;
          });
        }
      }
    },
    [journalId, updateCacheWithApplied, updateCacheWithConflict, invalidateChartDebounced]
  );

  const schedule = useCallback(() => {
    setAggregateStatus("pending");
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      flush("debounce");
    }, DEBOUNCE_MS);

    if (!maxLatencyTimerRef.current) {
      maxLatencyTimerRef.current = setTimeout(() => {
        flush("maxLatency");
      }, MAX_LATENCY_MS);
    }
  }, [flush]);

  const editEntry = useCallback(
    (key: string, patch: JournalEntryUpdate) => {
      const targetAttendance = patch.score > 0 ? true : patch.attendance;
      dirtyRef.current.set(key, { ...patch, attendance: targetAttendance });

      setCellStatus((prev) => {
        const next = new Map(prev);
        next.set(key, "dirty");
        return next;
      });

      if (journalId) {
        queryClient.setQueryData<JournalDetailResponse>(["journals", "detail", journalId], (old) => {
          if (!old) return old;
          return {
            ...old,
            students: old.students.map((student) => {
              if (student.student_id === patch.student_id) {
                return {
                  ...student,
                  entries: student.entries.map((e) => {
                    if (e.lesson_date === patch.lesson_date) {
                      return {
                        ...e,
                        score: patch.score,
                        attendance: targetAttendance,
                        comment: patch.comment ?? null,
                        has_comment: Boolean(patch.comment && patch.comment.trim().length > 0),
                      };
                    }
                    return e;
                  }),
                };
              }
              return student;
            }),
          };
        });
      }

      schedule();
    },
    [journalId, queryClient, schedule]
  );

  const editSummary = useCallback(
    (studentId: number, patch: { bonus_score: number; exam_score: number; version: number }) => {
      summaryDirtyRef.current.set(studentId, { studentId, ...patch });
      schedule();
    },
    [schedule]
  );

  const resolveConflict = useCallback(
    (conflict: JournalEntryConflictResponse, choice: "keepMine" | "keepTheirs") => {
      const key = `${conflict.student_id}:${conflict.lesson_date}`;
      setConflicts((prev) => prev.filter((c) => `${c.student_id}:${c.lesson_date}` !== key));

      if (choice === "keepMine" && conflict.current) {
        editEntry(key, {
          student_id: conflict.student_id,
          lesson_date: conflict.lesson_date,
          attendance: conflict.current.attendance,
          score: conflict.current.score,
          comment: conflict.current.comment,
          version: conflict.current.version,
        });
      } else {
        setCellStatus((prev) => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [editEntry]
  );

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current.size > 0 || inFlightRef.current.size > 0 || summaryDirtyRef.current.size > 0) {
        e.preventDefault();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flush("hidden");
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flush("unmount");
    };
  }, [flush]);

  return {
    cellStatus,
    aggregateStatus,
    conflicts,
    editEntry,
    editSummary,
    resolveConflict,
    flush: () => flush("manual"),
    retryManual: () => {
      retryCountRef.current = 0;
      flush("manual");
    },
    hasPendingEdits: dirtyRef.current.size > 0 || summaryDirtyRef.current.size > 0 || inFlightRef.current.size > 0,
  };
}
