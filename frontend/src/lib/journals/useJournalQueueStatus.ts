import { useSyncExternalStore } from "react";
import { useJournalQueueRegistry } from "./journalQueueContext";
import type { JournalRegistrySnapshot } from "./JournalQueueRegistry";

export function useJournalQueueStatus(): JournalRegistrySnapshot {
  const registry = useJournalQueueRegistry();
  return useSyncExternalStore(registry.subscribe, registry.getSnapshot);
}
