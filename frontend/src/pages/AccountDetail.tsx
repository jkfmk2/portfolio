import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Coins,
  Landmark,
  PiggyBank,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { useAccounts, useMeta, useSummary, useTransactions } from "../lib/hooks";
import {
  fmtDate,
  fmtMoney,
  fmtNumber,
  fmtPct,
  fmtPrice,
  fmtQty,
  pnlClass,
} from "../lib/format";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorBanner,
  Loading,
  PageHeader,
  cn,
} from "../components/ui";

const TONE: Record<string, string> = {
  buy: "buy",
  sell: "sell",
  dividend: "income",
  interest: "income",
  deposit: "move",
  withdraw: "move",
  transfer_in: "move",
  transfer_out: "move",
};

export default function AccountDetail() {
  const params = useParams();
  const parsed = Number(params.id);
  const accountId = Number.isInteger(parsed) && parsed > 0 ? parsed : -1;
  const valid = accountId > 0;

  const { data: accounts, isLoading: accountsLoading } = useAccounts();
  const { data: summary, isLoading, error } = useSummary(undefined, undefined, accountId);
  const { data: txns } = useTransactions({ account_id: accountId, limit: 300 });
  const { data: meta } = useMeta();

  const account = accounts?.find((a) => a.id === accountId);
  const labels = new Map<string, string>();
  meta?.transaction_types.forEach((t) => labels.set(t.value, t.label));

  if (accountsLoading) return <Loading />;
  if (!valid || (!account && accounts)) {
    return (
      <div>
        <Link
          to="/accounts"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={15} /> 返回帳戶
        </Link>
        <Card>
          <EmptyState title="找不到帳戶" description="此帳戶可能已被刪除。" />
        </Card>
      </div>
    );
  }

  if (error) return <ErrorBanner message={String(error)} />;
  if (isLoading || !summary || !account) return <Loading />;

  const s = summary;
  const currency = s.base_currency;
  const accountTypeLabel =
    meta?.account_types.find((t) => t.value === account.account_type)?.label ??
    account.account_type;

  return (
    <div>
      <Link
        to="/accounts"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={15} /> 返回帳戶
      </Link>

      <PageHeader
        title={account.name}
        description={`${accountTypeLabel}${account.broker ? ` · ${account.broker}` : ""} · ${
          account.currency
        }${account.note ? ` · ${account.note}` : ""}`}
      />

      {s.warnings.length > 0 ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <p className="flex items-center gap-1.5 font-medium">
            <TriangleAlert size={14} /> 提醒
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {s.warnings.slice(0, 6).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-medium text-slate-500">帳戶總值</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <PiggyBank size={16} />
            </span>
          </div>
          <p className="tabular mt-3 text-2xl font-bold tracking-tight text-slate-900">
            {fmtMoney(s.total_value, currency)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500">{currency} 計價</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-medium text-slate-500">持倉市值</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <TrendingUp size={16} />
            </span>
          </div>
          <p className="tabular mt-3 text-2xl font-bold tracking-tight text-slate-900">
            {fmtMoney(s.securities_value, currency)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500">成本 {fmtMoney(s.cost_basis, currency)}</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-medium text-slate-500">現金</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <Coins size={16} />
            </span>
          </div>
          <p className="tabular mt-3 text-2xl font-bold tracking-tight text-slate-900">
            {fmtMoney(s.cash_value, currency)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500">{s.cash_positions.length} 個現金部位</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-medium text-slate-500">未實現損益</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <Landmark size={16} />
            </span>
          </div>
          <p
            className={cn(
              "tabular mt-3 text-2xl font-bold tracking-tight",
              pnlClass(s.unrealized_pnl),
            )}
          >
            {fmtMoney(s.unrealized_pnl, currency)}
          </p>
          <p className={cn("mt-1.5 text-xs font-medium", pnlClass(s.unrealized_pnl))}>
            {fmtPct(s.unrealized_pnl_pct)}
          </p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">已實現損益</p>
          <p className={cn("tabular mt-2 text-lg font-semibold", pnlClass(s.realized_pnl))}>
            {fmtMoney(s.realized_pnl, currency)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">股息 / 利息</p>
          <p className="tabular mt-2 text-lg font-semibold text-slate-800">
            {fmtMoney(s.income, currency)}
          </p>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="持倉明細" subtitle={`${s.holdings.length} 檔`} />
        {s.holdings.length === 0 ? (
          <EmptyState title="此帳戶尚無持倉" description="買入交易若掛在此帳戶，會顯示在這裡。" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-2.5 font-medium">標的</th>
                  <th className="px-3 py-2.5 font-medium">類型</th>
                  <th className="px-3 py-2.5 text-right font-medium">數量</th>
                  <th className="px-3 py-2.5 text-right font-medium">均價</th>
                  <th className="px-3 py-2.5 text-right font-medium">現價</th>
                  <th className="px-3 py-2.5 text-right font-medium">市值</th>
                  <th className="px-3 py-2.5 text-right font-medium">未實現損益</th>
                  <th className="px-5 py-2.5 text-right font-medium">比重</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {s.holdings.map((h) => (
                  <tr key={`${h.account_id}-${h.instrument_id}`} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-800">{h.symbol}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{h.name || "—"}</p>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={h.asset_type}>{h.asset_label}</Badge>
                    </td>
                    <td className="tabular px-3 py-3 text-right text-slate-700">
                      {fmtQty(h.quantity)}
                    </td>
                    <td className="tabular px-3 py-3 text-right text-slate-600">
                      {fmtPrice(h.avg_cost)}
                      <span className="ml-1 text-[10px] text-slate-400">{h.currency}</span>
                    </td>
                    <td className="tabular px-3 py-3 text-right text-slate-600">
                      {fmtPrice(h.price)}
                    </td>
                    <td className="tabular px-3 py-3 text-right font-medium text-slate-800">
                      {fmtMoney(h.market_value_base, currency)}
                    </td>
                    <td className="tabular px-3 py-3 text-right">
                      <p className={cn("font-medium", pnlClass(h.unrealized_pnl_base))}>
                        {fmtMoney(h.unrealized_pnl_base, currency)}
                      </p>
                      <p className={cn("text-[11px]", pnlClass(h.unrealized_pnl_base))}>
                        {fmtPct(h.unrealized_pnl_pct)}
                      </p>
                    </td>
                    <td className="tabular px-5 py-3 text-right text-slate-500">
                      {fmtNumber(h.weight_pct, 1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title="現金部位" subtitle="由交易流水自動推算" />
        {s.cash_positions.length === 0 ? (
          <EmptyState title="此帳戶尚無現金餘額" description="存入現金或作為資金帳戶後會顯示在這裡。" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-2.5 font-medium">幣別</th>
                  <th className="px-3 py-2.5 text-right font-medium">金額</th>
                  <th className="px-3 py-2.5 text-right font-medium">換算</th>
                  <th className="px-5 py-2.5 text-right font-medium">比重</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {s.cash_positions.map((p, index) => (
                  <tr key={`${p.account_id}-${p.currency}-${index}`} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 text-slate-500">{p.currency}</td>
                    <td className="tabular px-3 py-3 text-right text-slate-700">
                      {fmtMoney(p.amount, p.currency, 2)}
                    </td>
                    <td className="tabular px-3 py-3 text-right font-medium text-slate-800">
                      {fmtMoney(p.value_base, currency)}
                    </td>
                    <td className="tabular px-5 py-3 text-right text-slate-500">
                      {fmtNumber(p.weight_pct, 1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="相關交易"
          subtitle={`${txns?.total ?? 0} 筆，包含以此帳戶為證券或資金帳戶的交易`}
        />
        {!txns || txns.items.length === 0 ? (
          <EmptyState title="尚無相關交易" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-2.5 font-medium">日期</th>
                  <th className="px-3 py-2.5 font-medium">類型</th>
                  <th className="px-3 py-2.5 font-medium">標的</th>
                  <th className="px-3 py-2.5 text-right font-medium">成交金額</th>
                  <th className="px-3 py-2.5 text-right font-medium">手續費</th>
                  <th className="px-3 py-2.5 text-right font-medium">稅費</th>
                  <th className="px-3 py-2.5 text-right font-medium">淨額</th>
                  <th className="px-5 py-2.5 font-medium">資金帳戶</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {txns.items.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/60">
                    <td className="tabular px-5 py-3 text-slate-600">{fmtDate(t.trade_date)}</td>
                    <td className="px-3 py-3">
                      <Badge tone={TONE[t.type] ?? "neutral"}>
                        {labels.get(t.type) ?? t.type}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {t.instrument_symbol ?? "—"}
                    </td>
                    <td className="tabular px-3 py-3 text-right text-slate-700">
                      {fmtMoney(t.gross_amount, t.currency, 2)}
                    </td>
                    <td className="tabular px-3 py-3 text-right text-slate-600">
                      {t.fee ? fmtMoney(t.fee, t.currency, 2) : "—"}
                    </td>
                    <td className="tabular px-3 py-3 text-right text-slate-600">
                      {t.tax ? fmtMoney(t.tax, t.currency, 2) : "—"}
                    </td>
                    <td
                      className={cn(
                        "tabular px-3 py-3 text-right font-medium",
                        t.cash_flow && t.cash_flow > 0 ? "text-emerald-600" : "text-slate-700",
                      )}
                    >
                      {t.cash_flow === null
                        ? "—"
                        : `${t.cash_flow > 0 ? "+" : ""}${fmtMoney(
                            t.cash_flow,
                            t.currency,
                            2,
                          )}`}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {t.cash_account_id ? t.funding_account_name : "同證券帳戶"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
