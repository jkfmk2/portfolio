import { useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";
import { useAccounts } from "../lib/hooks";
import type { Preset } from "../lib/report-range";
import { BUILT_IN_PRESETS, presetRange } from "../lib/report-range";
import { fmtDate } from "../lib/format";
import { Button, Card, Input, PageHeader, Select, cn } from "../components/ui";
import IncomeReportView from "../components/reports/IncomeReportView";
import IrrReportView from "../components/reports/IrrReportView";

type ReportTab = "income" | "irr";

const TABS: { value: ReportTab; label: string }[] = [
  { value: "income", label: "收益報表" },
  { value: "irr", label: "IRR 報表" },
];

export default function Reports() {
  const [tab, setTab] = useState<ReportTab>("income");
  const [preset, setPreset] = useState<Preset>("thisYear");
  const [customFrom, setCustomFrom] = useState(() => presetRange("thisYear").from);
  const [customTo, setCustomTo] = useState(() => presetRange("thisYear").to);
  const [accountId, setAccountId] = useState("");

  const { data: accounts } = useAccounts();

  const range = useMemo(
    () => presetRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const accountLabel = accountId
    ? (accounts?.find((account) => String(account.id) === accountId)?.name ?? "帳戶")
    : "所有帳戶";

  return (
    <div>
      <PageHeader
        title="報表"
        description="收益明細與總資產年化報酬率（IRR）"
      />

      <div className="mb-4 inline-flex rounded-xl bg-white p-1 ring-1 ring-slate-200">
        {TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setTab(item.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition",
              tab === item.value
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-800",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {BUILT_IN_PRESETS.map((item) => (
            <Button
              key={item.value}
              size="sm"
              variant={preset === item.value ? "primary" : "secondary"}
              onClick={() => setPreset(item.value)}
            >
              {item.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant={preset === "custom" ? "primary" : "secondary"}
            onClick={() => setPreset("custom")}
          >
            <CalendarRange size={14} /> 自訂
          </Button>
          {tab === "income" ? (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Select
                className="w-auto min-w-40"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">所有帳戶</option>
                {accounts?.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
        </div>

        {preset === "custom" ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">期間</span>
            <Input
              type="date"
              className="w-auto"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
            <span className="text-xs text-slate-400">～</span>
            <Input
              type="date"
              className="w-auto"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
        ) : null}

        <p className="mt-3 text-xs text-slate-400">
          {fmtDate(range.from)} ～ {fmtDate(range.to)} ·{" "}
          {tab === "irr" ? "所有帳戶・總資產" : accountLabel}
        </p>
      </Card>

      {tab === "income" ? (
        <IncomeReportView
          range={range}
          accountId={accountId ? Number(accountId) : undefined}
        />
      ) : (
        <IrrReportView range={range} />
      )}
    </div>
  );
}
