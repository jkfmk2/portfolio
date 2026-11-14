import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTransaction, type Account, type Instrument, type Meta } from "../lib/api";
import { todayISO } from "../lib/format";
import { Button, Field, Input, Select, Textarea } from "./ui";

const NEEDS_INSTRUMENT = new Set(["buy", "sell", "split", "dividend", "interest"]);
const NEEDS_UNITS = new Set(["buy", "sell", "split"]);
const NEEDS_AMOUNT = new Set(["deposit", "withdraw", "transfer_in", "transfer_out", "fee", "tax"]);

export default function TransactionForm({
  accounts,
  instruments,
  meta,
  onDone,
  onCancel,
}: {
  accounts: Account[];
  instruments: Instrument[];
  meta: Meta;
  onDone: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [type, setType] = useState("buy");
  const [accountId, setAccountId] = useState(String(accounts[0]?.id ?? ""));
  const [instrumentId, setInstrumentId] = useState("");
  const [tradeDate, setTradeDate] = useState(todayISO());
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("");
  const [tax, setTax] = useState("");
  const [currency, setCurrency] = useState("TWD");
  const [note, setNote] = useState("");

  const account = useMemo(
    () => accounts.find((a) => String(a.id) === accountId),
    [accounts, accountId],
  );
  const instrument = useMemo(
    () => instruments.find((i) => String(i.id) === instrumentId),
    [instruments, instrumentId],
  );

  const showInstrument = NEEDS_INSTRUMENT.has(type);
  const showUnits = NEEDS_UNITS.has(type);
  const showAmount = NEEDS_AMOUNT.has(type);

  useEffect(() => {
    if (showInstrument && instrument) setCurrency(instrument.currency);
    else if (account) setCurrency(account.currency);
  }, [instrument, account, showInstrument]);

  const mutation = useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      onDone();
    },
  });

  const submit = () => {
    const payload: Record<string, unknown> = {
      account_id: Number(accountId),
      instrument_id: showInstrument && instrumentId ? Number(instrumentId) : null,
      type,
      trade_date: tradeDate,
      quantity: showUnits ? Number(quantity || 0) : 0,
      price: showUnits ? Number(price || 0) : 0,
      fee: Number(fee || 0),
      tax: Number(tax || 0),
      currency,
      note: note || null,
    };
    if (showAmount) payload.gross_amount = Number(amount || 0);
    mutation.mutate(payload);
  };

  const computedGross =
    showUnits && quantity && price ? Number(quantity) * Number(price) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="交易類型">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {meta.transaction_types.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="帳戶">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}（{a.currency}）
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="日期">
          <Input type="date" value={tradeDate} onChange={(e) => setTradeDate(e.target.value)} />
        </Field>
        <Field label="幣別">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {Array.from(new Set([...meta.currencies, currency])).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {showInstrument ? (
        <Field label="標的" hint="股票、ETF、債券皆可，留空則建立無標的的現金收益">
          <Select value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)}>
            <option value="">— 選擇標的 —</option>
            {instruments.map((i) => (
              <option key={i.id} value={i.id}>
                {i.symbol} · {i.name}（{i.currency}）
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {showUnits ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label={type === "split" ? "新增股數" : "數量"}>
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              placeholder="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </Field>
          <Field label={type === "split" ? "分割比例價格（通常 0）" : "成交單價"}>
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              placeholder="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
        </div>
      ) : null}

      {showAmount ? (
        <Field label="金額">
          <Input
            type="number"
            inputMode="decimal"
            step="any"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
      ) : null}

      {showUnits ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="手續費">
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              placeholder="0"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
            />
          </Field>
          <Field label="稅費">
            <Input
              type="number"
              inputMode="decimal"
              step="any"
              placeholder="0"
              value={tax}
              onChange={(e) => setTax(e.target.value)}
            />
          </Field>
        </div>
      ) : null}

      {computedGross !== null ? (
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
          成交金額（未含費用）
          <span className="tabular float-right font-semibold text-slate-800">
            {currency} {computedGross.toLocaleString()}
          </span>
        </div>
      ) : null}

      <Field label="備註">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="選填" />
      </Field>

      {mutation.error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">
          {String(mutation.error.message)}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onCancel} type="button">
          取消
        </Button>
        <Button onClick={submit} disabled={mutation.isPending || !accountId}>
          {mutation.isPending ? "儲存中…" : "新增交易"}
        </Button>
      </div>
    </div>
  );
}
