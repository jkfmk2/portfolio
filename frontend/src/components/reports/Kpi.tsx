import type { ReactNode } from "react";
import { Card, cn } from "../ui";

export function Kpi({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  accent?: boolean;
  icon?: ReactNode;
}) {
  return (
    <Card className={cn("p-5", accent && "bg-slate-900 text-white ring-1 ring-slate-900")}>
      <div className="flex items-start justify-between gap-3">
        <p className={cn("text-xs font-medium", accent ? "text-slate-300" : "text-slate-500")}>
          {label}
        </p>
        {icon ? (
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg",
              accent ? "bg-white/10 text-white" : "bg-slate-100 text-slate-500",
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "tabular mt-3 text-2xl font-bold tracking-tight",
          accent ? "text-white" : "text-slate-900",
        )}
      >
        {value}
      </p>
      {sub ? (
        <div className={cn("mt-1.5 text-xs", accent ? "text-slate-300" : "text-slate-500")}>
          {sub}
        </div>
      ) : null}
    </Card>
  );
}
