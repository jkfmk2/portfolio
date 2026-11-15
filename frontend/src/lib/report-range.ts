import { todayISO } from "./format";

export type Preset = "thisMonth" | "lastMonth" | "thisYear" | "lastYear" | "custom";

export const BUILT_IN_PRESETS: { value: Preset; label: string }[] = [
  { value: "thisMonth", label: "本月" },
  { value: "lastMonth", label: "上月" },
  { value: "thisYear", label: "今年" },
  { value: "lastYear", label: "去年" },
];

export interface Range {
  from: string;
  to: string;
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Resolve a preset into an inclusive ``[from, to]`` range of ISO dates.
 * ``custom`` echoes the caller's own dates back unchanged.
 */
export function presetRange(
  preset: Preset,
  customFrom?: string,
  customTo?: string,
): Range {
  const today = todayISO();
  const [year, month] = today.split("-").map(Number);

  switch (preset) {
    case "thisMonth":
      return { from: iso(year, month, 1), to: today };
    case "lastMonth": {
      const prevYear = month === 1 ? year - 1 : year;
      const prevMonth = month === 1 ? 12 : month - 1;
      return {
        from: iso(prevYear, prevMonth, 1),
        to: iso(prevYear, prevMonth, lastDayOfMonth(prevYear, prevMonth)),
      };
    }
    case "lastYear":
      return { from: iso(year - 1, 1, 1), to: iso(year - 1, 12, 31) };
    case "custom":
      return { from: customFrom ?? today, to: customTo ?? today };
    case "thisYear":
    default:
      return { from: iso(year, 1, 1), to: today };
  }
}
