import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { batchUpdateJournalEntries, getJournal, updateJournalStudentSummary } from "./endpoints";
import { AuthApiError, NetworkError } from "../auth/errors";
import type {
  JournalBatchUpdateResponse,
  JournalDetailResponse,
  JournalEntryConflictResponse,
  JournalEntryUpdate,
  JournalStudentSummaryResponse,
} from "./types";

export type CellSaveStatus = "dirty" | "saving" | "saved" | "error" | "conflict";
export type AggregateSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export interface JournalAutosaveEntryConflict {
  type: "entry";
  student_id: number;
  lesson_date: string;
  submitted_version: number;
  current?: {
    student_id: number;
    lesson_date: string;
    attendance: boolean;
    score: number;
    comment?: string | null;
    version: number;
  } | null;
}

export interface JournalAutosaveSummaryConflict {
  type: "summary";
  student_id: number;
  submitted_version: number;
  current?: JournalStudentSummaryResponse | null;
}

export type JournalAutosaveConflict = JournalAutosaveEntryConflict | JournalAutosaveSummaryConflict;

interface SummaryDraft {
  studentId: number;
  bonus_score: number;
  exam_score: number;
  version: number;
}

interface StatusHolder {
  status: unknown;
}

function hasStatus(error: unknown): error is StatusHolder {
  return typeof error === "object" && error !== null && "status" in error;
}

function isConflictError(error: unknown): boolean {
  if (error instanceof AuthApiError) {
    return error.status === 409;
  }
  if (hasStatus(error)) {
    return error.status === 409;
  }
  return false;
}

