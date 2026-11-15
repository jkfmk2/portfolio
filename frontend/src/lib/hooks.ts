import { useQuery } from "@tanstack/react-query";
import {
  getIncomeReport,
  getMeta,
  getSummary,
  listAccounts,
  listFxRates,
  listInstruments,
  listPrices,
  listTransactions,
  type IncomeReportParams,
  type TransactionFilters,
} from "./api";

export function useAccounts() {
  return useQuery({ queryKey: ["accounts"], queryFn: listAccounts });
}

export function useInstruments() {
  return useQuery({ queryKey: ["instruments"], queryFn: listInstruments });
}

export function useTransactions(filters: TransactionFilters = {}) {
  return useQuery({
    queryKey: ["transactions", filters],
    queryFn: () => listTransactions(filters),
  });
}

export function useSummary(date?: string, base?: string, accountId?: number) {
  return useQuery({
    queryKey: ["summary", date ?? "today", base ?? "default", accountId ?? "all"],
    queryFn: () => getSummary(date, base, accountId),
  });
}

export function useMeta() {
  return useQuery({ queryKey: ["meta"], queryFn: getMeta, staleTime: Infinity });
}

export function useIncomeReport(params: IncomeReportParams) {
  return useQuery({
    queryKey: [
      "report",
      "income",
      params.from,
      params.to,
      params.base ?? "default",
      params.accountId ?? "all",
    ],
    queryFn: () => getIncomeReport(params),
  });
}

export function usePrices(instrumentId?: number) {
  return useQuery({
    queryKey: ["prices", instrumentId ?? "all"],
    queryFn: () => listPrices(instrumentId),
  });
}

export function useFxRates() {
  return useQuery({ queryKey: ["fx-rates"], queryFn: listFxRates });
}
