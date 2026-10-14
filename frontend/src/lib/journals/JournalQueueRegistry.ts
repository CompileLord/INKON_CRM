import type { QueryClient } from "@tanstack/react-query";
import { DEFAULT_JOURNAL_QUEUE_API, JournalQueueOwner } from "./JournalQueueOwner";
import {
  EMPTY_JOURNAL_COUNTS,
  type JournalAutosaveConflict,
  type JournalDiscardResult,
  type JournalDrainResult,
  type JournalQueueApi,
  type JournalQueueSnapshot,
  type JournalSaveCounts,
  type JournalSavePhase,
} from "./journalQueueTypes";

export interface JournalRegistryConflict {
  journalId: number;
  conflict: JournalAutosaveConflict;
}

export interface JournalRegistrySnapshot {
  revision: number;
  phase: JournalSavePhase;
  counts: JournalSaveCounts;
  hasPending: boolean;
  draining: boolean;
  refetching: boolean;
  conflicts: JournalRegistryConflict[];
}

const PHASE_PRIORITY: readonly JournalSavePhase[] = ["conflict", "failed", "saving", "unsaved", "saved", "idle"];

export const IDLE_REGISTRY_SNAPSHOT: JournalRegistrySnapshot = {
  revision: 0,
  phase: "idle",
  counts: EMPTY_JOURNAL_COUNTS,
  hasPending: false,
  draining: false,
  refetching: false,
  conflicts: [],
};

export class JournalQueueRegistry {
  private readonly queryClient: QueryClient;
  private readonly api: JournalQueueApi;
  private readonly owners: Map<number, JournalQueueOwner> = new Map();
  private readonly ownerSubscriptions: Map<number, () => void> = new Map();
  private readonly listeners: Set<() => void> = new Set();
  private snapshot: JournalRegistrySnapshot | null = null;
  private revision: number = 0;
  private draining: boolean = false;
  private active: boolean = false;

  constructor(queryClient: QueryClient, api: JournalQueueApi = DEFAULT_JOURNAL_QUEUE_API) {
    this.queryClient = queryClient;
    this.api = api;
  }

  ownerFor(journalId: number, courseId?: number): JournalQueueOwner {
    const existing: JournalQueueOwner | undefined = this.owners.get(journalId);
    if (existing) return existing;
    const created: JournalQueueOwner = new JournalQueueOwner(journalId, courseId, this.queryClient, this.api);
    this.owners.set(journalId, created);
    this.ownerSubscriptions.set(
      journalId,
      created.subscribe(() => this.invalidate()),
    );
    this.snapshot = null;
    return created;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): JournalRegistrySnapshot => {
    if (!this.snapshot) this.snapshot = this.buildSnapshot();
    return this.snapshot;
  };

  hasPending(): boolean {
    return Array.from(this.owners.values()).some((owner) => owner.hasPending());
  }

  async drainAll(): Promise<JournalDrainResult> {
    this.draining = true;
    this.invalidate();
    try {
      const results: JournalDrainResult[] = await Promise.all(
        Array.from(this.owners.values()).map((owner) => owner.drain()),
      );
      const conflictCount: number = results.reduce(
        (total, result) => total + (result.kind === "conflict" ? result.conflictCount : 0),
        0,
      );
      if (conflictCount > 0) return { kind: "conflict", conflictCount };
      const unsettledCount: number = results.reduce(
        (total, result) => total + (result.kind === "failed" ? result.unsettledCount : 0),
        0,
      );
      if (unsettledCount > 0) return { kind: "failed", unsettledCount };
      if (results.some((result) => result.kind === "unavailable")) return { kind: "unavailable" };
      return { kind: "acknowledged" };
    } finally {
      this.draining = false;
      this.invalidate();
    }
  }

  async discardAll(): Promise<JournalDiscardResult> {
    const results: JournalDiscardResult[] = await Promise.all(
      Array.from(this.owners.values()).map((owner) => owner.discardUnsettled()),
    );
    return results.some((result) => result.kind === "unavailable") ? { kind: "unavailable" } : { kind: "discarded" };
  }

  async retryAll(): Promise<void> {
    await Promise.all(Array.from(this.owners.values()).map((owner) => (owner.hasPending() ? owner.retryManual() : Promise.resolve())));
  }

  flushAll(): void {
    this.owners.forEach((owner) => owner.flushBestEffort());
  }

  activate(): void {
    if (this.active || typeof window === "undefined") return;
    this.active = true;
    window.addEventListener("beforeunload", this.handleBeforeUnload);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  deactivate(): void {
    if (!this.active) return;
    this.active = false;
    window.removeEventListener("beforeunload", this.handleBeforeUnload);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    this.flushAll();
  }

  dispose(): void {
    this.deactivate();
    this.ownerSubscriptions.forEach((unsubscribe) => unsubscribe());
    this.ownerSubscriptions.clear();
    this.owners.forEach((owner) => owner.dispose());
    this.owners.clear();
    this.listeners.clear();
  }

  private handleBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (this.hasPending()) event.preventDefault();
  };

  private handleVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") this.flushAll();
  };

  private invalidate(): void {
    this.snapshot = null;
    this.revision += 1;
    this.listeners.forEach((listener) => listener());
  }

  private buildSnapshot(): JournalRegistrySnapshot {
    const counts: JournalSaveCounts = { ...EMPTY_JOURNAL_COUNTS };
    const conflicts: JournalRegistryConflict[] = [];
    const phases: Set<JournalSavePhase> = new Set();
    let refetching: boolean = false;
    let hasPending: boolean = false;

    this.owners.forEach((owner, journalId) => {
      const ownerSnapshot: JournalQueueSnapshot = owner.getSnapshot();
      counts.conflicts += ownerSnapshot.counts.conflicts;
      counts.failed += ownerSnapshot.counts.failed;
      counts.saving += ownerSnapshot.counts.saving;
      counts.unsaved += ownerSnapshot.counts.unsaved;
      phases.add(ownerSnapshot.phase);
      refetching = refetching || ownerSnapshot.refetching;
      hasPending = hasPending || ownerSnapshot.hasPending;
      ownerSnapshot.conflicts.forEach((conflict) => conflicts.push({ journalId, conflict }));
    });

    const phase: JournalSavePhase = PHASE_PRIORITY.find((candidate) => phases.has(candidate)) ?? "idle";
    return { revision: this.revision, phase, counts, hasPending, draining: this.draining, refetching, conflicts };
  }
}
