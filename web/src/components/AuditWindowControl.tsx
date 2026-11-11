"use client";

export interface WindowOption {
  days: number;
  label: string;
  sublabel: string;
}

export const DEFAULT_AUDIT_WINDOWS: WindowOption[] = [
  { days: 14, label: "14d", sublabel: "Past 2 weeks" },
  { days: 30, label: "30d", sublabel: "Past month" },
  { days: 60, label: "60d", sublabel: "Past 2 months" },
  { days: 90, label: "90d", sublabel: "Past quarter" },
  { days: 180, label: "180d", sublabel: "Past 6 months" },
  { days: 365, label: "1y", sublabel: "Past 12 months" },
];

export const BENCHMARK_WINDOWS: WindowOption[] = [
  { days: 30, label: "30d", sublabel: "Trailing month" },
  { days: 90, label: "90d", sublabel: "Trailing quarter" },
];

export interface AuditWindowControlProps {
  value: number;
  onChange: (days: number) => void;
  options?: WindowOption[];
  label?: string;
  className?: string;
}

/**
 * Pass segmented control: every window is visible and one tap away, rather
 * than hidden behind a select. Labels sit above, as everywhere else.
 */
export function AuditWindowControl({
  value,
  onChange,
  options = DEFAULT_AUDIT_WINDOWS,
  label = "Audit window",
  className = "",
}: AuditWindowControlProps) {
  return (
    <fieldset className={`m-0 border-0 p-0 ${className}`}>
      <legend className="label-caps pb-2">{label}</legend>

      <div className="flex overflow-hidden rounded-full border border-rule bg-panel">
        {options.map((opt) => {
          const isActive = opt.days === value;
          return (
            <label
              key={opt.days}
              title={opt.sublabel}
              className={`flex min-h-11 min-w-[52px] cursor-pointer items-center justify-center px-3 text-[13px] transition-colors ${
                isActive
                  ? "bg-ink font-bold text-on-ink"
                  : "font-semibold text-ink-soft hover:text-ink"
              }`}
            >
              <input
                type="radio"
                name={`audit-window-${label.replace(/\s+/g, "-").toLowerCase()}`}
                value={opt.days}
                checked={isActive}
                onChange={() => onChange(opt.days)}
                className="absolute h-px w-px opacity-0"
              />
              {opt.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
