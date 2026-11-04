"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, SpendSummary, PriceAlert } from "@/lib/api";
import {
  AlertTriangle,
  ArrowUpRight,
  DollarSign,
  Truck,
  ShieldAlert,
  TrendingUp,
  Receipt,
  Scale,
  CheckCircle2,
  PieChart
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [spend, setSpend] = useState<SpendSummary | null>(null);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [windowDays, setWindowDays] = useState<number>(90);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [spendData, alertsData] = await Promise.all([
          api.getSpendSummary(windowDays),
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

    const handleRestChanged = () => {
      loadData();
    };
    window.addEventListener("sous_restaurant_changed", handleRestChanged);
    return () => window.removeEventListener("sous_restaurant_changed", handleRestChanged);
  }, [windowDays]);

  const totalAlertImpact = alerts.reduce((acc, curr) => acc + (curr.estimated_dollar_impact || 0), 0);

  if (loading && !spend) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#2f4a7d] border-t-transparent dark:border-blue-400" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Auditing invoice spend & detecting price shifts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" /> Connection Notice
        </h3>
        <p className="mt-2 text-sm">{error}</p>
        <p className="mt-4 text-xs font-mono bg-red-100 dark:bg-red-900/40 p-2 rounded">
          Ensure the FastAPI backend is running on http://localhost:8000
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header & Window Controls */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-2 border-b border-slate-200/60 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1b2b4a] dark:text-slate-100 sm:text-3xl">
            Spend Insights & Audit
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Direct visibility into your primary food cost drivers, unannounced price increases, and surcharge leaks.
          </p>
        </div>

        {/* Rolling Window Selector */}
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Audit Window:</span>
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-[#0e182c]">
            <button
              onClick={() => setWindowDays(30)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                windowDays === 30
                  ? "bg-[#1b2b4a] text-white shadow-xs dark:bg-blue-600"
                  : "text-slate-600 hover:text-[#1b2b4a] dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setWindowDays(90)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                windowDays === 90
                  ? "bg-[#1b2b4a] text-white shadow-xs dark:bg-blue-600"
                  : "text-slate-600 hover:text-[#1b2b4a] dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              90 Days
            </button>
          </div>
        </div>
      </div>

      {/* 3 Executive Financial Scorecards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {/* Total Spend */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#131f37]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Invoiced Food Spend
            </span>
            <div className="rounded-xl bg-[#f0f4fa] p-2.5 text-[#2f4a7d] dark:bg-[#1a2c4e] dark:text-blue-300">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold tracking-tight tabular-nums text-[#1b2b4a] dark:text-slate-100">
            ${spend?.total_spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Across all deliveries in the past {windowDays} days
          </p>
        </div>

        {/* Audited Surcharges & Fees */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#131f37]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Surcharges & Drop Fees
            </span>
            <div className="rounded-xl bg-[#f0f4fa] p-2.5 text-[#2f4a7d] dark:bg-[#1a2c4e] dark:text-blue-300">
              <Truck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold tracking-tight tabular-nums text-[#1b2b4a] dark:text-slate-100">
            ${spend?.fees_total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {spend && spend.total_spend > 0
              ? `${((spend.fees_total / spend.total_spend) * 100).toFixed(1)}% of your gross spend goes to fees`
              : "Fuel surcharges & delivery fees"}
          </p>
        </div>

        {/* Active Price Creep Exposure */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#131f37]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Price Creep Exposure
            </span>
            <div className={`rounded-xl p-2.5 ${alerts.length > 0 ? "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"}`}>
              {alerts.length > 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold tracking-tight tabular-nums text-[#1b2b4a] dark:text-slate-100">
            {alerts.length > 0
              ? `+$${totalAlertImpact.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "$0.00"}
          </div>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {alerts.length > 0
              ? `Sum of price jump impacts across ${alerts.length} ingredients`
              : "All ingredient prices within expected baseline"}
          </p>
        </div>
      </div>

      {/* Actionable Price Increases & Renegotiation Targets */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#131f37]">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-base font-bold text-[#1b2b4a] dark:text-slate-100 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Price-Increase Alerts
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Ingredients where recent invoice costs jumped above your baseline median. Click any row to view market benchmarks.
            </p>
          </div>
        </div>

        {alerts.length === 0 ? (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-8 text-center dark:border-emerald-900/30 dark:bg-emerald-950/10">
            <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            <h3 className="mt-2 text-sm font-bold text-emerald-900 dark:text-emerald-200">
              No Unwarranted Price Increases Detected
            </h3>
            <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400 max-w-md mx-auto">
              Your broadline supplier prices have remained consistent with your historical contract medians. Newly uploaded invoices are monitored automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 dark:border-slate-800 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="pb-3 font-semibold">Ingredient</th>
                  <th className="pb-3 font-semibold">Baseline Median</th>
                  <th className="pb-3 font-semibold">Latest Invoiced</th>
                  <th className="pb-3 font-semibold">Unit Increase</th>
                  <th className="pb-3 font-semibold text-right">Cost Impact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {alerts.map((alert) => {
                  const unitDiff = alert.latest_price - alert.baseline_median;
                  return (
                    <tr
                      key={alert.canonical_item_id}
                      onClick={() => router.push(`/benchmarks?item=${alert.canonical_item_id}`)}
                      className="group cursor-pointer hover:bg-slate-50 dark:hover:bg-[#1a2c4e]/30 transition-colors"
                    >
                      <td className="py-3.5 font-semibold text-[#1b2b4a] dark:text-slate-100">
                        <div className="flex items-center gap-1.5">
                          <span>{alert.item_name}</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">/{alert.base_unit}</span>
                          <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-[#2f4a7d] dark:text-slate-600 dark:group-hover:text-blue-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                        </div>
                      </td>
                      <td className="py-3.5 text-slate-500 dark:text-slate-400 font-medium tabular-nums">
                        ${alert.baseline_median.toFixed(2)}
                      </td>
                      <td className="py-3.5 text-slate-700 dark:text-slate-300 font-semibold tabular-nums">
                        ${alert.latest_price.toFixed(2)}
                      </td>
                      <td className="py-3.5 font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                        +${unitDiff.toFixed(2)} <span className="text-xs font-normal text-rose-500 dark:text-rose-400">({alert.percent_increase.toFixed(1)}%)</span>
                      </td>
                      <td className="py-3.5 text-right font-bold text-[#1b2b4a] dark:text-slate-100 tabular-nums">
                        +${alert.estimated_dollar_impact.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 dark:border-slate-800 font-semibold text-xs text-slate-600 dark:text-slate-400">
                  <td colSpan={4} className="pt-3.5 text-right font-medium">
                    Total Price Creep Exposure:
                  </td>
                  <td className="pt-3.5 text-right font-bold text-sm text-[#1b2b4a] dark:text-slate-100 tabular-nums">
                    +${totalAlertImpact.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Two-Column Strategic Breakdown: Spend Categories & Top Cost Drivers */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Spend by Category */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#131f37]">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-bold text-[#1b2b4a] dark:text-slate-100">
              Spend by Category
            </h2>
            <PieChart className="h-4 w-4 text-slate-400" />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
            Distribution of food budget across commodity departments
          </p>

          <div className="space-y-4">
            {spend &&
              Object.entries(spend.by_category).map(([cat, amount]) => {
                const pct = spend.total_spend > 0 ? (amount / spend.total_spend) * 100 : 0;
                return (
                  <div key={cat} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="capitalize text-slate-700 dark:text-slate-300 font-semibold">{cat.replace("_", " ")}</span>
                      <span className="text-[#1b2b4a] dark:text-slate-100 font-semibold tabular-nums">
                        ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                        <span className="text-slate-400 dark:text-slate-500 font-normal">({pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full bg-[#2f4a7d] dark:bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Right: Top Cost Drivers (Where the money actually goes!) */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#131f37]">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-bold text-[#1b2b4a] dark:text-slate-100">
              Top Cost-Driver Ingredients
            </h2>
            <TrendingUp className="h-4 w-4 text-slate-400" />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
            Your highest expenditure ingredients and their share of food cost
          </p>

          <div className="space-y-4">
            {spend?.top_items && spend.top_items.length > 0 ? (
              spend.top_items.slice(0, 5).map((item) => {
                const pct = item.pct_of_spend;
                return (
                  <div
                    key={item.id || item.name}
                    onClick={() => item.id ? router.push(`/benchmarks?item=${item.id}`) : router.push("/review")}
                    className="group cursor-pointer space-y-1.5"
                    title={
                      item.id
                        ? `${item.name}: $${item.total_spend.toFixed(2)} (${pct.toFixed(1)}% of food spend) • Click to view benchmarks`
                        : `${item.name}: $${item.total_spend.toFixed(2)} (${pct.toFixed(1)}% of food spend) • Click to map in review`
                    }
                  >
                    <div className="flex justify-between items-center text-xs font-medium">
                      <div className="flex items-center gap-1.5 min-w-0 pr-2">
                        <span className="text-slate-700 dark:text-slate-300 font-semibold truncate group-hover:text-[#2f4a7d] dark:group-hover:text-blue-400 transition-colors">
                          {item.name}
                        </span>
                        {item.category === "Unmapped" && (
                          <span className="rounded bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.2 text-[9px] font-semibold text-amber-800 dark:text-amber-300 uppercase shrink-0">
                            Review
                          </span>
                        )}
                        <ArrowUpRight className="h-3 w-3 text-slate-400 group-hover:text-[#2f4a7d] dark:group-hover:text-blue-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <span className="text-[#1b2b4a] dark:text-slate-100 font-semibold tabular-nums shrink-0">
                        ${item.total_spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                        <span className="text-slate-400 dark:text-slate-500 font-normal">({pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-[#2f4a7d] dark:bg-blue-500 rounded-full transition-all duration-500 group-hover:bg-[#1b2b4a] dark:group-hover:bg-blue-400"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                Top cost drivers will populate automatically as invoices are processed.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
