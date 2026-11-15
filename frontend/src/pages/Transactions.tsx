import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { deleteTransaction, type Transaction } from "../lib/api";
import { useAccounts, useInstruments, useMeta, useTransactions } from "../lib/hooks";
import { fmtDate, fmtMoney, fmtPrice, fmtQty } from "../lib/format";
import TransactionForm from "../components/TransactionForm";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Loading,
  Modal,
  PageHeader,
  Select,
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

export default function Transactions() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [accountId, setAccountId] = useState("");
  const [type, setType] = useState("");

  const { data: accounts } = useAccounts();
  const { data: instruments } = useInstruments();
  const { data: meta } = useMeta();
  const { data, isLoading, error } = useTransactions({
    account_id: accountId ? Number(accountId) : undefined,
    type: type || undefined,
    limit: 300,
  });

  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
    },
  });

  const labels = useMemo(() => {
    const map = new Map<string, string>();
    meta?.transaction_types.forEach((t) => map.set(t.value, t.label));
    return map;
  }, [meta]);

  const onDelete = (txn: Transaction) => {
    if (window.confirm(`刪除這筆交易？\n${txn.trade_date} ${labels.get(txn.type) ?? txn.type} ${txn.instrument_symbol ?? ""}`)) {
      remove.mutate(txn.id);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (txn: Transaction) => {
    setEditing(txn);
    setOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="交易紀錄"
        description="所有持倉與損益都由這裡的流水帳推算"
        action={
          <Button onClick={openCreate} disabled={!accounts?.length || !meta}>
            <Plus size={16} /> 新增交易
          </Button>
        }
      />

      {accounts && accounts.length === 0 ? (
        <Card>
          <EmptyState
            title="先建立一個帳戶"
            description="交易必須歸屬到某個證券或現金帳戶，請先到「帳戶」頁新增。"
          />
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Select
              className="w-auto min-w-36"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">所有帳戶</option>
              {accounts?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Select
              className="w-auto min-w-32"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">所有類型</option>
              {meta?.transaction_types.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
            {data ? (
              <span className="ml-auto self-center text-xs text-slate-400">
                共 {data.total} 筆
              </span>
            ) : null}
          </div>

          <Card>
            {isLoading ? (
              <Loading />
            ) : error ? (
              <div className="p-4">
                <ErrorBanner message={String(error.message)} />
              </div>
            ) : !data || data.items.length === 0 ? (
              <EmptyState
                title="還沒有交易"
                description="點右上角「新增交易」，從第一筆入金或買入開始。"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1120px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="px-5 py-2.5 font-medium">日期</th>
                      <th className="px-3 py-2.5 font-medium">類型</th>
                      <th className="px-3 py-2.5 font-medium">帳戶</th>
                      <th className="px-3 py-2.5 font-medium">標的</th>
                      <th className="px-3 py-2.5 text-right font-medium">數量</th>
                      <th className="px-3 py-2.5 text-right font-medium">單價</th>
                      <th className="px-3 py-2.5 text-right font-medium">成交金額</th>
                      <th className="px-3 py-2.5 text-right font-medium">手續費</th>
                      <th className="px-3 py-2.5 text-right font-medium">稅費</th>
                      <th className="px-3 py-2.5 text-right font-medium">淨額</th>
                      <th className="px-3 py-2.5 font-medium">幣別</th>
                      <th className="sticky right-0 border-l border-slate-100 bg-white px-5 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.items.map((t) => (
                      <tr key={t.id} className="group hover:bg-slate-50/60">
                        <td className="tabular px-5 py-3 text-slate-600">{fmtDate(t.trade_date)}</td>
                        <td className="px-3 py-3">
                          <Badge tone={TONE[t.type] ?? "neutral"}>
                            {labels.get(t.type) ?? t.type}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          <div>{t.account_name}</div>
                          {t.cash_account_id ? (
                            <div className="mt-0.5 text-[11px] text-amber-600">
                              資金：{t.funding_account_name}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          {t.instrument_symbol ? (
                            <>
                              <span className="font-medium text-slate-700">
                                {t.instrument_symbol}
                              </span>
                              <span className="ml-1.5 text-xs text-slate-400">
                                {t.instrument_name}
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="tabular px-3 py-3 text-right text-slate-600">
                          {t.quantity ? fmtQty(t.quantity) : "—"}
                        </td>
                        <td className="tabular px-3 py-3 text-right text-slate-600">
                          {t.price ? fmtPrice(t.price) : "—"}
                        </td>
                        <td className="tabular px-3 py-3 text-right font-medium text-slate-800">
                          {fmtMoney(t.gross_amount, t.currency, 2)}
                        </td>
                        <td className="tabular px-3 py-3 text-right text-slate-600">
                          {t.fee ? fmtMoney(t.fee, t.currency, 2) : "—"}
                        </td>
                        <td className="tabular px-3 py-3 text-right text-slate-600">
                          {t.tax ? fmtMoney(t.tax, t.currency, 2) : "—"}
                        </td>
                        <td className="tabular px-3 py-3 text-right">
                          {t.cash_flow === null ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <span
                              className={
                                t.cash_flow > 0
                                  ? "font-medium text-emerald-600"
                                  : "font-medium text-slate-700"
                              }
                            >
                              {t.cash_flow > 0 ? "+" : ""}
                              {fmtMoney(t.cash_flow, t.currency, 2)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-500">{t.currency}</td>
                        <td className="sticky right-0 border-l border-slate-100 bg-white px-5 py-3 text-right group-hover:bg-slate-50">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => openEdit(t)}
                              className="rounded-lg p-1.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-700"
                              aria-label="編輯"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => onDelete(t)}
                              className={cn(
                                "rounded-lg p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600",
                              )}
                              aria-label="刪除"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
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

      <Modal
        open={open}
        title={editing ? `編輯交易 #${editing.id}` : "新增交易"}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        width="max-w-lg"
      >
        {accounts && instruments && meta ? (
          <TransactionForm
            key={editing?.id ?? "new"}
            accounts={accounts}
            instruments={instruments}
            meta={meta}
            initial={editing ?? undefined}
            onDone={() => {
              setOpen(false);
              setEditing(null);
            }}
            onCancel={() => {
              setOpen(false);
              setEditing(null);
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}
