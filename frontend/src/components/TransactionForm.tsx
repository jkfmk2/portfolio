import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createTransaction,
  updateTransaction,
  type Account,
  type Instrument,
  type Meta,
  type Transaction,
  type TxnType,
} from "../lib/api";
import { fmtMoney, todayISO } from "../lib/format";
import { Button, Field, Input, Select, Textarea } from "./ui";

const NEEDS_INSTRUMENT = new Set(["buy", "sell", "split", "dividend", "interest"]);
const NEEDS_UNITS = new Set(["buy", "sell", "split"]);
const NEEDS_AMOUNT = new Set(["deposit", "withdraw", "transfer_in", "transfer_out", "fee", "tax"]);
const USES_FUNDING = new Set(["buy", "sell", "dividend", "interest"]);

export default function TransactionForm({
  accounts,
  instruments,
  meta,
  initial,
  onDone,
  onCancel,
}: {
  accounts: Account[];
  instruments: Instrument[];
  meta: Meta;
  initial?: Transaction;
  onDone: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<TxnType>(initial?.type ?? "buy");
  const [accountId, setAccountId] = useState(
    String(initial?.account_id ?? accounts[0]?.id ?? ""),
  );
  const [cashAccountId, setCashAccountId] = useState(
    initial?.cash_account_id ? String(initial.cash_account_id) : "",
  );
  const [instrumentId, setInstrumentId] = useState(
    initial?.instrument_id ? String(initial.instrument_id) : "",
  );
  const [tradeDate, setTradeDate] = useState(initial?.trade_date?.slice(0, 10) ?? todayISO());
  const [quantity, setQuantity] = useState(initial?.quantity ? String(initial.quantity) : "");
  const [price, setPrice] = useState(initial?.price ? String(initial.price) : "");
  const [amount, setAmount] = useState(
    initial && NEEDS_AMOUNT.has(initial.type) && initial.gross_amount
      ? String(initial.gross_amount)
      : "",
  );
  const [fee, setFee] = useState(initial?.fee ? String(initial.fee) : "");
  const [tax, setTax] = useState(initial?.tax ? String(initial.tax) : "");
  const [currency, setCurrency] = useState(initial?.currency ?? "TWD");
  const [note, setNote] = useState(initial?.note ?? "");

  const account = useMemo(
    () => accounts.find((a) => String(a.id) === accountId),
    [accounts, accountId],
  );
  const cashAccount = useMemo(
    () => accounts.find((a) => String(a.id) === cashAccountId),
    [accounts, cashAccountId],
  );
  const instrument = useMemo(
    () => instruments.find((i) => String(i.id) === instrumentId),
    [instruments, instrumentId],
  );

  const showInstrument = NEEDS_INSTRUMENT.has(type);
  const showUnits = NEEDS_UNITS.has(type);
  const showAmount = NEEDS_AMOUNT.has(type);
  const showFunding = USES_FUNDING.has(type);
  const showFees = type !== "split";

  useEffect(() => {
    if (showInstrument && instrument) setCurrency(instrument.currency);
    else if (account) setCurrency(account.currency);
  }, [instrument, account, showInstrument]);

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      initial ? updateTransaction(initial.id, body) : createTransaction(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["report"] });
      onDone();
    },
  });

  const submit = () => {
    const payload: Record<string, unknown> = {
      account_id: Number(accountId),
      cash_account_id: showFunding && cashAccountId ? Number(cashAccountId) : null,
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
    // Leaving gross_amount out for trades lets the API recompute it from
    // quantity × price (also when editing).
    if (showAmount) payload.gross_amount = Number(amount || 0);
    mutation.mutate(payload);
  };

  const computedGross =
    showAmount
      ? Number(amount || 0)
      : showUnits && quantity && price
        ? Number(quantity) * Number(price)
        : null;

  const net = (() => {
    if (type === "split") return null;
    const gross = computedGross ?? 0;
    const f = Number(fee || 0);
    const t = Number(tax || 0);
    if (type === "buy") return -(gross + f + t);
    if (["sell", "dividend", "interest", "deposit", "transfer_in"].includes(type)) {
      return gross - f - t;
    }
    if (["withdraw", "transfer_out", "fee", "tax"].includes(type)) {
      return -(gross + f + t);
    }
    return null;
  })();

  const currencyMismatch =
    showFunding && cashAccount && cashAccount.currency !== currency ? cashAccount : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="交易類型">
          <Select value={type} onChange={(e) => setType(e.target.value as TxnType)}>
            {meta.transaction_types.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={showFunding ? "證券帳戶" : "帳戶"}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}（{a.currency}）
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {showFunding ? (
        <Field label="資金帳戶" hint="選填；留空表示與證券帳戶相同。">
          <Select value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value)}>
            <option value="">同證券帳戶</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}（{a.currency}）
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {currencyMismatch ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          資金帳戶是 {currencyMismatch.currency}，交易幣別是 {currency}。現金會以交易幣別記在
          資金帳戶，不會自動換匯；需要換匯時請另外記錄轉出／轉入。
        </p>
      ) : null}

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

      {showFees ? (
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

      {computedGross !== null || net !== null ? (
        <div className="space-y-1.5 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
          {computedGross !== null ? (
            <div>
              {showUnits ? "成交金額（未含費用）" : "金額"}
              <span className="tabular float-right font-medium text-slate-700">
                {fmtMoney(computedGross, currency, 2)}
              </span>
            </div>
          ) : null}
          {net !== null ? (
            <div>
              預估淨收付
              <span className="tabular float-right font-semibold text-slate-900">
                {net > 0 ? "+" : ""}
                {fmtMoney(net, currency, 2)}
              </span>
            </div>
          ) : null}
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
          {mutation.isPending ? "儲存中…" : initial ? "儲存修改" : "新增交易"}
        </Button>
      </div>
    </div>
  );
}
