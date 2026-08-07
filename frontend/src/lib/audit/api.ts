import { httpClient } from "../auth/httpClient";
import type { Paginated } from "../pagination";

export interface AuditLogItem {
  id: number;
  user_id?: number;
  user_name?: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN";
  entity_type: string;
  entity_id: number;
  field_name?: string;
  old_value?: string;
  new_value?: string;
  created_at: string;
}

export async function fetchAuditLogs(page = 1, pageSize = 20): Promise<Paginated<AuditLogItem>> {
  const response = await httpClient.get(`/audit-log/?page=${page}&page_size=${pageSize}`);
  return response.data;
}

