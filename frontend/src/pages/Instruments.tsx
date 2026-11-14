import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import {
  createInstrument,
  deleteInstrument,
  type AssetType,
  type Instrument,
} from "../lib/api";
import { useInstruments, useMeta, useSummary } from "../lib/hooks";
import { fmtMoney } from "../lib/format";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from "../components/ui";

const EMPTY = {
  symbol: "",
  name: "",
  asset_type: "stock" as AssetType,
  currency: "TWD",
  market: "TW",
  exchange: "",
  face_value: "",
  coupon_rate: "",
  coupon_frequency: "2",
  maturity_date: "",
  issue_date: "",
  isin: "",
  credit_rating: "",
  interest_rate: "",
  note: "",
};

export default function Instruments() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const { data: instruments, isLoading } = useInstruments();
  const { data: meta } = useMeta();
  const { data: summary } = useSummary();
  const queryClient = useQueryClient();

  const set = (key: keyof typeof EMPTY, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const valueByInstrument = useMemo(() => {
    const map = new Map<number, number>();
    summary?.holdings.forEach((h) => {
      map.set(h.instrument_id, (map.get(h.instrument_id) ?? 0) + h.market_value_base);
    });
    return map;
  }, [summary]);

  const create = useMutation({
    mutationFn: createInstrument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instruments"] });
      setOpen(false);
      setForm(EMPTY);
    },
  });

  const remove = useMutation({
    mutationFn: deleteInstrument,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["instruments"] }),
    onError: (err: Error) => {
      window.alert(
        err.message === "instrument_has_transactions"
          ? "此標的已有交易紀錄，無法刪除。"
          : `刪除失敗：${err.message}`,
      );
    },
  });

  const submit = () => {
    const payload: Record<string, unknown> = {
      symbol: form.symbol,
      name: form.name,
      asset_type: form.asset_type,
      currency: form.currency,
      market: form.market,
      exchange: form.exchange || null,
      note: form.note || null,
    };
    if (form.asset_type === "bond") {
      payload.face_value = form.face_value ? Number(form.face_value) : null;
      payload.coupon_rate = form.coupon_rate ? Number(form.coupon_rate) : null;
      payload.coupon_frequency = form.coupon_frequency ? Number(form.coupon_frequency) : null;
      payload.maturity_date = form.maturity_date || null;
      payload.issue_date = form.issue_date || null;
      payload.isin = form.isin || null;
      payload.credit_rating = form.credit_rating || null;
    }
    if (form.asset_type === "cash") {
      payload.interest_rate = form.interest_rate ? Number(form.interest_rate) : null;
    }
    create.mutate(payload as Partial<Instrument>);
  };

  return (
    <div>
      <PageHeader
        title="投資標的"
        description="股票、ETF、債券與現金標的的主檔"
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> 新增標的
          </Button>
        }
      />

      <Card>
        {isLoading ? (
          <Loading />
        ) : !instruments || instruments.length === 0 ? (
          <EmptyState
            title="還沒有標的"
            description="新增股票、ETF 或債券後，就能在交易中選取。"
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus size={16} /> 新增標的
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-2.5 font-medium">標的</th>
                  <th className="px-3 py-2.5 font-medium">類型</th>
                  <th className="px-3 py-2.5 font-medium">市場</th>
                  <th className="px-3 py-2.5 font-medium">幣別</th>
                  <th className="px-3 py-2.5 font-medium">債券 / 現金資訊</th>
                  <th className="px-3 py-2.5 text-right font-medium">持倉市值</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {instruments.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-800">{i.symbol}</p>
                      <p className="text-xs text-slate-400">{i.name || "—"}</p>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={i.asset_type}>
                        {meta?.asset_types.find((t) => t.value === i.asset_type)?.label ??
                          i.asset_type}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{i.market || "—"}</td>
                    <td className="px-3 py-3 text-slate-600">{i.currency}</td>
                    <td className="px-3 py-3 text-xs text-slate-500">
                      {i.asset_type === "bond" ? (
                        <>
                          {i.coupon_rate != null ? `票息 ${i.coupon_rate}%` : "—"}
                          {i.maturity_date ? ` · 到期 ${i.maturity_date}` : ""}
                          {i.face_value != null ? ` · 面額 ${i.face_value}` : ""}
                        </>
                      ) : i.asset_type === "cash" ? (
                        i.interest_rate != null ? `利率 ${i.interest_rate}%` : "—"
                      ) : (
                        i.exchange || "—"
                      )}
                    </td>
                    <td className="tabular px-3 py-3 text-right font-medium text-slate-800">
                      {valueByInstrument.get(i.id)
                        ? fmtMoney(valueByInstrument.get(i.id)!, summary?.base_currency ?? "TWD")
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => {
                          if (window.confirm(`刪除標的「${i.symbol}」？`)) remove.mutate(i.id);
                        }}
                        className="rounded-lg p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
                        aria-label="刪除"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={open}
        title="新增標的"
        width="max-w-2xl"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={submit} disabled={!form.symbol || create.isPending}>
              {create.isPending ? "儲存中…" : "建立標的"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="代號">
              <Input
                value={form.symbol}
                onChange={(e) => set("symbol", e.target.value)}
                placeholder="2330 / VOO / US10Y"
              />
            </Field>
            <Field label="名稱">
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="台積電"
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="類型">
              <Select
                value={form.asset_type}
                onChange={(e) => set("asset_type", e.target.value)}
              >
                {meta?.asset_types.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="市場">
              <Select value={form.market} onChange={(e) => set("market", e.target.value)}>
                {meta?.markets.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="幣別">
              <Select value={form.currency} onChange={(e) => set("currency", e.target.value)}>
                {meta?.currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {form.asset_type === "bond" ? (
            <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
              <p className="mb-3 text-xs font-semibold text-amber-700">債券資訊</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="面額（每單位）">
                  <Input
                    type="number"
                    step="any"
                    value={form.face_value}
                    onChange={(e) => set("face_value", e.target.value)}
                    placeholder="1000"
                  />
                </Field>
                <Field label="票面利率 %">
                  <Input
                    type="number"
                    step="any"
                    value={form.coupon_rate}
                    onChange={(e) => set("coupon_rate", e.target.value)}
                    placeholder="4.5"
                  />
                </Field>
                <Field label="付息頻率（次/年）">
                  <Input
                    type="number"
                    step="1"
                    value={form.coupon_frequency}
                    onChange={(e) => set("coupon_frequency", e.target.value)}
                  />
                </Field>
                <Field label="到期日">
                  <Input
                    type="date"
                    value={form.maturity_date}
                    onChange={(e) => set("maturity_date", e.target.value)}
                  />
                </Field>
                <Field label="發行日">
                  <Input
                    type="date"
                    value={form.issue_date}
                    onChange={(e) => set("issue_date", e.target.value)}
                  />
                </Field>
                <Field label="信用評等">
                  <Input
                    value={form.credit_rating}
                    onChange={(e) => set("credit_rating", e.target.value)}
                    placeholder="AA+"
                  />
                </Field>
                <Field label="ISIN" className="col-span-2">
                  <Input
                    value={form.isin}
                    onChange={(e) => set("isin", e.target.value)}
                    placeholder="選填"
                  />
                </Field>
              </div>
            </div>
          ) : null}

          {form.asset_type === "cash" ? (
            <Field label="利率 %">
              <Input
                type="number"
                step="any"
                value={form.interest_rate}
                onChange={(e) => set("interest_rate", e.target.value)}
                placeholder="例：1.5"
              />
            </Field>
          ) : null}

          <Field label="交易所">
            <Input
              value={form.exchange}
              onChange={(e) => set("exchange", e.target.value)}
              placeholder="TWSE / NASDAQ（選填）"
            />
          </Field>
          <Field label="備註">
            <Textarea value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="選填" />
          </Field>
          {create.error ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">
              {String(create.error.message)}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
