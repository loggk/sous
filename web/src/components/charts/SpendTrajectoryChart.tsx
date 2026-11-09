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

const SUPPLIER_PALETTE = [
  "#2f4a7d", // primary navy
  "#0284c7", // sky
  "#16a34a", // emerald
  "#d97706", // amber
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#64748b", // slate
];

export function SpendTrajectoryChart({ monthlyTrend, totalSpend }: SpendTrajectoryChartProps) {
  const [chartMode, setChartMode] = useState<"area" | "suppliers">("area");

  if (!monthlyTrend || monthlyTrend.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center text-xs text-slate-400">
        <p>No multi-month invoice trajectory available yet.</p>
        <p className="mt-1 text-[11px] text-slate-500">
          Monthly trajectories will populate automatically as invoices are uploaded across billing cycles.
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
        <div className="flex items-center gap-3">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Monthly Burn Rate
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-black font-mono text-[#1b2b4a] dark:text-slate-100">
                ${avgMonthly.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">/ avg month</span>
              {momPct !== null && (
                <span
                  className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md ${
                    momPct > 0
                      ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  }`}
                >
                  {momPct > 0 ? `+${momPct.toFixed(1)}%` : `${momPct.toFixed(1)}%`} MoM
                </span>
              )}
            </div>
          </div>
        </div>

        {/* View Toggle */}
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-[#0e182c]">
          <button
            type="button"
            onClick={() => setChartMode("area")}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              chartMode === "area"
                ? "bg-[#1b2b4a] text-white shadow-xs dark:bg-blue-600"
                : "text-slate-600 hover:text-[#1b2b4a] dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <TrendingUp className="h-3 w-3" /> Total Spend
          </button>
          <button
            type="button"
            onClick={() => setChartMode("suppliers")}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              chartMode === "suppliers"
                ? "bg-[#1b2b4a] text-white shadow-xs dark:bg-blue-600"
                : "text-slate-600 hover:text-[#1b2b4a] dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Layers className="h-3 w-3" /> By Supplier
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
                  <stop offset="5%" stopColor="#2f4a7d" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#2f4a7d" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.6} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => `$${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const val = Number(payload[0].value || 0);
                    return (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-[#0e182c]">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          {label}
                        </span>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span className="text-base font-black font-mono text-[#1b2b4a] dark:text-white">
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
                stroke="#2f4a7d"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#spendGradient)"
                activeDot={{ r: 6, fill: "#1b2b4a", stroke: "#ffffff", strokeWidth: 2 }}
              />
            </AreaChart>
          ) : (
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.6} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(val) => `$${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const totalMonth = payload.reduce((acc, curr) => acc + Number(curr.value || 0), 0);
                    return (
                      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-[#0e182c] min-w-[180px]">
                        <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-1.5 mb-2">
                          <span className="text-[11px] font-bold text-slate-500 uppercase">{label}</span>
                          <span className="text-xs font-black font-mono text-[#1b2b4a] dark:text-white">
                            ${totalMonth.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {payload.map((entry, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs">
                              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                                {entry.name}
                              </span>
                              <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
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
            <div key={sup} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              <span
                className="h-2.5 w-2.5 rounded-full"
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
