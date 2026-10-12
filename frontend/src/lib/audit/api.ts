import { httpClient } from "../auth/httpClient";
import type { Paginated } from "../pagination";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "void"
  | "refund"
  | "close_period"
  | "reopen_period"
  | (string & {});

export interface AuditLogItem {
  id: number;
  user_id: number | null;
  action: AuditAction;
  entity_type: string;
  entity_id: number;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export async function fetchAuditLogs(page = 1, pageSize = 20): Promise<Paginated<AuditLogItem>> {
  const response = await httpClient.get(`/audit-log/?page=${page}&page_size=${pageSize}`);
  return response.data;
}
