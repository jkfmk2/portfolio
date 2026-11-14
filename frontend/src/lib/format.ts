const SYMBOLS: Record<string, string> = {
  TWD: "NT$",
  USD: "$",
  EUR: "€",
  JPY: "¥",
  HKD: "HK$",
  GBP: "£",
};

const nf = (digits: number) =>
  new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export function symbolOf(currency = "TWD"): string {
  return SYMBOLS[currency] ?? `${currency} `;
}

export function fmtMoney(value: number | null | undefined, currency = "TWD", digits = 0): string {
  const n = Number(value ?? 0);
  return `${n < 0 ? "-" : ""}${symbolOf(currency)}${nf(digits).format(Math.abs(n))}`;
}

export function fmtNumber(value: number | null | undefined, digits = 2): string {
  const n = Number(value ?? 0);
  return nf(digits).format(n);
}

export function fmtQty(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 6 }).format(n);
}

export function fmtPct(value: number | null | undefined, digits = 2): string {
  const n = Number(value ?? 0);
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function fmtPrice(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  const digits = Math.abs(n) < 10 ? 4 : 2;
  return nf(digits).format(n);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export function todayISO(): string {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 10);
}

export function pnlClass(value: number): string {
  if (value > 0) return "text-emerald-600";
  if (value < 0) return "text-rose-600";
  return "text-slate-500";
}
