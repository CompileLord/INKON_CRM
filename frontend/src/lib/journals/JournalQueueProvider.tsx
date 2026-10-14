import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { JournalQueueRegistry } from "./JournalQueueRegistry";
import { JournalQueueRegistryContext } from "./journalQueueContext";

export function JournalQueueProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [registry] = useState<JournalQueueRegistry>(() => new JournalQueueRegistry(queryClient));

  useEffect(() => {
    registry.activate();
    return () => registry.deactivate();
  }, [registry]);

  return <JournalQueueRegistryContext.Provider value={registry}>{children}</JournalQueueRegistryContext.Provider>;
}
