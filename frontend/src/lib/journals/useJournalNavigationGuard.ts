import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker, type Blocker } from "react-router-dom";
import { useJournalQueueRegistry } from "./journalQueueContext";
import type { JournalDrainResult } from "./journalQueueTypes";

export type NavigationGuardState =
  | { phase: "idle" }
  | { phase: "draining" }
  | { phase: "discarding" }
  | { phase: "blocked"; result: Exclude<JournalDrainResult, { kind: "acknowledged" }>; discardFailed: boolean };

export interface NavigationGuard {
  state: NavigationGuardState;
  retry: () => void;
  stay: () => void;
  discard: () => void;
}

type FailedDrain = Exclude<JournalDrainResult, { kind: "acknowledged" }>;

export function useJournalNavigationGuard(): NavigationGuard {
  const registry = useJournalQueueRegistry();
  const shouldBlock = useCallback((): boolean => registry.hasPending(), [registry]);
  const blocker: Blocker = useBlocker(shouldBlock);
  const blockerRef = useRef<Blocker>(blocker);
  useEffect(() => {
    blockerRef.current = blocker;
  }, [blocker]);

  const drainingRef = useRef<boolean>(false);
  const [failedDrain, setFailedDrain] = useState<FailedDrain | null>(null);
  const [discardState, setDiscardState] = useState<"idle" | "discarding" | "failed">("idle");
  const [retryRound, setRetryRound] = useState<number>(0);

  useEffect(() => {
    if (blocker.state !== "blocked" || drainingRef.current) return undefined;
    drainingRef.current = true;
    let cancelled = false;
    void registry.drainAll().then((result) => {
      drainingRef.current = false;
      if (cancelled) return;
      if (result.kind === "acknowledged") {
        blockerRef.current.proceed?.();
        return;
      }
      setFailedDrain(result);
    });
    return () => {
      cancelled = true;
    };
  }, [blocker.state, registry, retryRound]);

  const state: NavigationGuardState = (() => {
    if (blocker.state !== "blocked") return { phase: "idle" } as const;
    if (discardState === "discarding") return { phase: "discarding" } as const;
    if (failedDrain) return { phase: "blocked", result: failedDrain, discardFailed: discardState === "failed" } as const;
    return { phase: "draining" } as const;
  })();

  const stay = useCallback((): void => {
    setFailedDrain(null);
    setDiscardState("idle");
    blockerRef.current.reset?.();
  }, []);

  const retry = useCallback((): void => {
    setFailedDrain(null);
    setDiscardState("idle");
    setRetryRound((round) => round + 1);
  }, []);

  const discard = useCallback((): void => {
    setDiscardState("discarding");
    void registry.discardAll().then((result) => {
      if (result.kind === "discarded") {
        setFailedDrain(null);
        setDiscardState("idle");
        blockerRef.current.proceed?.();
        return;
      }
      setDiscardState("failed");
    });
  }, [registry]);

  return { state, retry, stay, discard };
}
