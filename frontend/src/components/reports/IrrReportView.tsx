import { ArrowDownRight, ArrowUpRight, TriangleAlert } from "lucide-react";
import { useIrrReport } from "../../lib/hooks";
import type { IrrBucket, IrrReportParams } from "../../lib/api";
import type { Range } from "../../lib/report-range";
import { fmtDate, fmtMoney, fmtPct, pnlClass } from "../../lib/format";
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

const FLOW_LABELS: Record<string, string> = {
  deposit: "存入",
  withdraw: "提出",
  transfer_in: "轉入",
  transfer_out: "轉出",
};

function irrText(value: number | null): string {
  return value == null ? "—" : fmtPct(value);
}

function irrClass(value: number | null): string {
  return value == null ? "text-slate-400" : pnlClass(value);
}

function BucketTable({
  title,
  subtitle,
  buckets,
  currency,
  periodLabel,
}: {
  title: string;
  subtitle: string;
  buckets: IrrBucket[];
  currency: string;
  periodLabel: string;
}) {
  return (
    <Card className="mt-4">
      <CardHeader title={title} subtitle={subtitle} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-5 py-2.5 font-medium">{periodLabel}</th>
              <th className="px-3 py-2.5 font-medium">期間</th>
              <th className="px-3 py-2.5 text-right font-medium">天數</th>
              <th className="px-3 py-2.5 text-right font-medium">期初</th>
              <th className="px-3 py-2.5 text-right font-medium">期末</th>
              <th className="px-3 py-2.5 text-right font-medium">淨投入</th>
              <th className="px-3 py-2.5 text-right font-medium">損益</th>
              <th className="px-5 py-2.5 text-right font-medium">年化 IRR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {buckets.map((bucket) => (
              <tr key={bucket.period} className="hover:bg-slate-50/60">
                <td className="tabular px-5 py-3 text-slate-600">
                  {bucket.period}
                  {bucket.partial ? (
                    <span className="ml-1.5 text-[11px] text-slate-400">部分</span>
                  ) : null}
                </td>
                <td className="tabular px-3 py-3 text-xs text-slate-400">
                  {fmtDate(bucket.from)} ～ {fmtDate(bucket.to)}
                </td>
                <td className="tabular px-3 py-3 text-right text-slate-500">{bucket.days}</td>
                <td className="tabular px-3 py-3 text-right text-slate-600">
                  {fmtMoney(bucket.start_value, currency)}
                </td>
                <td className="tabular px-3 py-3 text-right text-slate-600">
                  {fmtMoney(bucket.end_value, currency)}
                </td>
                <td className="tabular px-3 py-3 text-right text-slate-600">
                  {bucket.net_flow ? fmtMoney(bucket.net_flow, currency) : "—"}
                </td>
                <td className={cn("tabular px-3 py-3 text-right", pnlClass(bucket.gain))}>
                  {fmtMoney(bucket.gain, currency)}
                </td>
                <td
                  className={cn(
                    "tabular px-5 py-3 text-right font-semibold",
                    irrClass(bucket.irr_pct),
                  )}
                >
                  {irrText(bucket.irr_pct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function IrrReportView({ range }: { range: Range }) {
  const params: IrrReportParams = { from: range.from, to: range.to };
  const { data, isLoading, error } = useIrrReport(params);

  if (error) return <ErrorBanner message={String(error.message)} />;
  if (isLoading || !data) return <Loading />;

  const currency = data.base_currency;
  const { summary, since_inception: inception } = data;
  const noData =
    data.flows.length === 0 && summary.start_value === 0 && summary.end_value === 0;

  const periodSub = summary.irr_pct == null
    ? summary.days === 0
      ? "期間至少需要一天"
      : "現金流不足，無法計算"
    : `${summary.days} 天 · 淨投入 ${fmtMoney(summary.net_flow, currency)}`;

  const inceptionSub = inception.from
    ? `自 ${fmtDate(inception.from)} 起 · ${inception.days ?? 0} 天`
    : "尚無投入紀錄（需有存入或轉入）";

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

      {noData ? (
        <Card>
          <EmptyState
            title="此期間尚無總資產資料"
            description="先到交易頁記錄存入、買賣或股息，再回來看 IRR。"
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Kpi
              label="期間年化 IRR"
              value={irrText(summary.irr_pct)}
              sub={periodSub}
              accent
              icon={
                summary.irr_pct == null ? undefined : summary.irr_pct >= 0 ? (
                  <ArrowUpRight size={16} />
                ) : (
                  <ArrowDownRight size={16} />
                )
              }
            />
            <Kpi
              label="自首次投入年化 IRR"
              value={irrText(inception.irr_pct)}
              sub={inceptionSub}
              icon={
                inception.irr_pct == null ? undefined : inception.irr_pct >= 0 ? (
                  <ArrowUpRight size={16} />
                ) : (
                  <ArrowDownRight size={16} />
                )
              }
            />
            <Kpi
              label="期初總資產"
              value={fmtMoney(summary.start_value, currency)}
              sub={`${fmtDate(range.from)} 前一日估值`}
            />
            <Kpi
              label="期末總資產"
              value={fmtMoney(summary.end_value, currency)}
              sub={`${fmtDate(range.to)} 估值`}
            />
            <Kpi
              label="淨投入"
              value={fmtMoney(summary.net_flow, currency)}
              sub={`投入 ${fmtMoney(summary.contributed, currency)} · 提出 ${fmtMoney(
                summary.withdrawn,
                currency,
              )}`}
            />
            <Kpi
              label="期間損益"
              value={fmtMoney(summary.gain, currency)}
              sub={
                <span className={pnlClass(summary.gain)}>期末 − 期初 − 淨投入</span>
              }
            />
          </div>

          <p className="mt-3 text-xs text-slate-400">
            IRR 採 XIRR（365 天／年）；外部現金流只含存入、提出、轉入、轉出，期初資產視為期初投入。
          </p>

          <BucketTable
            title="年度 IRR"
            subtitle={`${data.years.length} 個年度 · 年化報酬`}
            buckets={data.years}
            currency={currency}
            periodLabel="年度"
          />

          <BucketTable
            title="每月 IRR"
            subtitle={`${data.months.length} 個月 · 年化報酬`}
            buckets={data.months}
            currency={currency}
            periodLabel="月份"
          />

          <Card className="mt-4">
            <CardHeader
              title="期間現金流"
              subtitle={`${data.flows.length} 筆外部現金流 · 投入為負向、提出為正向`}
            />
            {data.flows.length === 0 ? (
              <EmptyState title="此期間沒有外部現金流" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="px-5 py-2.5 font-medium">日期</th>
                      <th className="px-3 py-2.5 font-medium">類型</th>
                      <th className="px-3 py-2.5 font-medium">帳戶</th>
                      <th className="px-3 py-2.5 font-medium">方向</th>
                      <th className="px-3 py-2.5 text-right font-medium">原幣</th>
                      <th className="px-5 py-2.5 text-right font-medium">基準幣</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.flows.map((row) => (
                      <tr key={row.transaction_id} className="hover:bg-slate-50/60">
                        <td className="tabular px-5 py-3 text-slate-600">
                          {fmtDate(row.trade_date)}
                        </td>
                        <td className="px-3 py-3">
                          <Badge tone={row.type.startsWith("transfer") ? "move" : "income"}>
                            {FLOW_LABELS[row.type] ?? row.type}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-slate-600">{row.account_name ?? "—"}</td>
                        <td className="px-3 py-3">
                          <Badge tone={row.direction === "in" ? "buy" : "sell"}>
                            {row.direction === "in" ? "投入" : "提出"}
                          </Badge>
                        </td>
                        <td className="tabular px-3 py-3 text-right text-slate-600">
                          {fmtMoney(row.amount, row.currency, 2)}
                        </td>
                        <td className="tabular px-5 py-3 text-right font-semibold text-slate-800">
                          {fmtMoney(row.amount_base, currency, 2)}
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
