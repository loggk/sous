"use client";

import React, { useMemo } from "react";
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
import { ArrowUpRight, ArrowDownRight, CheckCircle2, AlertTriangle } from "lucide-react";

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

function computeYDomain(
  prices: number[],
  median?: number | null,
  p25?: number | null,
  p75?: number | null
): [number, number] {
  const values: number[] = [...prices];
  if (typeof median === "number" && !isNaN(median) && median > 0) values.push(median);
  if (typeof p25 === "number" && !isNaN(p25) && p25 > 0) values.push(p25);
  if (typeof p75 === "number" && !isNaN(p75) && p75 > 0) values.push(p75);

  if (values.length === 0) return [0, 10];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min;

  // Single price point or zero spread
  if (spread === 0) {
    const pad = Math.max(min * 0.15, 0.5);
    const rawMin = Math.max(0, min - pad);
    const rawMax = max + pad;
    const step = rawMax > 50 ? 5 : rawMax > 10 ? 1 : 0.5;
    return [
      Math.max(0, Math.floor(rawMin / step) * step),
      Math.ceil(rawMax / step) * step,
    ];
  }

  // Choose sensible tick stepping based on data magnitude and spread
  const step =
    spread > 100 ? 25 :
    spread > 40 ? 10 :
    spread > 15 ? 5 :
    spread > 5 ? 2 :
    spread > 2 ? 0.5 :
    spread > 0.8 ? 0.25 : 0.1;

  // Add 15-20% padding above and below so points/corridors don't clip the chart frame
  const pad = Math.max(spread * 0.18, step * 0.75);
  const rawMin = Math.max(0, min - pad);
  const rawMax = max + pad;

  const yMin = Math.max(0, Math.floor(rawMin / step) * step);
  const yMax = Math.ceil(rawMax / step) * step;

  return [Number(yMin.toFixed(2)), Number(yMax.toFixed(2))];
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

  // Dynamic focused Y-Axis domain
  const yDomain = useMemo(
    () => computeYDomain(prices, median, p25, p75),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prices.join(","), median, p25, p75]
  );

  // Compare against peer median
  const diffPeer = median && effectiveLatestPrice !== null ? effectiveLatestPrice - median : null;
  const pctPeer = median && median > 0 && diffPeer !== null ? (diffPeer / median) * 100 : null;

  // True distinct baseline (only show if meaningfully different from current invoiced price and peer median)
  const showDistinctBaseline =
    baselineMedian !== undefined &&
    baselineMedian !== null &&
    Math.abs(baselineMedian - effectiveLatestPrice) > 0.05 &&
    Math.abs(baselineMedian - (median || 0)) > 0.05;

  return (
    <div className="space-y-4">
      {/* Stat Bar: 4 Distinct, Valued Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-[#0e182c]">
        {/* Card 1: Latest Invoiced */}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Latest Invoiced
          </span>
          <div className="text-base font-black font-mono text-[#1b2b4a] dark:text-slate-100">
            ${effectiveLatestPrice.toFixed(2)}
            <span className="text-xs font-normal text-slate-400">/{baseUnit}</span>
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
            {chartData.length > 0 ? chartData[chartData.length - 1].date : "Recent invoice"}
          </div>
        </div>

        {/* Card 2: Variance vs. Regional Peer Median */}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            vs. Peer Median
          </span>
          {diffPeer !== null && pctPeer !== null ? (
            <div>
              <div className="flex items-center gap-1 text-sm font-bold font-mono">
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
              <div className="text-[11px] text-slate-400 dark:text-slate-500">
                {diffPeer < 0 ? "Below regional median" : diffPeer > 0 ? "Above regional median" : "Matched with market"}
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-400">Pending data</div>
          )}
        </div>

        {/* Card 3: Regional Market Median */}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Market Median
          </span>
          <div className="text-base font-black font-mono text-[#2563eb] dark:text-blue-400">
            {median ? `$${median.toFixed(2)}` : "—"}
            <span className="text-xs font-normal text-slate-400">/{baseUnit}</span>
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500">
            {p25 !== null && p75 !== null && p25 !== undefined && p75 !== undefined
              ? `Middle 50%: $${p25.toFixed(2)}–$${p75.toFixed(2)}`
              : "Regional benchmark"}
          </div>
        </div>

        {/* Card 4: Purchase History & Range */}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Purchase History
          </span>
          <div className="text-base font-black font-mono text-slate-700 dark:text-slate-200">
            {chartData.length === 1 ? "1 Order" : `${chartData.length} Orders`}
          </div>
          <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
            {chartData.length === 1
              ? (chartData[0].supplier ? `${chartData[0].supplier}` : "Single purchase order")
              : minPrice === maxPrice
              ? `Fixed rate: $${minPrice.toFixed(2)}`
              : `Range: $${minPrice.toFixed(2)} – $${maxPrice.toFixed(2)}`}
          </div>
        </div>
      </div>

      {/* Clean Legend Header Above Chart Canvas */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {/* Your Invoiced Price */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-5 items-center justify-center">
              <span className="h-0.5 w-full bg-[#1b2b4a] dark:bg-blue-300" />
              <span className="absolute h-2 w-2 rounded-full border border-white bg-[#1b2b4a] dark:border-[#0e182c] dark:bg-blue-300" />
            </span>
            <span className="font-semibold text-[#1b2b4a] dark:text-slate-200">
              Your Invoiced Rate
            </span>
            <span className="font-mono text-slate-500 dark:text-slate-400">
              (${effectiveLatestPrice.toFixed(2)})
            </span>
          </div>

          {/* Regional Market Median */}
          {median && (
            <div className="flex items-center gap-2">
              <span className="h-0.5 w-5 border-t-2 border-dashed border-[#2563eb] dark:border-blue-400" />
              <span className="font-medium text-slate-600 dark:text-slate-300">
                Market Median
              </span>
              <span className="font-mono font-semibold text-[#2563eb] dark:text-blue-400">
                (${median.toFixed(2)})
              </span>
            </div>
          )}

          {/* Interquartile Corridor */}
          {p25 !== undefined && p75 !== undefined && p25 !== null && p75 !== null && (
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-4 rounded-xs bg-blue-500/15 border border-blue-400/30 dark:bg-blue-400/15" />
              <span className="text-slate-500 dark:text-slate-400">
                Typical Range (p25–p75)
              </span>
            </div>
          )}

          {/* Distinct Baseline if available */}
          {showDistinctBaseline && (
            <div className="flex items-center gap-2">
              <span className="h-0.5 w-5 border-t-2 border-dotted border-amber-500" />
              <span className="font-medium text-amber-600 dark:text-amber-400">
                Historical Baseline (${baselineMedian.toFixed(2)})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-64 w-full pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 12, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" strokeOpacity={0.7} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={{ stroke: "#e2e8f0", strokeOpacity: 0.8 }}
              tickLine={false}
              tickMargin={8}
              tickFormatter={(d) => {
                const parts = d.split("-");
                return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : d;
              }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              domain={yDomain}
              tickCount={5}
              tickFormatter={(val) => `$${val.toFixed(2)}`}
              width={54}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload;
                  return (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-[#0e182c] min-w-[200px]">
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5 mb-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Invoice: {label}
                        </span>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between items-baseline">
                          <span className="text-slate-500 dark:text-slate-400">Invoiced Rate:</span>
                          <span className="text-sm font-extrabold font-mono text-[#1b2b4a] dark:text-white">
                            ${d.price.toFixed(2)}/{baseUnit}
                          </span>
                        </div>
                        {d.supplier && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500 dark:text-slate-400">Supplier:</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[120px]">
                              {d.supplier}
                            </span>
                          </div>
                        )}
                        {d.qty && (
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500 dark:text-slate-400">Volume:</span>
                            <span className="font-mono text-slate-600 dark:text-slate-400">
                              {d.qty} cases {d.total ? `($${d.total.toFixed(2)})` : ""}
                            </span>
                          </div>
                        )}
                        {median && (
                          <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                            <span className="text-slate-400">Market Median:</span>
                            <span className="font-mono font-bold text-[#2563eb] dark:text-blue-400">
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
                fillOpacity={0.09}
                strokeOpacity={0}
              />
            )}

            {/* Local Peer Median Reference Line */}
            {median && (
              <ReferenceLine
                y={median}
                stroke="#2563eb"
                strokeDasharray="5 5"
                strokeWidth={2}
              />
            )}

            {/* If single point, render a subtle rate guideline so operator can visually anchor against market median across whole width */}
            {chartData.length === 1 && (
              <ReferenceLine
                y={effectiveLatestPrice}
                stroke="#1b2b4a"
                strokeDasharray="3 3"
                strokeWidth={1.5}
                strokeOpacity={0.3}
              />
            )}

            {/* Optional distinct historical baseline (if truly different from latest purchase) */}
            {showDistinctBaseline && (
              <ReferenceLine
                y={baselineMedian}
                stroke="#d97706"
                strokeDasharray="2 2"
                strokeWidth={1.5}
              />
            )}

            {/* Main Tenant Invoice Line (Linear interpolation for exact points) */}
            <Line
              type="linear"
              dataKey="price"
              stroke="#1b2b4a"
              strokeWidth={2.5}
              dot={{ r: 5, fill: "#1b2b4a", stroke: "#ffffff", strokeWidth: 2 }}
              activeDot={{ r: 7, fill: "#2563eb", stroke: "#ffffff", strokeWidth: 2.5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Negotiation Tip Pill */}
      {diffPeer !== null && diffPeer > 0 ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200/80 bg-rose-50/70 p-3.5 text-xs text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
          <p>
            <strong>Supplier Negotiation Opportunity:</strong> Your most recent invoiced cost is{" "}
            <strong>${diffPeer.toFixed(2)}/{baseUnit} higher</strong> than the local peer median.
            When meeting with your sales rep, reference this objective variance to negotiate your rate closer to the market median of <strong>${median?.toFixed(2)}</strong>.
          </p>
        </div>
      ) : diffPeer !== null && diffPeer <= 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-3.5 text-xs text-emerald-900 dark:border-emerald-800/40 dark:bg-emerald-950/25 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p>
            <strong>Competitive Advantage:</strong> You are currently paying <strong>${Math.abs(diffPeer).toFixed(2)}/{baseUnit} below</strong> the local market median. Your contract pricing is performing strongly.
          </p>
        </div>
      ) : null}
    </div>
  );
}
