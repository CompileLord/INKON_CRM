import { createContext, useContext } from "react";
import type { JournalQueueRegistry } from "./JournalQueueRegistry";

export const JournalQueueRegistryContext = createContext<JournalQueueRegistry | null>(null);

export function useOptionalJournalQueueRegistry(): JournalQueueRegistry | null {
  return useContext(JournalQueueRegistryContext);
}

export function useJournalQueueRegistry(): JournalQueueRegistry {
  const registry: JournalQueueRegistry | null = useContext(JournalQueueRegistryContext);
  if (!registry) throw new Error("JournalQueueProvider is missing above this component");
  return registry;
}
