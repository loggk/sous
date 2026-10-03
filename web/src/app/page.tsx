"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, SpendSummary, PriceAlert } from "@/lib/api";
import { AlertTriangle, ArrowUpRight, TrendingUp, DollarSign, Layers, Truck, ShieldAlert } from "lucide-react";

export default function DashboardPage() {
  const [spend, setSpend] = useState<SpendSummary | null>(null);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [spendData, alertsData] = await Promise.all([
          api.getSpendSummary(90),
          api.getPriceAlerts(),
        ]);
        setSpend(spendData);
        setAlerts(alertsData);
      } catch (err: any) {
        setError(err.message || "Failed to load dashboard data. Ensure backend is running.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-600 border-t-transparent" />
          <p className="text-sm text-zinc-500">Loading audit data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" /> Connection Error
        </h3>
        <p className="mt-2 text-sm">{error}</p>
        <p className="mt-4 text-xs font-mono bg-red-100 dark:bg-red-900/40 p-2 rounded">
          Make sure the FastAPI backend is running on http://localhost:8000
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          Internal Cost Audit
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Trailing 90-day invoice spend history, broadline distributor breakdown, and baseline price deviation alerting.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total Spend (90d)</span>
            <div className="rounded-lg bg-orange-50 p-2 text-orange-600 dark:bg-orange-950/50">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            ${spend?.total_spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-xs text-zinc-500">Gross invoiced supplier spend</div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Fuel & Service Surcharges</span>
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600 dark:bg-blue-950/50">
              <Truck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            ${spend?.fees_total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-xs text-zinc-500">Separately audited non-item fees</div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Active Price Alerts</span>
            <div className="rounded-lg bg-amber-50 p-2 text-amber-600 dark:bg-amber-950/50">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {alerts.length}
          </div>
          <div className="mt-1 text-xs text-zinc-500">Items above trailing baseline median</div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Market Benchmark Status</span>
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-950/50">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            Unlocked
          </div>
          <div className="mt-1 text-xs text-zinc-500">Contribute-to-consume verified</div>
        </div>
      </div>

      {/* Price Alerts Section */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Price-Change Alerts
            </h2>
            <p className="text-xs text-zinc-500">
              Items flagged against your historical trailing median with minimum absolute-dollar-impact filter.
            </p>
          </div>
          <span className="text-xs font-medium text-zinc-500">{alerts.length} items flagged</span>
        </div>

        {alerts.length === 0 ? (
          <div className="py-8 text-center text-sm text-zinc-500">
            No anomalous price hikes detected above historical baseline medians.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs font-medium text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="pb-3 font-medium">Canonical Item</th>
                  <th className="pb-3 font-medium">Latest Price</th>
                  <th className="pb-3 font-medium">Baseline Median</th>
                  <th className="pb-3 font-medium">Increase</th>
                  <th className="pb-3 font-medium">Est. Impact</th>
                  <th className="pb-3 font-medium">Classification</th>
                  <th className="pb-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {alerts.map((alert) => (
                  <tr key={alert.canonical_item_id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                    <td className="py-3.5 font-medium text-zinc-900 dark:text-zinc-100">
                      {alert.item_name}
                      <span className="ml-2 text-xs text-zinc-400">/{alert.base_unit}</span>
                    </td>
                    <td className="py-3.5 text-zinc-700 dark:text-zinc-300 font-mono">
                      ${alert.latest_price.toFixed(2)}
                    </td>
                    <td className="py-3.5 text-zinc-500 dark:text-zinc-400 font-mono">
                      ${alert.baseline_median.toFixed(2)}
                    </td>
                    <td className="py-3.5 font-semibold text-rose-600 dark:text-rose-400">
                      +{alert.percent_increase.toFixed(1)}%
                    </td>
                    <td className="py-3.5 font-medium text-zinc-900 dark:text-zinc-100">
                      ${alert.estimated_dollar_impact.toFixed(2)}
                    </td>
                    <td className="py-3.5">
                      <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-400">
                        {alert.classification}
                      </span>
                    </td>
                    <td className="py-3.5 text-right">
                      <Link
                        href={`/benchmarks?item=${alert.canonical_item_id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400"
                      >
                        Compare Local Benchmark
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Spend Breakdown Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* By Category */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
            Spend by Category
          </h2>
          <p className="text-xs text-zinc-500 mb-4">Normalized commodity ingredients spend</p>
          <div className="space-y-3">
            {spend &&
              Object.entries(spend.by_category).map(([cat, amount]) => {
                const pct = spend.total_spend > 0 ? (amount / spend.total_spend) * 100 : 0;
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="capitalize text-zinc-700 dark:text-zinc-300">{cat.replace("_", " ")}</span>
                      <span className="text-zinc-900 dark:text-zinc-100 font-mono">
                        ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                        <span className="text-zinc-400">({pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div className="h-full bg-orange-600 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* By Supplier */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
            Spend by Supplier
          </h2>
          <p className="text-xs text-zinc-500 mb-4">Broadline distributor concentration</p>
          <div className="space-y-3">
            {spend &&
              Object.entries(spend.by_supplier).map(([sup, amount]) => {
                const pct = spend.total_spend > 0 ? (amount / spend.total_spend) * 100 : 0;
                return (
                  <div key={sup} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-zinc-700 dark:text-zinc-300">{sup}</span>
                      <span className="text-zinc-900 dark:text-zinc-100 font-mono">
                        ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                        <span className="text-zinc-400">({pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
