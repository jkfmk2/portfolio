import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  Coins,
  Landmark,
  PiggyBank,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from "recharts";
import { useSummary } from "../lib/hooks";
import { fmtDate, fmtMoney, fmtNumber, fmtPct, fmtPrice, fmtQty, pnlClass } from "../lib/format";
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

const PIE_COLORS = ["#4f46e5", "#0ea5e9", "#f59e0b", "#10b981", "#f43f5e", "#8b5cf6"];

function Stat({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  icon: ReactNode;
  accent?: boolean;
}) {
  return (
    <Card className={cn("p-5", accent && "bg-slate-900 text-white ring-1 ring-slate-900")}>
      <div className="flex items-start justify-between gap-3">
        <p className={cn("text-xs font-medium", accent ? "text-slate-300" : "text-slate-500")}>
          {label}
        </p>
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            accent ? "bg-white/10 text-white" : "bg-slate-100 text-slate-500",
          )}
        >
          {icon}
        </span>
      </div>
      <p
        className={cn(
          "tabular mt-3 text-2xl font-bold tracking-tight",
          accent ? "text-white" : "text-slate-900",
        )}
      >
        {value}
      </p>
      {sub ? (
        <div className={cn("mt-1.5 text-xs", accent ? "text-slate-300" : "text-slate-500")}>
          {sub}
        </div>
      ) : null}
    </Card>
  );
}

export default function Dashboard() {
  const { data, isLoading, error } = useSummary();

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBanner message={String(error ?? "無法載入資料")} />;

  const s = data;
  const currency = s.base_currency;
  const positive = s.unrealized_pnl >= 0;

  return (
    <div>
      <PageHeader
        title="資產總覽"
        description={`截至 ${fmtDate(s.as_of)} · 共 ${s.holdings_count} 檔持倉、${s.accounts_count} 個帳戶`}
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
        <Stat
          label="總資產"
          value={fmtMoney(s.total_value, currency)}
          sub={`${currency} 計價`}
          icon={<PiggyBank size={16} />}
          accent
        />
        <Stat
          label="投資部位"
          value={fmtMoney(s.securities_value, currency)}
          sub={`成本 ${fmtMoney(s.cost_basis, currency)}`}
          icon={<TrendingUp size={16} />}
        />
        <Stat
          label="現金"
          value={fmtMoney(s.cash_value, currency)}
          sub={`${s.cash_positions.length} 個現金部位`}
          icon={<Coins size={16} />}
        />
        <Stat
          label="未實現損益"
          value={`${positive ? "+" : "-"}${fmtMoney(Math.abs(s.unrealized_pnl), currency)}`}
          sub={
            <span
              className={cn(
                "inline-flex items-center gap-1 font-medium",
                positive ? "text-emerald-600" : "text-rose-600",
              )}
            >
              {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {fmtPct(s.unrealized_pnl_pct)}
            </span>
          }
          icon={<Landmark size={16} />}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="資產配置" subtitle="依標的類型" />
          <div className="grid items-center gap-2 p-4 sm:grid-cols-2">
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={s.allocation_by_type}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={62}
                    outerRadius={92}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {s.allocation_by_type.map((slice, index) => (
                      <Cell key={slice.key} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => fmtMoney(Number(value), currency)}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid #e2e8f0",
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-3">
              {s.allocation_by_type.map((slice, index) => (
                <li key={slice.key}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: PIE_COLORS[index % PIE_COLORS.length] }}
                      />
                      {slice.label}
                    </span>
                    <span className="tabular font-medium text-slate-800">
                      {fmtNumber(slice.pct, 1)}%
                    </span>
                  </div>
                  <p className="tabular mt-0.5 pl-[18px] text-xs text-slate-400">
                    {fmtMoney(slice.value, currency)}
                  </p>
                </li>
              ))}
              {s.allocation_by_type.length === 0 ? (
                <li className="text-sm text-slate-400">尚無資料</li>
              ) : null}
            </ul>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="幣別曝險" subtitle="依幣別換算基準幣別" />
          <div className="h-44 px-2 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={s.allocation_by_currency}
                layout="vertical"
                margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="key"
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  tick={{ fontSize: 12, fill: "#64748b" }}
                />
                <Tooltip
                  formatter={(value) => fmtMoney(Number(value), currency)}
                  contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} fill="#0ea5e9" barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="border-t border-slate-100 px-5 py-4">
            <p className="text-xs font-medium text-slate-500">已實現 / 收益</p>
            <div className="mt-2 flex gap-6">
              <div>
                <p className="text-[11px] text-slate-400">已實現損益</p>
                <p className={cn("tabular text-sm font-semibold", pnlClass(s.realized_pnl))}>
                  {fmtMoney(s.realized_pnl, currency)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400">股息 / 利息</p>
                <p className="tabular text-sm font-semibold text-slate-800">
                  {fmtMoney(s.income, currency)}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="持倉明細"
          subtitle={`${s.holdings.length} 檔`}
          action={
            <span className="rounded-lg bg-slate-50 px-2 py-1 text-[11px] text-slate-500">
              市值以 {currency} 計價
            </span>
          }
        />
        {s.holdings.length === 0 ? (
          <EmptyState title="尚無持倉" description="新增一筆買入交易後，這裡會自動出現持倉。" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
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
                      <p className="mt-0.5 text-xs text-slate-400">
                        {h.name || "—"} ·{" "}
                        <Link
                          to={`/accounts/${h.account_id}`}
                          className="hover:text-slate-700 hover:underline"
                        >
                          {h.account_name}
                        </Link>
                      </p>
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
                      {h.price_source === "cost" ? (
                        <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] text-amber-600">
                          成本
                        </span>
                      ) : null}
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
          <EmptyState title="尚無現金餘額" description="存入現金或記錄股息後會顯示在這裡。" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-2.5 font-medium">帳戶</th>
                  <th className="px-3 py-2.5 font-medium">幣別</th>
                  <th className="px-3 py-2.5 text-right font-medium">金額</th>
                  <th className="px-3 py-2.5 text-right font-medium">換算</th>
                  <th className="px-5 py-2.5 text-right font-medium">比重</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {s.cash_positions.map((p, index) => (
                  <tr key={`${p.account_id}-${p.currency}-${index}`} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-medium text-slate-700">
                      <Link
                        to={`/accounts/${p.account_id}`}
                        className="hover:text-slate-900 hover:underline"
                      >
                        {p.account_name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-slate-500">{p.currency}</td>
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
    </div>
  );
}
