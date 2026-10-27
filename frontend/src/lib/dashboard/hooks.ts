import { useQuery } from "@tanstack/react-query";
import { fetchDashboardAttention } from "./api";

export const DASHBOARD_ATTENTION_QUERY_KEY: readonly string[] = ["dashboard", "attention"];

export function useDashboardAttention() {
  return useQuery({
    queryKey: DASHBOARD_ATTENTION_QUERY_KEY,
    queryFn: fetchDashboardAttention,
    refetchInterval: 60_000,
  });
}
