import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, TriangleAlert } from "lucide-react";
import { useIncomeReport } from "../../lib/hooks";
import type { IncomeReportParams } from "../../lib/api";
import type { Range } from "../../lib/report-range";
import { fmtDate, fmtMoney, fmtPrice, fmtQty, pnlClass } from "../../lib/format";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorBanner,
  Loading,
  cn,
} from "../ui";
import { Kpi } from "./Kpi";

const CHART_COLORS = {
  realized: "#4f46e5",
  dividends: "#10b981",
  interest: "#0ea5e9",
};

export default function IncomeReportView({
  range,
  accountId,
}: {
  range: Range;
  accountId?: number;
}) {
  const params: IncomeReportParams = { from: range.from, to: range.to, accountId };
  const { data, isLoading, error } = useIncomeReport(params);

  if (error) return <ErrorBanner message={String(error.message)} />;

  const multiYear = range.from.slice(0, 4) !== range.to.slice(0, 4);
  const currency = data?.base_currency ?? "TWD";

  if (isLoading || !data) return <Loading />;

  return (
    <>
      {data.warnings.length > 0 ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <p className="flex items-center gap-1.5 font-medium">
            <TriangleAlert size={14} /> 提醒
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {data.warnings.slice(0, 6).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi
          label="已實現損益"
          value={fmtMoney(data.totals.realized_pnl, currency)}
          sub={`價金 ${fmtMoney(data.totals.proceeds, currency)} · 成本 ${fmtMoney(
            data.totals.cost_basis,
            currency,
          )}`}
          icon={
            data.totals.realized_pnl >= 0 ? (
              <ArrowUpRight size={16} />
            ) : (
              <ArrowDownRight size={16} />
            )
          }
        />
        <Kpi
          label="股息（稅後）"
          value={fmtMoney(data.totals.dividends_net, currency)}
          sub={`稅前 ${fmtMoney(data.totals.dividends_gross, currency)}`}
        />
        <Kpi
          label="利息（稅後）"
          value={fmtMoney(data.totals.interest_net, currency)}
          sub={`稅前 ${fmtMoney(data.totals.interest_gross, currency)}`}
        />
        <Kpi
          label="手續費＋稅費"
          value={fmtMoney(data.totals.fees + data.totals.taxes, currency)}
          sub={`手續費 ${fmtMoney(data.totals.fees, currency)} · 稅費 ${fmtMoney(
            data.totals.taxes,
            currency,
          )}`}
        />
        <Kpi
          label="期間合計"
          value={fmtMoney(data.totals.total, currency)}
          sub={<span className={pnlClass(data.totals.total)}>已實現＋稅後股息利息</span>}
          accent
        />
      </div>

      {data.realized.length === 0 && data.income.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            title="此期間沒有已實現損益或股息利息"
            description="換個期間，或先到交易頁記錄賣出、股利與利息。"
          />
        </Card>
      ) : (
        <>
          <Card className="mt-4">
            <CardHeader title="每月收益" subtitle="已實現損益與稅後股息／利息" />
            <div className="h-72 px-2 py-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.buckets.map((bucket) => ({
                    ...bucket,
                    label: multiYear
                      ? bucket.period
                      : `${Number(bucket.period.slice(5, 7))}月`,
                  }))}
                  margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={72}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    tickFormatter={(value) => fmtMoney(Number(value), currency)}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      fmtMoney(Number(value), currency),
                      name === "realized_pnl"
                        ? "已實現損益"
                        : name === "dividends_net"
                          ? "股息"
                          : "利息",
                    ]}
                    labelFormatter={(label) => String(label)}
                    contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
                  />
                  <Legend
                    formatter={(value) =>
                      value === "realized_pnl"
                        ? "已實現損益"
                        : value === "dividends_net"
                          ? "股息"
                          : "利息"
                    }
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="realized_pnl" fill={CHART_COLORS.realized} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="dividends_net" fill={CHART_COLORS.dividends} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="interest_net" fill={CHART_COLORS.interest} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="mt-4">
            <CardHeader title="每月彙總" subtitle={`${data.buckets.length} 個月`} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-2.5 font-medium">月份</th>
                    <th className="px-3 py-2.5 text-right font-medium">已實現損益</th>
                    <th className="px-3 py-2.5 text-right font-medium">股息</th>
                    <th className="px-3 py-2.5 text-right font-medium">利息</th>
                    <th className="px-3 py-2.5 text-right font-medium">手續費</th>
                    <th className="px-3 py-2.5 text-right font-medium">稅費</th>
                    <th className="px-5 py-2.5 text-right font-medium">合計</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.buckets.map((bucket) => (
                    <tr key={bucket.period} className="hover:bg-slate-50/60">
                      <td className="tabular px-5 py-3 text-slate-600">{bucket.period}</td>
                      <td
                        className={cn("tabular px-3 py-3 text-right", pnlClass(bucket.realized_pnl))}
                      >
                        {bucket.realized_pnl ? fmtMoney(bucket.realized_pnl, currency) : "—"}
                      </td>
                      <td className="tabular px-3 py-3 text-right text-slate-600">
                        {bucket.dividends_net ? fmtMoney(bucket.dividends_net, currency) : "—"}
                      </td>
                      <td className="tabular px-3 py-3 text-right text-slate-600">
                        {bucket.interest_net ? fmtMoney(bucket.interest_net, currency) : "—"}
                      </td>
                      <td className="tabular px-3 py-3 text-right text-slate-500">
                        {bucket.fees ? fmtMoney(bucket.fees, currency) : "—"}
                      </td>
                      <td className="tabular px-3 py-3 text-right text-slate-500">
                        {bucket.taxes ? fmtMoney(bucket.taxes, currency) : "—"}
                      </td>
                      <td
                        className={cn(
                          "tabular px-5 py-3 text-right font-medium",
                          pnlClass(bucket.total),
                        )}
                      >
                        {bucket.total ? fmtMoney(bucket.total, currency) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="mt-4">
            <CardHeader
              title="已實現損益明細"
              subtitle={`${data.realized.length} 筆 · 金額以 ${currency} 計價，另列原幣`}
            />
            {data.realized.length === 0 ? (
              <EmptyState title="此期間沒有賣出" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="px-5 py-2.5 font-medium">日期</th>
                      <th className="px-3 py-2.5 font-medium">帳戶</th>
                      <th className="px-3 py-2.5 font-medium">標的</th>
                      <th className="px-3 py-2.5 text-right font-medium">數量</th>
                      <th className="px-3 py-2.5 text-right font-medium">成交價</th>
                      <th className="px-3 py-2.5 text-right font-medium">價金</th>
                      <th className="px-3 py-2.5 text-right font-medium">成本</th>
                      <th className="px-3 py-2.5 text-right font-medium">手續費</th>
                      <th className="px-3 py-2.5 text-right font-medium">稅費</th>
                      <th className="px-3 py-2.5 text-right font-medium">已實現（原幣）</th>
                      <th className="px-5 py-2.5 text-right font-medium">已實現（{currency}）</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.realized.map((row) => (
                      <tr key={row.transaction_id} className="hover:bg-slate-50/60">
                        <td className="tabular px-5 py-3 text-slate-600">{fmtDate(row.trade_date)}</td>
                        <td className="px-3 py-3 text-slate-600">{row.account_name ?? "—"}</td>
                        <td className="px-3 py-3">
                          <span className="font-medium text-slate-700">{row.symbol}</span>
                          <span className="ml-1.5 text-xs text-slate-400">{row.name}</span>
                        </td>
                        <td className="tabular px-3 py-3 text-right text-slate-600">
                          {fmtQty(row.quantity)}
                        </td>
                        <td className="tabular px-3 py-3 text-right text-slate-600">
                          {fmtPrice(row.price)}
                        </td>
                        <td className="tabular px-3 py-3 text-right text-slate-600">
                          {fmtMoney(row.proceeds, row.currency, 2)}
                        </td>
                        <td className="tabular px-3 py-3 text-right text-slate-600">
                          {fmtMoney(row.cost_basis, row.currency, 2)}
                        </td>
                        <td className="tabular px-3 py-3 text-right text-slate-600">
                          {row.fee ? fmtMoney(row.fee, row.currency, 2) : "—"}
                        </td>
                        <td className="tabular px-3 py-3 text-right text-slate-600">
                          {row.tax ? fmtMoney(row.tax, row.currency, 2) : "—"}
                        </td>
                        <td
                          className={cn(
                            "tabular px-3 py-3 text-right",
                            pnlClass(row.realized_pnl),
                          )}
                        >
                          {fmtMoney(row.realized_pnl, row.currency, 2)}
                        </td>
                        <td
                          className={cn(
                            "tabular px-5 py-3 text-right font-semibold",
                            pnlClass(row.realized_pnl_base),
                          )}
                        >
                          {fmtMoney(row.realized_pnl_base, currency, 2)}
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
              title="股息 / 利息明細"
              subtitle={`${data.income.length} 筆 · 稅前、費稅、稅後`}
            />
            {data.income.length === 0 ? (
              <EmptyState title="此期間沒有股息或利息" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="px-5 py-2.5 font-medium">日期</th>
                      <th className="px-3 py-2.5 font-medium">類型</th>
                      <th className="px-3 py-2.5 font-medium">帳戶</th>
                      <th className="px-3 py-2.5 font-medium">標的</th>
                      <th className="px-3 py-2.5 text-right font-medium">稅前</th>
                      <th className="px-3 py-2.5 text-right font-medium">手續費</th>
                      <th className="px-3 py-2.5 text-right font-medium">稅費</th>
                      <th className="px-3 py-2.5 text-right font-medium">稅後（原幣）</th>
                      <th className="px-5 py-2.5 text-right font-medium">稅後（{currency}）</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.income.map((row) => (
                      <tr key={row.transaction_id} className="hover:bg-slate-50/60">
                        <td className="tabular px-5 py-3 text-slate-600">{fmtDate(row.trade_date)}</td>
                        <td className="px-3 py-3">
                          <Badge tone="income">{row.type === "dividend" ? "股利" : "利息"}</Badge>
                        </td>
                        <td className="px-3 py-3 text-slate-600">{row.account_name ?? "—"}</td>
                        <td className="px-3 py-3">
                          <span className="font-medium text-slate-700">{row.symbol}</span>
                          <span className="ml-1.5 text-xs text-slate-400">{row.name}</span>
                        </td>
                        <td className="tabular px-3 py-3 text-right text-slate-600">
                          {fmtMoney(row.gross, row.currency, 2)}
                        </td>
                        <td className="tabular px-3 py-3 text-right text-slate-600">
                          {row.fee ? fmtMoney(row.fee, row.currency, 2) : "—"}
                        </td>
                        <td className="tabular px-3 py-3 text-right text-slate-600">
                          {row.tax ? fmtMoney(row.tax, row.currency, 2) : "—"}
                        </td>
                        <td className="tabular px-3 py-3 text-right font-medium text-slate-700">
                          {fmtMoney(row.net, row.currency, 2)}
                        </td>
                        <td className="tabular px-5 py-3 text-right font-semibold text-slate-800">
                          {fmtMoney(row.net_base, currency, 2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
