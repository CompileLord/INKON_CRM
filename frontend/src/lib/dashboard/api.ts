import { httpClient } from "../auth/httpClient";
import type { DashboardAttention } from "./types";

export async function fetchDashboardAttention(): Promise<DashboardAttention> {
  const response = await httpClient.get("/dashboard/attention");
  return response.data;
}
