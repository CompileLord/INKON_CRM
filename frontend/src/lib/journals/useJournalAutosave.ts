import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOptionalJournalQueueRegistry } from "./journalQueueContext";
import { JournalQueueRegistry } from "./JournalQueueRegistry";
import type { JournalQueueOwner } from "./JournalQueueOwner";
import type { JournalEntryCommand, JournalSummaryField } from "./journalCommands";
import {
  EMPTY_JOURNAL_COUNTS,
  type JournalAutosaveConflict,
  type JournalDrainResult,
  type JournalQueueSnapshot,
} from "./journalQueueTypes";

export type {
  AggregateSaveStatus,
  CellSaveStatus,
  JournalAutosaveConflict,
  JournalAutosaveEntryConflict,
  JournalAutosaveSummaryConflict,
} from "./journalQueueTypes";

const IDLE_SNAPSHOT: JournalQueueSnapshot = {
  journalId: undefined,
  revision: 0,
  cellStatus: new Map(),
  summaryStatus: new Map(),
  cellRejections: new Map(),
  conflicts: [],
  phase: "idle",
  aggregateStatus: "idle",
  counts: EMPTY_JOURNAL_COUNTS,
  hasPending: false,
  draining: false,
  refetching: false,
  forbidden: false,
};

const SUBSCRIBE_NOTHING = (): (() => void) => () => undefined;
const READ_IDLE_SNAPSHOT = (): JournalQueueSnapshot => IDLE_SNAPSHOT;

function useJournalQueueRegistryOrFallback(): JournalQueueRegistry {
  const queryClient = useQueryClient();
  const contextRegistry: JournalQueueRegistry | null = useOptionalJournalQueueRegistry();
  const [fallbackRegistry] = useState<JournalQueueRegistry | null>(() =>
    contextRegistry ? null : new JournalQueueRegistry(queryClient),
  );

  useEffect(() => {
    if (!fallbackRegistry) return undefined;
    fallbackRegistry.activate();
    return () => fallbackRegistry.deactivate();
  }, [fallbackRegistry]);

  return (contextRegistry ?? fallbackRegistry) as JournalQueueRegistry;
}

export function useJournalAutosave(journalId: number | undefined, courseId?: number) {
  const registry: JournalQueueRegistry = useJournalQueueRegistryOrFallback();
  const owner: JournalQueueOwner | null = useMemo(
    () => (journalId === undefined ? null : registry.ownerFor(journalId, courseId)),
    [registry, journalId, courseId],
  );

  const snapshot: JournalQueueSnapshot = useSyncExternalStore(
    owner ? owner.subscribe : SUBSCRIBE_NOTHING,
    owner ? owner.getSnapshot : READ_IDLE_SNAPSHOT,
  );

  const actions = useMemo(
    () => ({
      applyEntryCommand: (studentId: number, lessonDate: string, command: JournalEntryCommand): void =>
        owner?.applyEntryCommand(studentId, lessonDate, command),
      editSummaryField: (studentId: number, field: JournalSummaryField, value: number): void =>
        owner?.editSummaryField(studentId, field, value),
      editEntry: (key: string, patch: Parameters<JournalQueueOwner["editEntry"]>[1]): void =>
        owner?.editEntry(key, patch),
      editSummary: (studentId: number, patch: Parameters<JournalQueueOwner["editSummary"]>[1]): void =>
        owner?.editSummary(studentId, patch),
      resolveConflict: (conflict: JournalAutosaveConflict, choice: "keepMine" | "keepTheirs"): void =>
        owner?.resolveConflict(conflict, choice),
      flush: (): Promise<void> => owner?.flush() ?? Promise.resolve(),
      retryManual: (): Promise<void> => owner?.retryManual() ?? Promise.resolve(),
      drain: (): Promise<JournalDrainResult> => owner?.drain() ?? Promise.resolve({ kind: "acknowledged" }),
    }),
    [owner],
  );

  return {
    cellStatus: snapshot.cellStatus,
    summaryStatus: snapshot.summaryStatus,
    cellRejections: snapshot.cellRejections,
    aggregateStatus: snapshot.aggregateStatus,
    conflicts: snapshot.conflicts,
    phase: snapshot.phase,
    counts: snapshot.counts,
    refetching: snapshot.refetching,
    forbidden: snapshot.forbidden,
    hasPendingEdits: snapshot.hasPending,
    ...actions,
  };
}
