"use client";

import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { ItemPriceHistoryRecord } from "@/lib/api";
import { ArrowUpRight, ArrowDownRight, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";

interface PriceCreepLineChartProps {
  history: ItemPriceHistoryRecord[];
  baseUnit: string;
  median?: number | null;
  p25?: number | null;
  p75?: number | null;
  baselineMedian?: number | null;
  latestPrice?: number | null;
  itemName?: string;
}

export function PriceCreepLineChart({
  history,
  baseUnit,
  median,
  p25,
  p75,
  baselineMedian,
  latestPrice: propLatestPrice,
  itemName,
}: PriceCreepLineChartProps) {
  if (!history || history.length === 0) {
    return (
      <div className="flex h-56 flex-col items-center justify-center text-center text-xs text-slate-400">
        <p>No historical purchase orders recorded for {itemName || "this item"}.</p>
      </div>
    );
  }

  // Sort chronological ascending
  const sorted = [...history].sort(
    (a, b) => new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime()
  );

  const chartData = sorted.map((h) => ({
    date: h.invoice_date,
    price: Number(h.price_per_base_unit.toFixed(2)),
    supplier: h.supplier_name,
    qty: h.quantity,
    total: h.line_total,
  }));

  const effectiveLatestPrice =
    propLatestPrice !== undefined && propLatestPrice !== null
      ? propLatestPrice
      : chartData.length > 0
      ? chartData[chartData.length - 1].price
      : 0;

  const prices = chartData.map((d) => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  // Compare against peer median with identical input values
  const diffPeer = median && effectiveLatestPrice !== null ? effectiveLatestPrice - median : null;
  const pctPeer = median && median > 0 && diffPeer !== null ? (diffPeer / median) * 100 : null;

  return (
    <div className="space-y-4">
      {/* Stat Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-[#0e182c]">
        {/* Latest Price */}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Latest Invoiced
          </span>
          <div className="text-base font-black font-mono text-[#1b2b4a] dark:text-slate-100">
            ${effectiveLatestPrice.toFixed(2)}
            <span className="text-xs font-normal text-slate-400">/{baseUnit}</span>
          </div>
        </div>

        {/* Peer Median Comparison */}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            vs. Peer Median
          </span>
          {diffPeer !== null && pctPeer !== null ? (
            <div className="flex items-center gap-1 text-xs font-bold font-mono">
              {diffPeer > 0 ? (
                <span className="flex items-center text-rose-600 dark:text-rose-400">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  +${diffPeer.toFixed(2)} (+{pctPeer.toFixed(1)}%)
                </span>
              ) : diffPeer < 0 ? (
                <span className="flex items-center text-emerald-600 dark:text-emerald-400">
                  <ArrowDownRight className="h-3.5 w-3.5" />
                  -${Math.abs(diffPeer).toFixed(2)} ({pctPeer.toFixed(1)}%)
                </span>
              ) : (
                <span className="text-slate-600 dark:text-slate-300">At Market Median</span>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-400">Pending data</div>
          )}
        </div>

        {/* Baseline Contract Median */}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Your Historical Baseline
          </span>
          <div className="text-xs font-bold font-mono text-slate-700 dark:text-slate-300">
            ${(baselineMedian || median || effectiveLatestPrice).toFixed(2)}
            <span className="text-xs font-normal text-slate-400">/{baseUnit}</span>
          </div>
        </div>

        {/* Historical High / Low */}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Invoiced Range
          </span>
          <div className="text-xs font-bold font-mono text-slate-700 dark:text-slate-300">
            ${minPrice.toFixed(2)} – ${maxPrice.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 15, right: 15, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.6} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(d) => {
                const parts = d.split("-");
                return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : d;
              }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              domain={["auto", "auto"]}
              tickFormatter={(val) => `$${val.toFixed(2)}`}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload;
                  return (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-[#0e182c] min-w-[190px]">
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5 mb-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">
                          Invoice Date: {label}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between items-baseline">
                          <span className="text-xs text-slate-500">Invoiced Price:</span>
                          <span className="text-sm font-extrabold font-mono text-[#1b2b4a] dark:text-white">
                            ${d.price.toFixed(2)}/{baseUnit}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-500">Supplier:</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {d.supplier}
                          </span>
                        </div>
                        {d.qty && (
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">Volume:</span>
                            <span className="font-mono text-slate-600 dark:text-slate-400">
                              {d.qty} cases (${d.total.toFixed(2)})
                            </span>
                          </div>
                        )}
                        {median && (
                          <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-xs">
                            <span className="text-slate-400">Peer Median:</span>
                            <span className="font-mono font-bold text-[#2f4a7d] dark:text-blue-400">
                              ${median.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />

            {/* Shaded Corridor for Middle 50% Market Range (p25 to p75) */}
            {p25 !== undefined && p75 !== undefined && p25 !== null && p75 !== null && (
              <ReferenceArea
                y1={p25}
                y2={p75}
                fill="#3b82f6"
                fillOpacity={0.08}
                strokeOpacity={0}
              />
            )}

            {/* Local Peer Median Reference Line */}
            {median && (
              <ReferenceLine
                y={median}
                stroke="#2f4a7d"
                strokeDasharray="4 4"
                strokeWidth={2}
                label={{
                  value: `Market Median ($${median.toFixed(2)})`,
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: "#2f4a7d",
                  fontWeight: 600,
                }}
              />
            )}

            {/* Historical Baseline Reference Line (if different from peer median) */}
            {baselineMedian && Math.abs(baselineMedian - (median || 0)) > 0.05 && (
              <ReferenceLine
                y={baselineMedian}
                stroke="#d97706"
                strokeDasharray="2 2"
                strokeWidth={1.5}
                label={{
                  value: `Baseline ($${baselineMedian.toFixed(2)})`,
                  position: "insideBottomRight",
                  fontSize: 9,
                  fill: "#d97706",
                }}
              />
            )}

            {/* Main Tenant Invoice Line (Linear interpolation for exact points) */}
            <Line
              type="linear"
              dataKey="price"
              stroke="#1b2b4a"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "#2f4a7d", stroke: "#ffffff", strokeWidth: 2 }}
              activeDot={{ r: 6, fill: "#e11d48", stroke: "#ffffff", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Negotiation Tip Pill */}
      {diffPeer !== null && diffPeer > 0 ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200/80 bg-rose-50/70 p-3 text-xs text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
          <p>
            <strong>Supplier Negotiation Opportunity:</strong> Your most recent invoiced cost is{" "}
            <strong>${diffPeer.toFixed(2)}/{baseUnit} higher</strong> than the local peer median.
            When meeting with your sales rep, reference this objective variance to negotiate your rate closer to the market median of <strong>${median?.toFixed(2)}</strong>.
          </p>
        </div>
      ) : diffPeer !== null && diffPeer <= 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-3 text-xs text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p>
            <strong>Competitive Advantage:</strong> You are currently paying <strong>${Math.abs(diffPeer).toFixed(2)}/{baseUnit} below</strong> the local market median. Your contract pricing is performing strongly.
          </p>
        </div>
      ) : null}
    </div>
  );
}
