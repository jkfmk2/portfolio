import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import {
  deleteFxRate,
  deletePrice,
  upsertFxRate,
  upsertPrice,
} from "../lib/api";
import { useFxRates, useInstruments, useMeta, usePrices, useSummary } from "../lib/hooks";
import { fmtDate, fmtNumber, fmtPrice, todayISO } from "../lib/format";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Loading,
  PageHeader,
  Select,
} from "../components/ui";

export default function SettingsPage() {
  const { data: meta } = useMeta();
  const { data: instruments } = useInstruments();
  const { data: fxRates, isLoading: fxLoading } = useFxRates();
  const { data: prices, isLoading: pricesLoading } = usePrices();
  const { data: summary } = useSummary();
  const queryClient = useQueryClient();

  const [base, setBase] = useState("USD");
  const [quote, setQuote] = useState("TWD");
  const [fxDate, setFxDate] = useState(todayISO());
  const [fxRate, setFxRate] = useState("");

  const [priceInstrument, setPriceInstrument] = useState("");
  const [priceDate, setPriceDate] = useState(todayISO());
  const [priceValue, setPriceValue] = useState("");

  const symbolOf = useMemo(() => {
    const map = new Map<number, string>();
    instruments?.forEach((i) => map.set(i.id, i.symbol));
    return map;
  }, [instruments]);

  const fxMutation = useMutation({
    mutationFn: upsertFxRate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fx-rates"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      setFxRate("");
    },
  });

  const priceMutation = useMutation({
    mutationFn: upsertPrice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prices"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      setPriceValue("");
    },
  });

  const removeFx = useMutation({
    mutationFn: deleteFxRate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fx-rates"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
  });

  const removePrice = useMutation({
    mutationFn: deletePrice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prices"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
  });

  return (
    <div>
      <PageHeader
        title="設定"
        description="匯率與價格目前以手動維護，之後可接 TWSE / Yahoo Finance 自動更新"
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">基準幣別</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {meta?.base_currency ?? "TWD"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            所有總資產與配置皆換算為此幣別
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">總資產</p>
          <p className="tabular mt-1 text-2xl font-bold text-slate-900">
            {summary ? `${summary.base_currency} ${fmtNumber(summary.total_value, 0)}` : "—"}
          </p>
          <p className="mt-1 text-xs text-slate-400">依目前最新價格與匯率估算</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">資料筆數</p>
          <div className="mt-2 flex gap-5 text-sm">
            <div>
              <p className="tabular text-lg font-semibold text-slate-900">
                {instruments?.length ?? 0}
              </p>
              <p className="text-[11px] text-slate-400">標的</p>
            </div>
            <div>
              <p className="tabular text-lg font-semibold text-slate-900">{prices?.length ?? 0}</p>
              <p className="text-[11px] text-slate-400">價格</p>
            </div>
            <div>
              <p className="tabular text-lg font-semibold text-slate-900">{fxRates?.length ?? 0}</p>
              <p className="text-[11px] text-slate-400">匯率</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="匯率" subtitle="1 單位基準幣別 = ? 報價幣別" />
          <div className="grid grid-cols-2 gap-3 border-b border-slate-100 px-5 py-4 sm:grid-cols-5">
            <Field label="基準">
              <Select value={base} onChange={(e) => setBase(e.target.value)}>
                {meta?.currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="報價">
              <Select value={quote} onChange={(e) => setQuote(e.target.value)}>
                {meta?.currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="日期">
              <Input type="date" value={fxDate} onChange={(e) => setFxDate(e.target.value)} />
            </Field>
            <Field label="匯率">
              <Input
                type="number"
                step="any"
                placeholder="31.5"
                value={fxRate}
                onChange={(e) => setFxRate(e.target.value)}
              />
            </Field>
            <div className="flex items-end">
              <Button
                className="w-full"
                size="md"
                onClick={() =>
                  fxMutation.mutate({
                    base_currency: base,
                    quote_currency: quote,
                    date: fxDate,
                    rate: Number(fxRate),
                  })
                }
                disabled={!fxRate || base === quote || fxMutation.isPending}
              >
                <Plus size={15} /> 儲存
              </Button>
            </div>
          </div>
          {fxMutation.error ? (
            <p className="px-5 pt-3 text-xs text-rose-600">{String(fxMutation.error.message)}</p>
          ) : null}
          {fxLoading ? (
            <Loading />
          ) : !fxRates || fxRates.length === 0 ? (
            <EmptyState title="尚無匯率" description="新增 USD → TWD 匯率以正確換算美股部位。" />
          ) : (
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-2 font-medium">日期</th>
                    <th className="px-3 py-2 font-medium">幣別對</th>
                    <th className="px-3 py-2 text-right font-medium">匯率</th>
                    <th className="px-5 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {fxRates.map((r) => (
                    <tr key={r.id}>
                      <td className="tabular px-5 py-2.5 text-slate-600">{fmtDate(r.date)}</td>
                      <td className="px-3 py-2.5">
                        <Badge tone="neutral">
                          {r.base_currency} → {r.quote_currency}
                        </Badge>
                      </td>
                      <td className="tabular px-3 py-2.5 text-right font-medium text-slate-800">
                        {fmtNumber(r.rate, 4)}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <button
                          onClick={() => removeFx.mutate(r.id)}
                          className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                          aria-label="刪除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="價格" subtitle="手動輸入收盤價，同日期會覆蓋" />
          <div className="grid grid-cols-2 gap-3 border-b border-slate-100 px-5 py-4 sm:grid-cols-4">
            <Field label="標的" className="col-span-2 sm:col-span-1">
              <Select
                value={priceInstrument}
                onChange={(e) => setPriceInstrument(e.target.value)}
              >
                <option value="">選擇</option>
                {instruments?.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.symbol}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="日期">
              <Input type="date" value={priceDate} onChange={(e) => setPriceDate(e.target.value)} />
            </Field>
            <Field label="收盤價">
              <Input
                type="number"
                step="any"
                placeholder="950"
                value={priceValue}
                onChange={(e) => setPriceValue(e.target.value)}
              />
            </Field>
            <div className="flex items-end">
              <Button
                className="w-full"
                onClick={() =>
                  priceMutation.mutate({
                    instrument_id: Number(priceInstrument),
                    date: priceDate,
                    close: Number(priceValue),
                  })
                }
                disabled={!priceInstrument || !priceValue || priceMutation.isPending}
              >
                <Plus size={15} /> 儲存
              </Button>
            </div>
          </div>
          {priceMutation.error ? (
            <p className="px-5 pt-3 text-xs text-rose-600">
              {String(priceMutation.error.message)}
            </p>
          ) : null}
          {pricesLoading ? (
            <Loading />
          ) : !prices || prices.length === 0 ? (
            <EmptyState title="尚無價格" description="沒有價格的標的會暫以平均成本估值。" />
          ) : (
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-2 font-medium">日期</th>
                    <th className="px-3 py-2 font-medium">標的</th>
                    <th className="px-3 py-2 text-right font-medium">收盤價</th>
                    <th className="px-5 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {prices.slice(0, 100).map((p) => (
                    <tr key={p.id}>
                      <td className="tabular px-5 py-2.5 text-slate-600">{fmtDate(p.date)}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-700">
                        {symbolOf.get(p.instrument_id) ?? p.instrument_id}
                      </td>
                      <td className="tabular px-3 py-2.5 text-right font-medium text-slate-800">
                        {fmtPrice(p.close)}
                        <span className="ml-1 text-[10px] text-slate-400">{p.currency}</span>
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <button
                          onClick={() => removePrice.mutate(p.id)}
                          className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                          aria-label="刪除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
