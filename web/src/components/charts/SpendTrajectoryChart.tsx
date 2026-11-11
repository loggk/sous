"use client";

import React, { useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { MonthlySpendTrend } from "@/lib/api";
import { TrendingUp, Layers } from "lucide-react";

interface SpendTrajectoryChartProps {
  monthlyTrend?: MonthlySpendTrend[];
  totalSpend: number;
}

/**
 * The navy ramp, light to dark. A stacked bar read with a legend is the one
 * place a single-hue ramp stands in for categories; the 2px surface gap
 * between segments is what keeps adjacent steps apart.
 */
const SUPPLIER_PALETTE = [
  "var(--ramp-1)",
  "var(--ramp-2)",
  "var(--ramp-3)",
  "var(--ramp-4)",
  "var(--ramp-5)",
];

export function SpendTrajectoryChart({ monthlyTrend, totalSpend }: SpendTrajectoryChartProps) {
  const [chartMode, setChartMode] = useState<"area" | "suppliers">("area");

  if (!monthlyTrend || monthlyTrend.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center text-xs text-ink-muted">
        <p>No multi-month trajectory yet.</p>
        <p className="mt-1 text-[11px]">
          This fills in automatically as invoices arrive across billing cycles.
        </p>
      </div>
    );
  }

  // Collect all unique suppliers across months for stacked bar view
  const allSuppliersSet = new Set<string>();
  monthlyTrend.forEach((m) => {
    Object.keys(m.by_supplier || {}).forEach((s) => allSuppliersSet.add(s));
  });
  const uniqueSuppliers = Array.from(allSuppliersSet);

  // Flatten data for Recharts
  const chartData = monthlyTrend.map((m) => ({
    month: m.month,
    total: m.total_spend,
    ...(m.by_supplier || {}),
  }));

  // Average monthly spend
  const avgMonthly = totalSpend / Math.max(monthlyTrend.length, 1);

  // Month-over-month calculation for latest 2 months
  let momPct: number | null = null;
  if (monthlyTrend.length >= 2) {
    const prev = monthlyTrend[monthlyTrend.length - 2].total_spend;
    const curr = monthlyTrend[monthlyTrend.length - 1].total_spend;
    if (prev > 0) {
      momPct = ((curr - prev) / prev) * 100;
    }
  }

  return (
    <div className="space-y-4">
      {/* Header Controls & Summary KPI */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="label-caps">Average per cycle</span>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span className="display-sm num text-xl">
              ${avgMonthly.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
            {momPct !== null && (
              <span
                className={`num inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                  momPct > 0 ? "bg-over-wash text-over-ink" : "bg-under-wash text-under-ink"
                }`}
              >
                {momPct > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingUp className="h-3 w-3 rotate-180" />
                )}
                {momPct > 0 ? `+${momPct.toFixed(1)}%` : `${momPct.toFixed(1)}%`} on the cycle before
              </span>
            )}
          </div>
        </div>

        {/* View Toggle */}
        <div className="inline-flex overflow-hidden rounded-full border border-rule bg-panel">
          <button
            type="button"
            onClick={() => setChartMode("area")}
            className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 px-4 text-xs font-semibold transition-colors ${
              chartMode === "area" ? "bg-ink font-bold text-on-ink" : "text-ink-soft hover:text-ink"
            }`}
          >
            <TrendingUp className="h-3 w-3" /> Total
          </button>
          <button
            type="button"
            onClick={() => setChartMode("suppliers")}
            className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 px-4 text-xs font-semibold transition-colors ${
              chartMode === "suppliers" ? "bg-ink font-bold text-on-ink" : "text-ink-soft hover:text-ink"
            }`}
          >
            <Layers className="h-3 w-3" /> By distributor
          </button>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chartMode === "area" ? (
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => `$${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const val = Number(payload[0].value || 0);
                    return (
                      <div className="rounded border border-rule bg-panel p-3 shadow-lg">
                        <span className="label-caps">{label}</span>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span className="display-sm num text-base">
                            ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="linear"
                dataKey="total"
                stroke="var(--ink)"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#spendGradient)"
                activeDot={{ r: 6, fill: "var(--ink)", stroke: "var(--panel)", strokeWidth: 2 }}
              />
            </AreaChart>
          ) : (
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => `$${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const totalMonth = payload.reduce((acc, curr) => acc + Number(curr.value || 0), 0);
                    return (
                      <div className="min-w-[190px] rounded border border-rule bg-panel p-3 shadow-lg">
                        <div className="mb-2 flex items-center justify-between gap-3 border-b border-rule-soft pb-1.5">
                          <span className="label-caps">{label}</span>
                          <span className="num text-xs font-bold text-ink">
                            ${totalMonth.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {payload.map((entry, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-3 text-xs">
                              <span className="flex items-center gap-1.5 text-ink-soft">
                                <span
                                  className="h-2.5 w-2.5 rounded-sm"
                                  style={{ backgroundColor: entry.color }}
                                />
                                {entry.name}
                              </span>
                              <span className="num font-semibold text-ink">
                                ${Number(entry.value).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              {uniqueSuppliers.map((supplier, idx) => (
                <Bar
                  key={supplier}
                  dataKey={supplier}
                  stackId="suppliers"
                  fill={SUPPLIER_PALETTE[idx % SUPPLIER_PALETTE.length]}
                  stroke="var(--panel)"
                  strokeWidth={2}
                  radius={idx === uniqueSuppliers.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Supplier Legend if in Supplier mode */}
      {chartMode === "suppliers" && uniqueSuppliers.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-4 pt-1">
          {uniqueSuppliers.map((sup, idx) => (
            <div key={sup} className="flex items-center gap-1.5 text-xs text-ink-soft">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: SUPPLIER_PALETTE[idx % SUPPLIER_PALETTE.length] }}
              />
              <span className="font-medium">{sup}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
