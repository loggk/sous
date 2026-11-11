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
      <div className="flex h-56 flex-col items-center justify-center text-center text-xs text-ink-muted">
        <p>No purchases recorded yet for {itemName || "this item"}.</p>
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
    <div className="space-y-5">
      {/* Four facts, divided by hairlines rather than boxed */}
      <div className="grid grid-cols-2 border-y border-rule sm:grid-cols-4">
        <div className="py-4 pr-5">
          <span className="label-caps">Your latest</span>
          <div className="num display-sm mt-1.5 text-base">
            ${effectiveLatestPrice.toFixed(2)}
            <span className="text-xs font-normal text-ink-muted">/{baseUnit}</span>
          </div>
          <div className="truncate text-[11px] text-ink-muted">
            {chartData.length > 0 ? chartData[chartData.length - 1].date : "Recent invoice"}
          </div>
        </div>

        <div className="border-rule px-5 py-4 sm:border-l">
          <span className="label-caps">Against the market</span>
          {diffPeer !== null && pctPeer !== null ? (
            <div>
              <div className="num mt-1.5 flex items-center gap-1 text-sm font-bold">
                {diffPeer > 0 ? (
                  <span className="flex items-center text-over-ink">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    +${diffPeer.toFixed(2)} (+{pctPeer.toFixed(1)}%)
                  </span>
                ) : diffPeer < 0 ? (
                  <span className="flex items-center text-under-ink">
                    <ArrowDownRight className="h-3.5 w-3.5" />
                    −${Math.abs(diffPeer).toFixed(2)} ({pctPeer.toFixed(1)}%)
                  </span>
                ) : (
                  <span className="text-ink-soft">Level with the median</span>
                )}
              </div>
              <div className="text-[11px] text-ink-muted">
                {diffPeer < 0 ? "Under the local median" : diffPeer > 0 ? "Over the local median" : "Matched"}
              </div>
            </div>
          ) : (
            <div className="mt-1.5 text-xs text-ink-muted">Pending data</div>
          )}
        </div>

        <div className="border-rule px-5 py-4 sm:border-l">
          <span className="label-caps">Local median</span>
          <div className="num display-sm mt-1.5 text-base text-accent">
            {median ? `$${median.toFixed(2)}` : "–"}
            <span className="text-xs font-normal text-ink-muted">/{baseUnit}</span>
          </div>
          <div className="text-[11px] text-ink-muted">
            {p25 !== null && p75 !== null && p25 !== undefined && p75 !== undefined
              ? `Middle half: $${p25.toFixed(2)}–$${p75.toFixed(2)}`
              : "Local benchmark"}
          </div>
        </div>

        <div className="border-rule py-4 pl-5 sm:border-l">
          <span className="label-caps">You&rsquo;ve bought it</span>
          <div className="num display-sm mt-1.5 text-base">
            {chartData.length === 1 ? "once" : `${chartData.length} times`}
          </div>
          <div className="truncate text-[11px] text-ink-muted">
            {chartData.length === 1
              ? (chartData[0].supplier ? `${chartData[0].supplier}` : "Single order")
              : minPrice === maxPrice
              ? `Always $${minPrice.toFixed(2)}`
              : `$${minPrice.toFixed(2)} – $${maxPrice.toFixed(2)}`}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-5 items-center justify-center">
            <span className="h-0.5 w-full bg-ink" />
            <span className="absolute h-2 w-2 rounded-full border border-panel bg-ink" />
          </span>
          <span className="font-semibold text-ink">Your invoiced price</span>
          <span className="num text-ink-muted">(${effectiveLatestPrice.toFixed(2)})</span>
        </div>

        {median && (
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-5 border-t-2 border-dashed border-accent" />
            <span className="font-medium text-ink-soft">Local median</span>
            <span className="num font-semibold text-accent">(${median.toFixed(2)})</span>
          </div>
        )}

        {p25 !== undefined && p75 !== undefined && p25 !== null && p75 !== null && (
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-4 rounded-sm bg-accent/20" />
            <span className="text-ink-soft">Middle half (p25–p75)</span>
          </div>
        )}

        {showDistinctBaseline && (
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-5 border-t-2 border-dotted border-over" />
            <span className="font-medium text-over-ink">
              Your baseline (${baselineMedian.toFixed(2)})
            </span>
          </div>
        )}
      </div>

      {/* Chart Canvas */}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 12, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
              axisLine={{ stroke: "var(--rule)" }}
              tickLine={false}
              tickMargin={8}
              tickFormatter={(d) => {
                const parts = d.split("-");
                return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : d;
              }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--ink-muted)" }}
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
                    <div className="min-w-[200px] rounded border border-rule bg-panel p-3 shadow-lg">
                      <div className="mb-2 border-b border-rule-soft pb-1.5">
                        <span className="label-caps">Invoiced {label}</span>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-ink-muted">Your price</span>
                          <span className="num display-sm text-sm">
                            ${d.price.toFixed(2)}/{baseUnit}
                          </span>
                        </div>
                        {d.supplier && (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-ink-muted">Supplier</span>
                            <span className="max-w-[120px] truncate font-semibold text-ink-soft">
                              {d.supplier}
                            </span>
                          </div>
                        )}
                        {d.qty && (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-ink-muted">Volume</span>
                            <span className="num text-ink-soft">
                              {d.qty} cases {d.total ? `($${d.total.toFixed(2)})` : ""}
                            </span>
                          </div>
                        )}
                        {median && (
                          <div className="flex items-center justify-between gap-3 border-t border-rule-soft pt-1.5">
                            <span className="text-ink-muted">Local median</span>
                            <span className="num font-bold text-accent">${median.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />

            {/* Middle half of the local market */}
            {p25 !== undefined && p75 !== undefined && p25 !== null && p75 !== null && (
              <ReferenceArea
                y1={p25}
                y2={p75}
                fill="var(--accent)"
                fillOpacity={0.14}
                strokeOpacity={0}
              />
            )}

            {median && (
              <ReferenceLine y={median} stroke="var(--accent)" strokeDasharray="6 5" strokeWidth={2} />
            )}

            {/* With a single purchase, anchor it across the width */}
            {chartData.length === 1 && (
              <ReferenceLine
                y={effectiveLatestPrice}
                stroke="var(--ink)"
                strokeDasharray="3 3"
                strokeWidth={1.5}
                strokeOpacity={0.3}
              />
            )}

            {showDistinctBaseline && (
              <ReferenceLine
                y={baselineMedian}
                stroke="var(--over)"
                strokeDasharray="2 3"
                strokeWidth={1.5}
              />
            )}

            <Line
              type="linear"
              dataKey="price"
              stroke="var(--ink)"
              strokeWidth={2.5}
              dot={{ r: 5, fill: "var(--ink)", stroke: "var(--panel)", strokeWidth: 2 }}
              activeDot={{ r: 7, fill: "var(--over)", stroke: "var(--panel)", strokeWidth: 2.5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* What to do about it */}
      {diffPeer !== null && diffPeer > 0 ? (
        <div className="flex items-start gap-3 border-t border-rule pt-4 text-[13px] leading-relaxed text-ink-soft">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-over" />
          <p>
            <strong className="font-semibold text-ink">Worth a conversation.</strong> You are paying{" "}
            <strong className="num font-semibold text-over-ink">
              ${diffPeer.toFixed(2)}/{baseUnit} over
            </strong>{" "}
            the local median. Bring that number to your rep and anchor on{" "}
            <strong className="num font-semibold text-ink">${median?.toFixed(2)}</strong>.
          </p>
        </div>
      ) : diffPeer !== null && diffPeer <= 0 ? (
        <div className="flex items-start gap-3 border-t border-rule pt-4 text-[13px] leading-relaxed text-ink-soft">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-under" />
          <p>
            <strong className="font-semibold text-ink">You&rsquo;re buying this well.</strong> Your price is{" "}
            <strong className="num font-semibold text-under-ink">
              ${Math.abs(diffPeer).toFixed(2)}/{baseUnit} under
            </strong>{" "}
            the local median.
          </p>
        </div>
      ) : null}
    </div>
  );
}
