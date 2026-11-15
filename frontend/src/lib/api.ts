export type AccountType = "broker" | "bank" | "cash";
export type AssetType = "stock" | "etf" | "bond" | "cash";
export type TxnType =
  | "buy"
  | "sell"
  | "dividend"
  | "interest"
  | "deposit"
  | "withdraw"
  | "fee"
  | "tax"
  | "transfer_in"
  | "transfer_out"
  | "split";

export interface Account {
  id: number;
  name: string;
  broker: string | null;
  account_type: AccountType;
  currency: string;
  note: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Instrument {
  id: number;
  symbol: string;
  name: string;
  asset_type: AssetType;
  currency: string;
  market: string;
  exchange: string | null;
  face_value: number | null;
  coupon_rate: number | null;
  coupon_frequency: number | null;
  maturity_date: string | null;
  issue_date: string | null;
  isin: string | null;
  credit_rating: string | null;
  interest_rate: number | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
  label: string;
}

export interface Transaction {
  id: number;
  account_id: number;
  cash_account_id: number | null;
  instrument_id: number | null;
  account_name: string | null;
  cash_account_name: string | null;
  funding_account_name: string | null;
  instrument_symbol: string | null;
  instrument_name: string | null;
  instrument_label: string | null;
  asset_type: string;
  type: TxnType;
  trade_date: string;
  quantity: number;
  price: number;
  gross_amount: number;
  fee: number;
  tax: number;
  currency: string;
  fx_rate: number;
  cash_flow: number | null;
  note: string | null;
  external_id: string | null;
  created_at: string;
}

export interface TransactionList {
  items: Transaction[];
  total: number;
}

export interface Holding {
  account_id: number;
  account_name: string | null;
  instrument_id: number;
  symbol: string;
  name: string;
  asset_type: AssetType;
  asset_label: string;
  market: string;
  currency: string;
  quantity: number;
  avg_cost: number;
  price: number;
  price_date: string | null;
  price_source: string;
  market_value: number;
  cost_basis: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  realized_pnl: number;
  income: number;
  fx_rate: number;
  market_value_base: number;
  cost_basis_base: number;
  unrealized_pnl_base: number;
  realized_pnl_base: number;
  income_base: number;
  weight_pct: number;
}

export interface CashPosition {
  account_id: number;
  account_name: string | null;
  account_type: string | null;
  currency: string;
  amount: number;
  fx_rate: number;
  value_base: number;
  weight_pct: number;
}

export interface AllocationSlice {
  key: string;
  label: string;
  value: number;
  pct: number;
}

export interface PortfolioSummary {
  as_of: string;
  base_currency: string;
  account_id: number | null;
  total_value: number;
  securities_value: number;
  cash_value: number;
  cost_basis: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  realized_pnl: number;
  income: number;
  holdings_count: number;
  accounts_count: number;
  holdings: Holding[];
  cash_positions: CashPosition[];
  allocation_by_type: AllocationSlice[];
  allocation_by_currency: AllocationSlice[];
  allocation_by_account: AllocationSlice[];
  warnings: string[];
}

export interface Meta {
  base_currency: string;
  asset_types: { value: AssetType; label: string }[];
  account_types: { value: AccountType; label: string }[];
  transaction_types: { value: TxnType; label: string }[];
  markets: string[];
  currencies: string[];
}

/* reports */
export interface ReportBucket {
  period: string;
  realized_pnl: number;
  dividends_gross: number;
  dividends_net: number;
  interest_gross: number;
  interest_net: number;
  income_net: number;
  fees: number;
  taxes: number;
  total: number;
}

export interface ReportTotals {
  realized_pnl: number;
  proceeds: number;
  cost_basis: number;
  dividends_gross: number;
  dividends_net: number;
  interest_gross: number;
  interest_net: number;
  income_gross: number;
  income_net: number;
  fees: number;
  taxes: number;
  total: number;
}

export interface ReportRealizedRow {
  transaction_id: number;
  trade_date: string;
  account_id: number;
  account_name: string | null;
  instrument_id: number;
  symbol: string;
  name: string;
  asset_type: AssetType;
  quantity: number;
  price: number;
  proceeds: number;
  cost_basis: number;
  fee: number;
  tax: number;
  currency: string;
  fx_rate: number;
  realized_pnl: number;
  realized_pnl_base: number;
}

export interface ReportIncomeRow {
  transaction_id: number;
  trade_date: string;
  type: "dividend" | "interest";
  account_id: number;
  account_name: string | null;
  instrument_id: number;
  symbol: string;
  name: string;
  gross: number;
  fee: number;
  tax: number;
  net: number;
  currency: string;
  fx_rate: number;
  gross_base: number;
  net_base: number;
}

export interface IncomeReport {
  from: string;
  to: string;
  base_currency: string;
  account_id: number | null;
  totals: ReportTotals;
  buckets: ReportBucket[];
  realized: ReportRealizedRow[];
  income: ReportIncomeRow[];
  warnings: string[];
}

export interface IncomeReportParams {
  from: string;
  to: string;
  base?: string;
  accountId?: number;
}

/* IRR report */
export interface IrrSummary {
  irr_pct: number | null;
  days: number;
  start_value: number;
  end_value: number;
  contributed: number;
  withdrawn: number;
  net_flow: number;
  gain: number;
}

export interface IrrInception {
  irr_pct: number | null;
  from: string | null;
  days: number | null;
  contributed: number;
  withdrawn: number;
  net_flow: number;
  end_value: number;
  gain: number | null;
}

export interface IrrBucket {
  period: string;
  from: string;
  to: string;
  partial: boolean;
  days: number;
  irr_pct: number | null;
  start_value: number;
  end_value: number;
  contributed: number;
  withdrawn: number;
  net_flow: number;
  gain: number;
}

export interface IrrFlowRow {
  transaction_id: number;
  trade_date: string;
  type: "deposit" | "withdraw";
  direction: "in" | "out";
  account_id: number;
  account_name: string | null;
  amount: number;
  currency: string;
  fx_rate: number;
  amount_base: number;
}

export interface IrrReport {
  from: string;
  to: string;
  base_currency: string;
  summary: IrrSummary;
  since_inception: IrrInception;
  years: IrrBucket[];
  months: IrrBucket[];
  flows: IrrFlowRow[];
  warnings: string[];
}

export interface IrrReportParams {
  from: string;
  to: string;
  base?: string;
}

export interface PriceRow {
  id: number;
  instrument_id: number;
  date: string;
  close: number;
  currency: string;
  source: string;
  created_at: string;
}

export interface FxRateRow {
  id: number;
  base_currency: string;
  quote_currency: string;
  date: string;
  rate: number;
  source: string;
  created_at: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body
      ? { "Content-Type": "application/json", ...(init.headers ?? {}) }
      : init?.headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.error ? String(body.error) : `HTTP ${res.status}`;
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

/* accounts */
export const listAccounts = () => request<Account[]>("/accounts");
export const createAccount = (body: Partial<Account>) =>
  request<Account>("/accounts", json("POST", body));
export const updateAccount = (id: number, body: Partial<Account>) =>
  request<Account>(`/accounts/${id}`, json("PATCH", body));
export const deleteAccount = (id: number) =>
  request<void>(`/accounts/${id}`, { method: "DELETE" });

/* instruments */
export const listInstruments = () => request<Instrument[]>("/instruments");
export const createInstrument = (body: Partial<Instrument>) =>
  request<Instrument>("/instruments", json("POST", body));
export const updateInstrument = (id: number, body: Partial<Instrument>) =>
  request<Instrument>(`/instruments/${id}`, json("PATCH", body));
export const deleteInstrument = (id: number) =>
  request<void>(`/instruments/${id}`, { method: "DELETE" });

/* transactions */
export interface TransactionFilters {
  account_id?: number;
  cash_account_id?: number;
  instrument_id?: number;
  type?: string;
  start?: string;
  end?: string;
  limit?: number;
  offset?: number;
}

export const listTransactions = (filters: TransactionFilters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const query = params.toString();
  return request<TransactionList>(`/transactions${query ? `?${query}` : ""}`);
};
export const createTransaction = (body: Record<string, unknown>) =>
  request<Transaction>("/transactions", json("POST", body));
export const updateTransaction = (id: number, body: Record<string, unknown>) =>
  request<Transaction>(`/transactions/${id}`, json("PATCH", body));
export const deleteTransaction = (id: number) =>
  request<void>(`/transactions/${id}`, { method: "DELETE" });

/* portfolio */
export const getSummary = (date?: string, base?: string, accountId?: number) => {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (base) params.set("base", base);
  if (accountId) params.set("account_id", String(accountId));
  const query = params.toString();
  return request<PortfolioSummary>(`/portfolio/summary${query ? `?${query}` : ""}`);
};

/* reports */
export const getIncomeReport = ({ from, to, base, accountId }: IncomeReportParams) => {
  const params = new URLSearchParams({ from, to });
  if (base) params.set("base", base);
  if (accountId) params.set("account_id", String(accountId));
  return request<IncomeReport>(`/reports/income?${params.toString()}`);
};

export const getIrrReport = ({ from, to, base }: IrrReportParams) => {
  const params = new URLSearchParams({ from, to });
  if (base) params.set("base", base);
  return request<IrrReport>(`/reports/irr?${params.toString()}`);
};

/* market data */
export const listPrices = (instrumentId?: number) => {
  const query = instrumentId ? `?instrument_id=${instrumentId}` : "";
  return request<PriceRow[]>(`/prices${query}`);
};
export const upsertPrice = (body: {
  instrument_id: number;
  date: string;
  close: number;
  currency?: string;
  source?: string;
}) => request<PriceRow>("/prices", json("POST", body));
export const deletePrice = (id: number) =>
  request<void>(`/prices/${id}`, { method: "DELETE" });

export const listFxRates = () => request<FxRateRow[]>("/fx-rates");
export const upsertFxRate = (body: {
  base_currency: string;
  quote_currency: string;
  date: string;
  rate: number;
  source?: string;
}) => request<FxRateRow>("/fx-rates", json("POST", body));
export const deleteFxRate = (id: number) =>
  request<void>(`/fx-rates/${id}`, { method: "DELETE" });

export const getMeta = () => request<Meta>("/meta");