function isTransientError(error: unknown): boolean {
  if (error instanceof NetworkError) {
    return true;
  }
  if (error instanceof AuthApiError) {
    return error.status >= 500;
  }
  if (hasStatus(error)) {
    const status = error.status;
    return typeof status === "number" && (status >= 500 || status === 0);
  }
  return false;
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
  const [conflicts, setConflicts] = useState<JournalAutosaveConflict[]>([]);
  const conflictsRef = useRef<Map<string, JournalAutosaveConflict>>(new Map());

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
              const key = `${item.student_id}:${item.lesson_date}`;
              const newerDraft = dirtyRef.current.get(key);
              newEntries = newEntries.map((e) => {
                if (e.lesson_date === item.lesson_date) {
                  if (newerDraft) {
                    return {
                      ...e,
                      attendance: newerDraft.attendance,
                      score: newerDraft.score,
                      comment: newerDraft.comment ?? null,
                      has_comment: Boolean(newerDraft.comment && newerDraft.comment.trim().length > 0),
                      version: item.version,
                    };
                  }
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
          const newerSummaryDraft = summaryDirtyRef.current.get(student.student_id);
          const newSummary = matchingSummary
            ? {
                ...student.summary,
                ...matchingSummary,
                ...(newerSummaryDraft
                  ? {
                      bonus_score: newerSummaryDraft.bonus_score,
                      exam_score: newerSummaryDraft.exam_score,
                      version: matchingSummary.version,
                    }
                  : {}),
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

      const unresolvedConflictKeys = new Set(conflictsRef.current.keys());

      dirtyRef.current.forEach((val, key) => {
        if (!unresolvedConflictKeys.has(key)) {
          inFlightRef.current.set(key, val);
          dirtyRef.current.delete(key);
        }
      });

      summaryDirtyRef.current.forEach((val, studentId) => {
        const summaryKey = `${studentId}:summary`;
        if (!unresolvedConflictKeys.has(summaryKey)) {
          summaryInFlightRef.current.set(studentId, val);
          summaryDirtyRef.current.delete(studentId);
        }
      });

      if (inFlightRef.current.size === 0 && summaryInFlightRef.current.size === 0) {
        if (conflictsRef.current.size > 0) {
          setAggregateStatus("error");
        }
        return;
      }

      isInFlightRef.current = true;

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

        const genuineConflicts: JournalAutosaveConflict[] = [];

        res.applied.forEach((item) => {
          const key = `${item.student_id}:${item.lesson_date}`;
          inFlightRef.current.delete(key);
          const dirty = dirtyRef.current.get(key);
          if (dirty) {
            dirty.version = item.version;
          }
        });

        res.conflicts.forEach((conflict) => {
          const key = `${conflict.student_id}:${conflict.lesson_date}`;
          const inFlightItem = inFlightRef.current.get(key);
          inFlightRef.current.delete(key);

          const hasNewerDirty = dirtyRef.current.has(key);
          if (inFlightItem && !hasNewerDirty) {
            dirtyRef.current.set(key, inFlightItem);
          }

          const isIdentical =
            Boolean(
              conflict.current &&
                inFlightItem &&
                conflict.current.attendance === inFlightItem.attendance &&
                conflict.current.score === inFlightItem.score &&
                (conflict.current.comment ?? null) === (inFlightItem.comment ?? null)
            );

          if (isIdentical && conflict.current) {
            if (hasNewerDirty) {
              const newer = dirtyRef.current.get(key);
              if (newer) {
                newer.version = conflict.current.version;
              }
            } else {
              dirtyRef.current.delete(key);
              updateCacheWithConflict(conflict);
            }
            return;
          }

          genuineConflicts.push({
            type: "entry",
            student_id: conflict.student_id,
            lesson_date: conflict.lesson_date,
            submitted_version: conflict.submitted_version,
            current: conflict.current,
          });
        });

        updateCacheWithApplied(res.applied, res.summaries);

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
          genuineConflicts.forEach((conflict) => {
            if (conflict.type === "entry") {
              const key = `${conflict.student_id}:${conflict.lesson_date}`;
              next.set(key, "conflict");
            }
          });
          return next;
        });

        if (genuineConflicts.length > 0) {
          setConflicts((prev) => {
            const existing = new Set(
              prev.map((c) => (c.type === "summary" ? `${c.student_id}:summary` : `${c.student_id}:${c.lesson_date}`))
            );
            const addition = genuineConflicts.filter(
              (c) => !existing.has(c.type === "summary" ? `${c.student_id}:summary` : `${c.student_id}:${c.lesson_date}`)
            );
            const next = [...prev, ...addition];
            conflictsRef.current = new Map(
              next.map((c) => [c.type === "summary" ? `${c.student_id}:summary` : `${c.student_id}:${c.lesson_date}`, c])
            );
            return next;
          });
        }

        if (inFlightRef.current.size > 0) {
          throw new Error("Incomplete journal acknowledgement");
        }

        let summaryConflictEncountered = false;
        let summaryTransientEncountered = false;
        let summaryNonTransientErrorEncountered = false;

        if (summaryInFlightRef.current.size > 0) {
          const summarySnapshots = Array.from(summaryInFlightRef.current.values());
          for (const s of summarySnapshots) {
            try {
              const summaryResult = await updateJournalStudentSummary(journalId, s.studentId, {
                bonus_score: s.bonus_score,
                exam_score: s.exam_score,
                version: s.version,
              });
              summaryInFlightRef.current.delete(s.studentId);
              const dirty = summaryDirtyRef.current.get(s.studentId);
              if (dirty) {
                dirty.version = summaryResult.version;
              }
              updateCacheWithApplied([], [summaryResult]);
            } catch (summaryErr: unknown) {
              summaryInFlightRef.current.delete(s.studentId);
              if (!summaryDirtyRef.current.has(s.studentId)) {
                summaryDirtyRef.current.set(s.studentId, s);
              }
              if (isConflictError(summaryErr)) {
                summaryConflictEncountered = true;
                const summaryConflict: JournalAutosaveConflict = {
                  type: "summary",
                  student_id: s.studentId,
                  submitted_version: s.version,
                  current: undefined,
                };
                setConflicts((prev) => {
                  const filtered = prev.filter((c) => !(c.type === "summary" && c.student_id === s.studentId));
                  const next = [...filtered, summaryConflict];
                  conflictsRef.current = new Map(
                    next.map((c) => [c.type === "summary" ? `${c.student_id}:summary` : `${c.student_id}:${c.lesson_date}`, c])
                  );
                  return next;
                });
                conflictsRef.current.set(`${s.studentId}:summary`, summaryConflict);
              } else if (isTransientError(summaryErr)) {
                summaryTransientEncountered = true;
              } else {
                summaryNonTransientErrorEncountered = true;
              }
            }
          }
        }

        isInFlightRef.current = false;
        invalidateChartDebounced();

        if (genuineConflicts.length > 0 || summaryConflictEncountered || summaryNonTransientErrorEncountered) {
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
          }
          if (maxLatencyTimerRef.current) {
            clearTimeout(maxLatencyTimerRef.current);
            maxLatencyTimerRef.current = null;
          }
          retryCountRef.current = 0;
          setAggregateStatus("error");
          return;
        }

        if (summaryTransientEncountered) {
          if (retryCountRef.current < BACKOFF_DELAYS.length) {
            const delay = BACKOFF_DELAYS[retryCountRef.current];
            retryCountRef.current += 1;
            setAggregateStatus("pending");
            debounceTimerRef.current = setTimeout(() => {
              flush("retry");
            }, delay);
          } else {
            setAggregateStatus("error");
          }
          return;
        }

        retryCountRef.current = 0;

        const remainingDirtyEntries = Array.from(dirtyRef.current.keys()).filter((k) => !conflictsRef.current.has(k));
        const remainingDirtySummaries = Array.from(summaryDirtyRef.current.keys()).filter((sid) => !conflictsRef.current.has(`${sid}:summary`));

        if (remainingDirtyEntries.length > 0 || remainingDirtySummaries.length > 0 || needsReflushRef.current) {
          needsReflushRef.current = false;
          flush("chained");
        } else {
          setAggregateStatus(conflictsRef.current.size > 0 ? "error" : "saved");
          setTimeout(() => {
            setAggregateStatus((cur) => {
              if (cur === "saved") {
                return conflictsRef.current.size > 0 ? "error" : "idle";
              }
              return cur;
            });
          }, 2000);
        }
      } catch (err: unknown) {
        isInFlightRef.current = false;

        const isConflict = isConflictError(err);
        const isTransient = isTransientError(err);

        const failedInFlightEntries = Array.from(inFlightRef.current.values());
        const keysAlreadyDirty = new Set(dirtyRef.current.keys());

        inFlightRef.current.forEach((val, key) => {
          if (!dirtyRef.current.has(key)) {
            dirtyRef.current.set(key, val);
          }
        });
        inFlightRef.current.clear();

        summaryInFlightRef.current.forEach((val, key) => {
          if (!summaryDirtyRef.current.has(key)) {
            summaryDirtyRef.current.set(key, val);
          }
        });
        summaryInFlightRef.current.clear();

        if (isConflict) {
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
          }
          if (maxLatencyTimerRef.current) {
            clearTimeout(maxLatencyTimerRef.current);
            maxLatencyTimerRef.current = null;
          }
          retryCountRef.current = 0;

          const newConflicts: JournalAutosaveConflict[] = failedInFlightEntries
            .filter((item) => !keysAlreadyDirty.has(`${item.student_id}:${item.lesson_date}`))
            .map((item) => ({
              type: "entry",
              student_id: item.student_id,
              lesson_date: item.lesson_date,
              submitted_version: item.version,
              current: undefined,
            }));

          if (newConflicts.length > 0) {
            setConflicts((prev) => {
              const updatedKeys = new Set(
                newConflicts.map((c) => (c.type === "summary" ? `${c.student_id}:summary` : `${c.student_id}:${c.lesson_date}`))
              );
              const remaining = prev.filter((c) => {
                const k = c.type === "summary" ? `${c.student_id}:summary` : `${c.student_id}:${c.lesson_date}`;
                return !updatedKeys.has(k);
              });
              const next = [...remaining, ...newConflicts];
              conflictsRef.current = new Map(
                next.map((c) => [c.type === "summary" ? `${c.student_id}:summary` : `${c.student_id}:${c.lesson_date}`, c])
              );
              return next;
            });
          }

          setCellStatus((prev) => {
            const next = new Map(prev);
            failedInFlightEntries.forEach((item) => {
              const key = `${item.student_id}:${item.lesson_date}`;
              if (!keysAlreadyDirty.has(key)) {
                next.set(key, "conflict");
              }
            });
            return next;
          });

          setAggregateStatus("error");
          return;
        }

        if (isTransient && retryCountRef.current < BACKOFF_DELAYS.length) {
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

      let latestVersion = patch.version;
      if (journalId) {
        const cached = queryClient.getQueryData<JournalDetailResponse>(["journals", "detail", journalId]);
        if (cached) {
          const cachedStudent = cached.students.find((s) => s.student_id === patch.student_id);
          const cachedEntry = cachedStudent?.entries.find((e) => e.lesson_date === patch.lesson_date);
          if (cachedEntry) {
            latestVersion = Math.max(patch.version, cachedEntry.version);
          }
        }
      }

      dirtyRef.current.set(key, { ...patch, attendance: targetAttendance, version: latestVersion });

      const hasConflict = conflictsRef.current.has(key);
      setCellStatus((prev) => {
        const next = new Map(prev);
        next.set(key, hasConflict ? "conflict" : "dirty");
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
                        version: latestVersion,
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

      if (!hasConflict) {
        schedule();
      }
    },
    [journalId, queryClient, schedule]
  );

  const editSummary = useCallback(
    (studentId: number, patch: { bonus_score: number; exam_score: number; version: number }) => {
      summaryDirtyRef.current.set(studentId, { studentId, ...patch });
      const summaryKey = `${studentId}:summary`;
      const hasConflict = conflictsRef.current.has(summaryKey);

      if (journalId) {
        queryClient.setQueryData<JournalDetailResponse>(["journals", "detail", journalId], (old) => {
          if (!old) return old;
          return {
            ...old,
            students: old.students.map((student) => {
              if (student.student_id === studentId) {
                return {
                  ...student,
                  summary: student.summary
                    ? {
                        ...student.summary,
                        bonus_score: patch.bonus_score,
                        exam_score: patch.exam_score,
                        version: patch.version,
                      }
                    : null,
                };
              }
              return student;
            }),
          };
        });
      }

      if (!hasConflict) {
        schedule();
      }
    },
    [journalId, queryClient, schedule]
  );

  const resolveConflict = useCallback(
    (conflict: JournalAutosaveConflict, choice: "keepMine" | "keepTheirs") => {
      if (conflict.current === undefined) {
        return;
      }

      if (choice === "keepMine" && !conflict.current) {
        return;
      }

      const key =
        conflict.type === "summary"
          ? `${conflict.student_id}:summary`
          : `${conflict.student_id}:${conflict.lesson_date}`;

      conflictsRef.current.delete(key);
      setConflicts((prev) =>
        prev.filter((c) => {
          const itemKey =
            c.type === "summary" ? `${c.student_id}:summary` : `${c.student_id}:${c.lesson_date}`;
          return itemKey !== key;
        })
      );

      if (conflict.type === "summary") {
        if (choice === "keepMine") {
          const draft = summaryDirtyRef.current.get(conflict.student_id);
          if (draft && conflict.current) {
            draft.version = conflict.current.version;
            editSummary(conflict.student_id, {
              bonus_score: draft.bonus_score,
              exam_score: draft.exam_score,
              version: conflict.current.version,
            });
          }
        } else if (choice === "keepTheirs") {
          summaryDirtyRef.current.delete(conflict.student_id);
          if (journalId) {
            queryClient.setQueryData<JournalDetailResponse>(["journals", "detail", journalId], (old) => {
              if (!old) return old;
              return {
                ...old,
                students: old.students.map((student) => {
                  if (student.student_id === conflict.student_id) {
                    return {
                      ...student,
                      summary: conflict.current
                        ? {
                            ...student.summary,
                            ...conflict.current,
                          }
                        : null,
                    };
                  }
                  return student;
                }),
              };
            });
          }
        }
      } else {
        if (choice === "keepMine") {
          let currentMineAttendance = conflict.current!.attendance;
          let currentMineScore = conflict.current!.score;
          let currentMineComment = conflict.current!.comment;

          const draft = dirtyRef.current.get(key);
          if (draft) {
            currentMineAttendance = draft.attendance;
            currentMineScore = draft.score;
            currentMineComment = draft.comment;
          }

          editEntry(key, {
            student_id: conflict.student_id,
            lesson_date: conflict.lesson_date,
            attendance: currentMineAttendance,
            score: currentMineScore,
            comment: currentMineComment,
            version: conflict.current!.version,
          });
        } else if (choice === "keepTheirs") {
          dirtyRef.current.delete(key);
          if (conflict.current) {
            updateCacheWithConflict({
              student_id: conflict.student_id,
              lesson_date: conflict.lesson_date,
              submitted_version: conflict.submitted_version,
              current: {
                student_id: conflict.current.student_id,
                lesson_date: conflict.current.lesson_date,
                attendance: conflict.current.attendance,
                score: conflict.current.score,
                comment: conflict.current.comment ?? null,
                version: conflict.current.version,
              },
            });
          } else if (journalId) {
            queryClient.setQueryData<JournalDetailResponse>(["journals", "detail", journalId], (old) => {
              if (!old) return old;
              return {
                ...old,
                students: old.students.map((student) => {
                  if (student.student_id === conflict.student_id) {
                    return {
                      ...student,
                      entries: student.entries.filter((e) => e.lesson_date !== conflict.lesson_date),
                    };
                  }
                  return student;
                }),
              };
            });
          }
          setCellStatus((prev) => {
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
        }
      }

      if (choice === "keepTheirs") {
        const hasRemainingConflicts = conflictsRef.current.size > 0;
        const hasRemainingDirty = dirtyRef.current.size > 0 || summaryDirtyRef.current.size > 0;
        const hasInFlight =
          inFlightRef.current.size > 0 || summaryInFlightRef.current.size > 0 || isInFlightRef.current;

        if (!hasRemainingConflicts && !hasRemainingDirty && !hasInFlight) {
          setAggregateStatus("idle");
        } else if (hasRemainingConflicts) {
          setAggregateStatus("error");
        } else if (hasRemainingDirty) {
          setAggregateStatus("pending");
          schedule();
        }
      }
    },
    [editEntry, editSummary, journalId, queryClient, schedule, updateCacheWithConflict]
  );

  const retryManual = useCallback(async () => {
    retryCountRef.current = 0;
    if (!journalId) return;

    try {
      const fresh = await getJournal(journalId);

      const mergedStudents = fresh.students.map((student) => {
        const mergedEntries = student.entries.map((e) => {
          const key = `${student.student_id}:${e.lesson_date}`;
          const draft = dirtyRef.current.get(key);
          if (draft) {
            return {
              ...e,
              attendance: draft.attendance,
              score: draft.score,
              comment: draft.comment ?? null,
              has_comment: Boolean(draft.comment && draft.comment.trim().length > 0),
            };
          }
          return e;
        });
        const summaryDraft = summaryDirtyRef.current.get(student.student_id);
        const mergedSummary =
          summaryDraft && student.summary
            ? {
                ...student.summary,
                bonus_score: summaryDraft.bonus_score,
                exam_score: summaryDraft.exam_score,
              }
            : student.summary;
        return {
          ...student,
          entries: mergedEntries,
          summary: mergedSummary,
        };
      });

      queryClient.setQueryData<JournalDetailResponse>(["journals", "detail", journalId], {
        ...fresh,
        students: mergedStudents,
      });

      const newConflicts: JournalAutosaveConflict[] = [];

      dirtyRef.current.forEach((draft) => {
        const student = fresh.students.find((s) => s.student_id === draft.student_id);
        const serverEntry = student?.entries.find((e) => e.lesson_date === draft.lesson_date);

        if (!serverEntry) {
          newConflicts.push({
            type: "entry",
            student_id: draft.student_id,
            lesson_date: draft.lesson_date,
            submitted_version: draft.version,
            current: null,
          });
          return;
        }

        const isIdentical =
          serverEntry.attendance === draft.attendance &&
          serverEntry.score === draft.score &&
          (serverEntry.comment ?? null) === (draft.comment ?? null);

        if (isIdentical) {
          draft.version = serverEntry.version;
        } else {
          newConflicts.push({
            type: "entry",
            student_id: draft.student_id,
            lesson_date: draft.lesson_date,
            submitted_version: draft.version,
            current: {
              student_id: draft.student_id,
              lesson_date: draft.lesson_date,
              attendance: serverEntry.attendance,
              score: serverEntry.score,
              comment: serverEntry.comment,
              version: serverEntry.version,
            },
          });
        }
      });

      summaryDirtyRef.current.forEach((summaryDraft) => {
        const student = fresh.students.find((s) => s.student_id === summaryDraft.studentId);
        const serverSummary = student?.summary;

        if (!serverSummary) {
          newConflicts.push({
            type: "summary",
            student_id: summaryDraft.studentId,
            submitted_version: summaryDraft.version,
            current: null,
          });
          return;
        }

        const isIdentical =
          serverSummary.bonus_score === summaryDraft.bonus_score &&
          serverSummary.exam_score === summaryDraft.exam_score;

        if (isIdentical) {
          summaryDraft.version = serverSummary.version;
        } else {
          newConflicts.push({
            type: "summary",
            student_id: summaryDraft.studentId,
            submitted_version: summaryDraft.version,
            current: {
              id: serverSummary.id,
              journal_id: serverSummary.journal_id ?? journalId,
              student_id: serverSummary.student_id ?? summaryDraft.studentId,
              homework_score: serverSummary.homework_score,
              attendance_score: serverSummary.attendance_score,
              exam_score: serverSummary.exam_score,
              bonus_score: serverSummary.bonus_score,
              sum_score: serverSummary.sum_score,
              max_period_score: serverSummary.max_period_score,
              percentage: serverSummary.percentage,
              attendance_count: serverSummary.attendance_count,
              total_lessons: serverSummary.total_lessons,
              version: serverSummary.version,
            },
          });
        }
      });

      if (newConflicts.length > 0) {
        setConflicts((prev) => {
          const updatedKeys = new Set(
            newConflicts.map((c) => (c.type === "summary" ? `${c.student_id}:summary` : `${c.student_id}:${c.lesson_date}`))
          );
          const remaining = prev.filter((c) => {
            const k = c.type === "summary" ? `${c.student_id}:summary` : `${c.student_id}:${c.lesson_date}`;
            return !updatedKeys.has(k);
          });
          const next = [...remaining, ...newConflicts];
          conflictsRef.current = new Map(
            next.map((c) => [c.type === "summary" ? `${c.student_id}:summary` : `${c.student_id}:${c.lesson_date}`, c])
          );
          return next;
        });
        setCellStatus((prev) => {
          const next = new Map(prev);
          newConflicts.forEach((c) => {
            if (c.type === "entry") {
              next.set(`${c.student_id}:${c.lesson_date}`, "conflict");
            }
          });
          return next;
        });
        setAggregateStatus("error");
        return;
      }

      await flush("manual");
    } catch {
      setAggregateStatus("error");
    }
  }, [flush, journalId, queryClient]);

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
    retryManual,
    hasPendingEdits: dirtyRef.current.size > 0 || summaryDirtyRef.current.size > 0 || inFlightRef.current.size > 0,
  };
}
