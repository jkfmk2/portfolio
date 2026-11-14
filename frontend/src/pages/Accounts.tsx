import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Wallet } from "lucide-react";
import {
  createAccount,
  deleteAccount,
  type Account,
  type AccountType,
} from "../lib/api";
import { useAccounts, useMeta, useSummary } from "../lib/hooks";
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

const ACCOUNT_TONE: Record<AccountType, string> = {
  broker: "stock",
  bank: "cash",
  cash: "bond",
};

export default function Accounts() {
  const [open, setOpen] = useState(false);
  const { data: accounts, isLoading } = useAccounts();
  const { data: meta } = useMeta();
  const { data: summary } = useSummary();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [broker, setBroker] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("broker");
  const [currency, setCurrency] = useState("TWD");
  const [note, setNote] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
  };

  const create = useMutation({
    mutationFn: createAccount,
    onSuccess: () => {
      invalidate();
      setOpen(false);
      setName("");
      setBroker("");
      setNote("");
    },
  });

  const remove = useMutation({
    mutationFn: deleteAccount,
    onSuccess: invalidate,
    onError: (err: Error) => {
      window.alert(
        err.message === "account_has_transactions"
          ? "此帳戶已有交易紀錄，無法刪除。"
          : `刪除失敗：${err.message}`,
      );
    },
  });

  const balanceFor = (account: Account) =>
    summary?.cash_positions
      .filter((p) => p.account_id === account.id)
      .reduce((sum, p) => sum + p.amount, 0) ?? 0;

  const submit = () => {
    create.mutate({
      name,
      broker: broker || null,
      account_type: accountType,
      currency,
      note: note || null,
    } as Partial<Account>);
  };

  return (
    <div>
      <PageHeader
        title="帳戶"
        description="證券戶、銀行戶與現金錢包，現金餘額由交易推算"
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> 新增帳戶
          </Button>
        }
      />

      <Card>
        {isLoading ? (
          <Loading />
        ) : !accounts || accounts.length === 0 ? (
          <EmptyState
            title="還沒有帳戶"
            description="建立第一個證券或現金帳戶，才能開始記錄交易。"
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus size={16} /> 新增帳戶
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-2.5 font-medium">帳戶</th>
                  <th className="px-3 py-2.5 font-medium">類型</th>
                  <th className="px-3 py-2.5 font-medium">券商 / 銀行</th>
                  <th className="px-3 py-2.5 font-medium">幣別</th>
                  <th className="px-3 py-2.5 text-right font-medium">現金餘額</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {accounts.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                          <Wallet size={15} />
                        </span>
                        <div>
                          <p className="font-medium text-slate-800">{a.name}</p>
                          {a.note ? (
                            <p className="text-[11px] text-slate-400">{a.note}</p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={ACCOUNT_TONE[a.account_type]}>
                        {meta?.account_types.find((t) => t.value === a.account_type)?.label ??
                          a.account_type}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{a.broker || "—"}</td>
                    <td className="px-3 py-3 text-slate-600">{a.currency}</td>
                    <td className="tabular px-3 py-3 text-right font-medium text-slate-800">
                      {fmtMoney(balanceFor(a), a.currency, 2)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => {
                          if (window.confirm(`刪除帳戶「${a.name}」？`)) remove.mutate(a.id);
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
        title="新增帳戶"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={submit} disabled={!name || create.isPending}>
              {create.isPending ? "儲存中…" : "建立帳戶"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="帳戶名稱">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：玉山證券" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="類型">
              <Select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as AccountType)}
              >
                {meta?.account_types.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="幣別">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {meta?.currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="券商 / 銀行">
            <Input value={broker} onChange={(e) => setBroker(e.target.value)} placeholder="選填" />
          </Field>
          <Field label="備註">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="選填" />
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
