"use client";

import { Calendar, ChevronDown } from "lucide-react";

export interface WindowOption {
  days: number;
  label: string;
  sublabel: string;
}

export const DEFAULT_AUDIT_WINDOWS: WindowOption[] = [
  { days: 14, label: "14 Days", sublabel: "Past 2 Weeks" },
  { days: 30, label: "30 Days", sublabel: "Past Month" },
  { days: 60, label: "60 Days", sublabel: "Past 2 Months" },
  { days: 90, label: "90 Days", sublabel: "Past Quarter" },
  { days: 180, label: "180 Days", sublabel: "Past 6 Months" },
  { days: 365, label: "1 Year", sublabel: "Past 12 Months" },
];

export const BENCHMARK_WINDOWS: WindowOption[] = [
  { days: 30, label: "30 Days", sublabel: "Trailing Month" },
  { days: 90, label: "90 Days", sublabel: "Trailing Quarter" },
];

export interface AuditWindowControlProps {
  value: number;
  onChange: (days: number) => void;
  options?: WindowOption[];
  label?: string;
  className?: string;
}

export function AuditWindowControl({
  value,
  onChange,
  options = DEFAULT_AUDIT_WINDOWS,
  label = "Audit Window",
  className = "",
}: AuditWindowControlProps) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 whitespace-nowrap">
        <Calendar className="h-3.5 w-3.5 text-[#2f4a7d] dark:text-blue-400" />
        <span>{label}:</span>
      </label>

      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 py-1.5 text-xs font-bold text-[#1b2b4a] shadow-2xs hover:border-slate-300 focus:border-[#2f4a7d] focus:outline-none dark:border-slate-700 dark:bg-[#131f37] dark:text-slate-100 dark:focus:border-blue-400 transition-colors"
        >
          {options.map((opt) => (
            <option key={opt.days} value={opt.days}>
              {opt.label} ({opt.sublabel})
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-slate-400" />
      </div>
    </div>
  );
}
