import { httpClient } from "../auth/httpClient";
import type { Paginated } from "../pagination";

export type KnownAuditAction = "create" | "update" | "delete" | "void" | "refund" | "close_period" | "reopen_period";

export type AuditAction = KnownAuditAction | (string & {});

export interface AuditLogItem {
  id: number;
  user_id: number | null;
  actor_name?: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: number;
  entity_label?: string | null;
  student_id?: number | null;
  course_id?: number | null;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface AuditChange {
  id: number;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
}

export interface AuditEvent {
  id: number;
  user_id: number | null;
  actor_name: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: number;
  entity_label: string | null;
  student_id: number | null;
  course_id: number | null;
  course_title: string | null;
  amount: string | null;
  created_at: string;
  changes: AuditChange[];
}

export interface AuditActorOption {
  id: number;
  name: string;
}

export interface AuditFilterOptions {
  actors: AuditActorOption[];
  entity_types: string[];
}

export interface AuditFilters {
  actorId?: number;
  action?: KnownAuditAction;
  entityType?: string;
  entityId?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export async function fetchAuditLogs(page = 1, pageSize = 20, filters: AuditFilters = {}): Promise<Paginated<AuditLogItem>> {
  const params = new URLSearchParams({ page: page.toString(), page_size: pageSize.toString() });
  if (filters.actorId !== undefined) params.append("actor_id", filters.actorId.toString());
  if (filters.action) params.append("action", filters.action);
  if (filters.entityType) params.append("entity_type", filters.entityType);
  if (filters.entityId !== undefined) params.append("entity_id", filters.entityId.toString());
  if (filters.dateFrom) params.append("date_from", filters.dateFrom);
  if (filters.dateTo) params.append("date_to", filters.dateTo);
  if (filters.search) params.append("search", filters.search);
  const response = await httpClient.get(`/audit-log/?${params.toString()}`);
  return response.data;
}

export async function fetchAuditFilterOptions(): Promise<AuditFilterOptions> {
  const response = await httpClient.get("/audit-log/filter-options/");
  return response.data;
}

export async function fetchAuditEvents(page = 1, pageSize = 20, filters: AuditFilters = {}): Promise<Paginated<AuditEvent>> {
  const params = new URLSearchParams({ page: page.toString(), page_size: pageSize.toString() });
  if (filters.actorId !== undefined) params.append("actor_id", filters.actorId.toString());
  if (filters.action) params.append("action", filters.action);
  if (filters.entityType) params.append("entity_type", filters.entityType);
  if (filters.entityId !== undefined) params.append("entity_id", filters.entityId.toString());
  if (filters.dateFrom) params.append("date_from", filters.dateFrom);
  if (filters.dateTo) params.append("date_to", filters.dateTo);
  if (filters.search) params.append("search", filters.search);
  const response = await httpClient.get(`/audit-log/events/?${params.toString()}`);
  return response.data;
}
