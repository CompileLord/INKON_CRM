import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FinanceUrlState,
  type CollectionRange,
  type DebtorsViewState,
  type FinanceTab,
  type FinanceViewState,
  type PaymentsViewState,
} from "../../lib/finance/urlState";

export interface FinanceNavigation {
  state: FinanceViewState;
  selectTab: (tab: FinanceTab) => void;
  applyRange: (range: CollectionRange) => void;
  setDebtorsPage: (page: number) => void;
  changeDebtorsFilters: (filters: Partial<Omit<DebtorsViewState, "page">>) => void;
  setPaymentsPage: (page: number) => void;
  changePaymentsFilters: (filters: Partial<Omit<PaymentsViewState, "page">>) => void;
}

export function useFinanceNavigation(): FinanceNavigation {
  const [searchParams, setSearchParams] = useSearchParams();
  const state: FinanceViewState = useMemo(() => FinanceUrlState.parse(searchParams), [searchParams]);

  const commit = useCallback(
    (next: FinanceViewState, replace: boolean = false) => {
      setSearchParams(FinanceUrlState.serialize(next), { replace });
    },
    [setSearchParams],
  );

  return {
    state,
    selectTab: (tab) => commit({ ...state, tab }),
    applyRange: (range) =>
      commit({ ...state, range: FinanceUrlState.sameRange(range, FinanceUrlState.defaultRange()) ? null : range }),
    setDebtorsPage: (page) => commit({ ...state, debtors: { ...state.debtors, page } }),
    changeDebtorsFilters: (filters) => commit({ ...state, debtors: { ...state.debtors, ...filters, page: 1 } }),
    setPaymentsPage: (page) => commit({ ...state, payments: { ...state.payments, page } }),
    changePaymentsFilters: (filters) => commit({ ...state, payments: { ...state.payments, ...filters, page: 1 } }),
  };
}
