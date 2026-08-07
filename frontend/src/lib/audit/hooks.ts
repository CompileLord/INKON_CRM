import { useQuery } from "@tanstack/react-query";
import { fetchAuditLogs } from "./api";

export function useAuditLogs(page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ["audit", "logs", page, pageSize],
    queryFn: () => fetchAuditLogs(page, pageSize),
  });
}
