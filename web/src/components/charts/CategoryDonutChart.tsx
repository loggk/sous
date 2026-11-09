"use client";

import React, { useState } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

interface CategoryDonutChartProps {
  byCategory: Record<string, number>;
  totalSpend: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  meat: "#e11d48", // rose 600
  proteins: "#e11d48",
  poultry: "#ea580c", // orange 600
  seafood: "#0284c7", // sky 600
  produce: "#16a34a", // emerald 600
  dairy: "#eab308", // amber 500
  dairy_eggs: "#eab308",
  bakery: "#d97706", // amber 600
  dry_goods: "#8b5cf6", // purple 500
  pantry: "#a855f7", // violet 500
  oil_shortening: "#0d9488", // teal 600
  oils: "#0d9488",
  beverage: "#6366f1", // indigo 500
  packaging: "#64748b", // slate 500
  fees: "#f43f5e", // rose 500
  surcharges: "#f43f5e",
};

const DEFAULT_COLORS = [
  "#2f4a7d",
  "#3b82f6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#64748b",
];

function getCategoryColor(category: string, index: number): string {
  const norm = category.toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (CATEGORY_COLORS[norm]) return CATEGORY_COLORS[norm];
  for (const [key, color] of Object.entries(CATEGORY_COLORS)) {
    if (norm.includes(key)) return color;
  }
  return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

export function CategoryDonutChart({ byCategory, totalSpend }: CategoryDonutChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const data = Object.entries(byCategory)
    .filter(([_, val]) => val > 0)
    .map(([cat, amount], idx) => ({
      name: cat.replace(/_/g, " "),
      rawCategory: cat,
      value: amount,
      color: getCategoryColor(cat, idx),
    }))
    .sort((a, b) => b.value - a.value);

  if (data.length === 0 || totalSpend <= 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center text-xs text-slate-400">
        <p>No category expenditure recorded for this time window.</p>
      </div>
    );
  }

  const activeItem = activeIndex !== null ? data[activeIndex] : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Donut Chart Container */}
      <div className="relative h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload;
                  const pct = totalSpend > 0 ? (d.value / totalSpend) * 100 : 0;
                  return (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-[#0e182c]">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: d.color }}
                        />
                        <span className="text-xs font-bold capitalize text-[#1b2b4a] dark:text-slate-100">
                          {d.name}
                        </span>
                      </div>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-sm font-extrabold font-mono text-[#1b2b4a] dark:text-white">
                          ${d.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-xs font-medium text-slate-400">
                          ({pct.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={95}
              paddingAngle={3}
              dataKey="value"
              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              cursor="pointer"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color}
                  stroke={activeIndex === index ? "#ffffff" : "transparent"}
                  strokeWidth={activeIndex === index ? 3 : 1}
                  className="transition-all duration-300"
                  opacity={activeIndex === null || activeIndex === index ? 1 : 0.65}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Center Label in Donut Hole */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {activeItem ? activeItem.name : "Total Categorized"}
          </span>
          <span className="text-lg font-black font-mono text-[#1b2b4a] dark:text-slate-100">
            ${(activeItem ? activeItem.value : totalSpend).toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}
          </span>
          {activeItem && (
            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              {((activeItem.value / totalSpend) * 100).toFixed(1)}% of total
            </span>
          )}
        </div>
      </div>

      {/* Interactive Legend Grid */}
      <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3">
        {data.map((item, idx) => {
          const pct = totalSpend > 0 ? (item.value / totalSpend) * 100 : 0;
          const isSelected = activeIndex === idx;
          return (
            <button
              key={item.name}
              type="button"
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseLeave={() => setActiveIndex(null)}
              className={`flex items-center gap-2 rounded-lg p-1.5 text-left transition-colors cursor-pointer ${
                isSelected
                  ? "bg-slate-100 dark:bg-[#1a2c4e]"
                  : "hover:bg-slate-50 dark:hover:bg-[#1a2c4e]/40"
              }`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-semibold capitalize text-slate-700 dark:text-slate-300">
                  {item.name}
                </div>
                <div className="text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
                  ${item.value >= 1000 ? `${(item.value / 1000).toFixed(1)}k` : item.value.toFixed(0)} ({pct.toFixed(0)}%)
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
