import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { AuditUrlState, type AuditViewState } from "../../lib/audit/auditUrlState";

export interface AuditNavigation {
  state: AuditViewState;
  setPage: (page: number) => void;
  changeFilters: (filters: Partial<Omit<AuditViewState, "page">>, replace?: boolean) => void;
  clearAll: () => void;
}

export function useAuditNavigation(): AuditNavigation {
  const [searchParams, setSearchParams] = useSearchParams();
  const state: AuditViewState = useMemo(() => AuditUrlState.parse(searchParams), [searchParams]);

  const commit = useCallback(
    (next: AuditViewState, replace: boolean = false) => {
      setSearchParams(AuditUrlState.serialize(next), { replace });
    },
    [setSearchParams],
  );

  return {
    state,
    setPage: (page) => commit({ ...state, page }, true),
    changeFilters: (filters, replace = false) => commit({ ...state, ...filters, page: 1 }, replace),
    clearAll: () => commit(AuditUrlState.cleared(state)),
  };
}
