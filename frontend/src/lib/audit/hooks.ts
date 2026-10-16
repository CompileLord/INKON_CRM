import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchAuditEvents, fetchAuditFilterOptions, fetchAuditLogs, type AuditFilters } from "./api";

export function useAuditLogs(page = 1, pageSize = 20, filters: AuditFilters = {}) {
  return useQuery({
    queryKey: ["audit", "logs", page, pageSize, filters],
    queryFn: () => fetchAuditLogs(page, pageSize, filters),
  });
}

export function useAuditEvents(page = 1, pageSize = 20, filters: AuditFilters = {}) {
  return useQuery({
    queryKey: ["audit", "events", page, pageSize, filters],
    queryFn: () => fetchAuditEvents(page, pageSize, filters),
    placeholderData: keepPreviousData,
  });
}

export function useAuditFilterOptions() {
  return useQuery({
    queryKey: ["audit", "filter-options"],
    queryFn: fetchAuditFilterOptions,
    staleTime: 60_000,
  });
}
