import type { AuditFilters, KnownAuditAction } from "./api";
import { FinanceUrlState } from "../finance/urlState";
import { AUDIT_CATEGORIES, type AuditCategory } from "./types";

export interface AuditViewState {
  page: number;
  actorId: number | null;
  action: KnownAuditAction | null;
  entityType: string | null;
  entityId: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  search: string;
  category: AuditCategory | null;
}

export class AuditUrlState {
  static readonly actions: readonly KnownAuditAction[] = ["create", "update", "delete", "void", "refund", "close_period", "reopen_period"];
  static readonly maximumSearchLength: number = 100;
  private static readonly entityTypePattern: RegExp = /^[a-z][a-z0-9_]{0,99}$/;

  static parse(params: URLSearchParams): AuditViewState {
    const rawAction: string | null = params.get("action");
    const rawEntity: string | null = params.get("entity");
    const entityType: string | null = rawEntity !== null && AuditUrlState.entityTypePattern.test(rawEntity) ? rawEntity : null;
    const rawFrom: string | null = params.get("from");
    const rawTo: string | null = params.get("to");
    const dateFrom: string | null = rawFrom !== null && FinanceUrlState.isCalendarDate(rawFrom) ? rawFrom : null;
    const dateTo: string | null = rawTo !== null && FinanceUrlState.isCalendarDate(rawTo) ? rawTo : null;
    const invertedRange: boolean = dateFrom !== null && dateTo !== null && dateFrom > dateTo;
    return {
      page: AuditUrlState.parsePositiveInteger(params.get("page")) ?? 1,
      actorId: AuditUrlState.parsePositiveInteger(params.get("actor")),
      action: AuditUrlState.actions.find((candidate) => candidate === rawAction) ?? null,
      entityType,
      entityId: entityType === null ? null : AuditUrlState.parsePositiveInteger(params.get("ref")),
      dateFrom: invertedRange ? null : dateFrom,
      dateTo: invertedRange ? null : dateTo,
      category: AUDIT_CATEGORIES.find((candidate) => candidate === params.get("category")) ?? null,
      search: (params.get("q") ?? "").trim().slice(0, AuditUrlState.maximumSearchLength),
    };
  }

  static serialize(state: AuditViewState): URLSearchParams {
    const params: URLSearchParams = new URLSearchParams();
    if (state.page > 1) params.set("page", String(state.page));
    if (state.actorId !== null) params.set("actor", String(state.actorId));
    if (state.action !== null) params.set("action", state.action);
    if (state.entityType !== null) {
      params.set("entity", state.entityType);
      if (state.entityId !== null) params.set("ref", String(state.entityId));
    }
    if (state.dateFrom) params.set("from", state.dateFrom);
    if (state.dateTo) params.set("to", state.dateTo);
    if (state.search !== "") params.set("q", state.search);
    if (state.category !== null) params.set("category", state.category);
    return params;
  }

  static toFilters(state: AuditViewState): AuditFilters {
    return {
      ...(state.actorId !== null ? { actorId: state.actorId } : {}),
      ...(state.action !== null ? { action: state.action } : {}),
      ...(state.entityType !== null ? { entityType: state.entityType } : {}),
      ...(state.entityId !== null ? { entityId: state.entityId } : {}),
      ...(state.dateFrom ? { dateFrom: state.dateFrom } : {}),
      ...(state.dateTo ? { dateTo: state.dateTo } : {}),
      ...(state.search !== "" ? { search: state.search } : {}),
      ...(state.category !== null ? { category: state.category } : {}),
    };
  }

  static hasFilters(state: AuditViewState): boolean {
    return Object.keys(AuditUrlState.toFilters(state)).length > 0;
  }

  static cleared(state: AuditViewState): AuditViewState {
    return { ...state, page: 1, actorId: null, action: null, entityType: null, entityId: null, dateFrom: null, dateTo: null, search: "", category: null };
  }

  private static parsePositiveInteger(raw: string | null): number | null {
    if (raw === null || !/^\d+$/.test(raw)) return null;
    const parsed: number = Number(raw);
    return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
  }
}
