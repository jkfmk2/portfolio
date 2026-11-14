import { NavLink, Outlet } from "react-router-dom";
import {
  ArrowLeftRight,
  LayoutDashboard,
  LineChart,
  Settings,
  Wallet,
} from "lucide-react";
import clsx from "clsx";
import { useMeta } from "../lib/hooks";

const NAV = [
  { to: "/", label: "總覽", icon: LayoutDashboard, end: true },
  { to: "/transactions", label: "交易", icon: ArrowLeftRight },
  { to: "/instruments", label: "標的", icon: LineChart },
  { to: "/accounts", label: "帳戶", icon: Wallet },
  { to: "/settings", label: "設定", icon: Settings },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white">
        A
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-slate-900">資產管理</p>
        <p className="text-[11px] text-slate-400">Portfolio Tracker</p>
      </div>
    </div>
  );
}

export default function Layout() {
  const { data: meta } = useMeta();

  return (
    <div className="min-h-screen bg-[#f5f7fb]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200/70 bg-white px-4 py-6 md:flex">
        <Brand />
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  isActive
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
                )
              }
            >
              <Icon size={17} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-500">
          <p className="font-medium text-slate-600">基準幣別</p>
          <p className="mt-0.5 text-base font-semibold text-slate-900">
            {meta?.base_currency ?? "TWD"}
          </p>
        </div>
      </aside>

      <div className="md:pl-60">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200/70 bg-white/85 px-4 py-3 backdrop-blur md:hidden">
          <Brand />
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">
            {meta?.base_currency ?? "TWD"}
          </span>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-5 md:px-8 md:pb-12 md:pt-8">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              clsx(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition",
                isActive ? "text-slate-900" : "text-slate-400",
              )
            }
          >
            <Icon size={19} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
