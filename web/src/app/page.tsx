"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, SpendSummary, PriceAlert, ItemPriceHistoryRecord, BenchmarkData } from "@/lib/api";
import { SpendTrajectoryChart } from "@/components/charts/SpendTrajectoryChart";
import { PriceCreepLineChart } from "@/components/charts/PriceCreepLineChart";
import { AlertTriangle, ArrowUpRight, CheckCircle2, ShieldAlert, X } from "lucide-react";
import { AuditWindowControl } from "@/components/AuditWindowControl";

/** The navy ramp, light to dark. Categories are ranked by size, not identity. */
const RAMP = ["bg-ramp-1", "bg-ramp-2", "bg-ramp-3", "bg-ramp-4", "bg-ramp-5"];

function money(value: number, decimals = 2) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function DashboardPage() {
  const router = useRouter();
  const [spend, setSpend] = useState<SpendSummary | null>(null);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [windowDays, setWindowDays] = useState<number>(90);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Price Jump Alert Inspection Modal State
  const [selectedAlert, setSelectedAlert] = useState<PriceAlert | null>(null);
  const [alertHistory, setAlertHistory] = useState<ItemPriceHistoryRecord[]>([]);
  const [alertBenchmark, setAlertBenchmark] = useState<BenchmarkData | null>(null);
  const [loadingAlertDetail, setLoadingAlertDetail] = useState(false);

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

  // Load item price history & benchmark when inspecting an alert
  useEffect(() => {
    if (selectedAlert) {
      setLoadingAlertDetail(true);
      Promise.all([
        api.getItemPriceHistory(selectedAlert.canonical_item_id).catch(() => []),
        api.getBenchmark(selectedAlert.canonical_item_id, windowDays).catch(() => null),
      ])
        .then(([hist, bench]) => {
          setAlertHistory(hist);
          setAlertBenchmark(bench);
        })
        .finally(() => setLoadingAlertDetail(false));
    } else {
      setAlertHistory([]);
      setAlertBenchmark(null);
    }
  }, [selectedAlert, windowDays]);

  const totalAlertImpact = alerts.reduce((acc, curr) => acc + (curr.estimated_dollar_impact || 0), 0);
  const feePct = spend && spend.total_spend > 0 ? (spend.fees_total / spend.total_spend) * 100 : null;

  const rankedCategories = Object.entries(spend?.by_category || {})
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (loading && !spend) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-sm text-ink-soft">Reading your invoices and checking for price moves…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-over bg-over-wash p-6 text-over-ink">
        <h3 className="display-sm flex items-center gap-2 text-lg text-over-ink">
          <ShieldAlert className="h-5 w-5" /> Can&rsquo;t reach your data
        </h3>
        <p className="mt-2 text-sm">{error}</p>
        <p className="mt-4 rounded bg-chip p-2 font-mono text-xs text-ink-soft">
          Check that the API is running on http://localhost:8000
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Page head */}
      <div className="flex flex-wrap items-end justify-between gap-6 pb-7">
        <div>
          <span className="eyebrow">Spend audit</span>
          <h1 className="display-xl mt-2 text-4xl sm:text-[46px]">Insights</h1>
          <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-ink-soft">
            Where the food cost actually went, which prices moved on you, and what that is worth.
          </p>
        </div>

        <AuditWindowControl value={windowDays} onChange={setWindowDays} label="Audit window" />
      </div>

      {/* The one finding that matters */}
      <section className="section-open section-close flex flex-wrap items-center justify-between gap-10 py-8">
        {alerts.length > 0 ? (
          <>
            <div className="min-w-0 flex-[1_1_480px]">
              <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-over-ink">
                Price creep exposure · {windowDays} days
              </span>
              <div className="mt-2.5 flex flex-wrap items-baseline gap-3.5">
                <span className="display-xl num text-5xl sm:text-6xl">+${money(totalAlertImpact)}</span>
                <span className="text-sm font-semibold text-over-ink">
                  across {alerts.length} {alerts.length === 1 ? "ingredient" : "ingredients"}
                </span>
              </div>
              <p className="mt-3.5 max-w-xl text-[15px] leading-relaxed text-ink-soft">
                Suppliers moved these unit prices above your own baseline median. All of it is on the
                table at your next order.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/benchmarks" className="pill-primary no-underline">
                  Compare against the market
                </Link>
              </div>
            </div>

            <div className="flex-[0_1_300px]">
              <span className="label-caps">Where it sits</span>
              <dl className="mt-3 space-y-2.5">
                {alerts.slice(0, 5).map((alert) => (
                  <div key={alert.canonical_item_id} className="flex items-baseline justify-between gap-4">
                    <dt className="truncate text-sm text-ink-soft">{alert.item_name}</dt>
                    <dd className="num shrink-0 text-sm font-semibold text-ink">
                      +${money(alert.estimated_dollar_impact)}
                    </dd>
                  </div>
                ))}
                {alerts.length > 5 && (
                  <div className="flex items-baseline justify-between gap-4 border-t border-rule-soft pt-2.5">
                    <dt className="truncate text-sm text-ink-muted">
                      and {alerts.length - 5} more
                    </dt>
                    <dd className="num shrink-0 text-sm font-semibold text-ink">
                      +$
                      {money(
                        alerts
                          .slice(5)
                          .reduce((acc, a) => acc + (a.estimated_dollar_impact || 0), 0)
                      )}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </>
        ) : (
          <div className="min-w-0 flex-[1_1_480px]">
            <span className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-under-ink">
              Price creep exposure · {windowDays} days
            </span>
            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              <CheckCircle2 className="h-7 w-7 text-under" />
              <span className="display-xl text-4xl">Nothing has moved on you</span>
            </div>
            <p className="mt-3.5 max-w-xl text-[15px] leading-relaxed text-ink-soft">
              Every ingredient is still priced at or below your contract median. New invoices are
              checked automatically as they arrive.
            </p>
          </div>
        )}
      </section>

      {/* Hairline stat row */}
      <section className="section-close grid grid-cols-1 sm:grid-cols-3">
        <div className="py-6 pr-7">
          <span className="label-caps">Invoiced food spend</span>
          <div className="display-sm num mt-2 text-[27px]">${money(spend?.total_spend ?? 0)}</div>
          <p className="mt-1.5 text-xs text-ink-muted">Across every delivery in the window</p>
        </div>
        <div className="border-rule px-7 py-6 sm:border-l">
          <span className="label-caps">Surcharges &amp; drop fees</span>
          <div className="display-sm num mt-2 text-[27px]">${money(spend?.fees_total ?? 0)}</div>
          <p className="mt-1.5 text-xs text-ink-muted">
            {feePct !== null
              ? `${feePct.toFixed(1)}% of gross spend goes to fees`
              : "Fuel surcharges and delivery fees"}
          </p>
        </div>
        <div className="border-rule py-6 pl-7 sm:border-l">
          <span className="label-caps">Prices above baseline</span>
          <div className="display-sm num mt-2 text-[27px]">{alerts.length}</div>
          <p className="mt-1.5 text-xs text-ink-muted">
            {alerts.length > 0 ? "Listed below, biggest impact first" : "All within your baseline"}
          </p>
        </div>
      </section>

      {/* Weekly / monthly burn */}
      <section className="pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="display-sm text-xl">Purchasing burn</h2>
            <p className="mt-1.5 text-[13px] text-ink-muted">
              Invoiced spend per billing cycle across the past {windowDays} days, and how it splits
              between distributors.
            </p>
          </div>
        </div>
        <div className="panel mt-5 px-5 pb-4 pt-6">
          <SpendTrajectoryChart monthlyTrend={spend?.monthly_trend} totalSpend={spend?.total_spend || 0} />
        </div>
      </section>

      {/* What changed */}
      <section className="pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-3.5">
          <div>
            <h2 className="display-sm text-xl">What changed on you</h2>
            <p className="mt-1.5 text-[13px] text-ink-muted">
              Unit prices now above your own baseline median. Open a row for the trajectory and the
              market comparison.
            </p>
          </div>
          <Link
            href="/benchmarks"
            className="font-display text-[11px] font-bold uppercase tracking-[0.12em] text-accent no-underline hover:underline"
          >
            All benchmarks &rarr;
          </Link>
        </div>

        {alerts.length === 0 ? (
          <div className="flex items-start gap-3.5 border-b border-rule py-7">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-under" />
            <div>
              <h3 className="display-sm text-base">No unwarranted increases detected</h3>
              <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-soft">
                Your broadline prices have held against your historical contract medians. Newly
                uploaded invoices are monitored automatically.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)] gap-0 border-b border-rule pb-2.5 pt-3.5 sm:grid">
              <span className="label-caps">Ingredient</span>
              <span className="label-caps text-right">Baseline</span>
              <span className="label-caps text-right">Latest</span>
              <span className="label-caps text-right">Move</span>
              <span className="label-caps text-right">{windowDays}-day impact</span>
            </div>

            {alerts.map((alert) => {
              const unitDiff = alert.latest_price - alert.baseline_median;
              return (
                <button
                  key={alert.canonical_item_id}
                  type="button"
                  onClick={() => setSelectedAlert(alert)}
                  title="Open the price trajectory and market comparison"
                  className="group grid w-full cursor-pointer grid-cols-2 items-center gap-y-2 border-b border-rule-soft py-4 text-left transition-colors hover:bg-panel sm:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)] sm:gap-y-0"
                >
                  <span className="col-span-2 min-w-0 sm:col-span-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[15px] font-semibold text-ink">{alert.item_name}</span>
                      <span className="text-xs font-normal text-ink-muted">/{alert.base_unit}</span>
                      <ArrowUpRight className="h-3.5 w-3.5 text-ink-muted opacity-0 transition-opacity group-hover:opacity-100" />
                    </span>
                  </span>

                  <span className="num text-sm text-ink-soft sm:text-right">
                    <span className="label-caps mr-2 sm:hidden">Baseline</span>${alert.baseline_median.toFixed(2)}
                  </span>
                  <span className="num text-sm font-semibold text-ink sm:text-right">
                    <span className="label-caps mr-2 sm:hidden">Latest</span>${alert.latest_price.toFixed(2)}
                  </span>
                  <span className="sm:text-right">
                    <span className="num inline-flex items-center gap-1.5 rounded-full bg-over-wash px-2.5 py-1 text-xs font-bold text-over-ink">
                      <AlertTriangle className="h-3 w-3 text-over" />
                      +${unitDiff.toFixed(2)} ({alert.percent_increase.toFixed(1)}%)
                    </span>
                  </span>
                  <span className="num font-display text-[15px] font-bold text-ink sm:text-right">
                    +${money(alert.estimated_dollar_impact)}
                  </span>
                </button>
              );
            })}

            <div className="flex items-baseline justify-between gap-4 pt-3.5">
              <span className="text-xs font-medium text-ink-soft">Total exposure</span>
              <span className="num display-sm text-sm">+${money(totalAlertImpact)}</span>
            </div>
          </>
        )}
      </section>

      {/* Two-column breakdown */}
      <section className="flex flex-wrap gap-12 pt-11">
        <div className="min-w-0 flex-[1_1_420px]">
          <h2 className="display-sm text-xl">Where the money went</h2>
          <p className="mb-6 mt-1.5 text-[13px] text-ink-muted">
            Share of invoiced food spend by department, ranked.
          </p>

          {rankedCategories.length === 0 ? (
            <p className="py-8 text-center text-xs text-ink-muted">
              Categories populate automatically as invoices are mapped.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {rankedCategories.map(([category, amount], idx) => {
                const pct = spend && spend.total_spend > 0 ? (amount / spend.total_spend) * 100 : 0;
                return (
                  <div key={category}>
                    <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                      <span className="font-semibold capitalize text-ink">
                        {category.replace(/_/g, " ")}
                      </span>
                      <span className="num text-ink-soft">
                        ${money(amount)} &middot;{" "}
                        <strong className="font-semibold text-ink">{pct.toFixed(0)}%</strong>
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-sm bg-rule-soft">
                      <div
                        className={`h-full rounded-sm ${RAMP[idx % RAMP.length]}`}
                        style={{ width: `${Math.max(pct, 1)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-[1_1_420px]">
          <h2 className="display-sm text-xl">Top cost drivers</h2>
          <p className="mb-6 mt-1.5 text-[13px] text-ink-muted">
            The line items carrying most of your food cost.
          </p>

          <div className="flex flex-col">
            {spend?.top_items && spend.top_items.length > 0 ? (
              spend.top_items.slice(0, 5).map((item, idx) => (
                <button
                  key={item.id || item.name}
                  type="button"
                  onClick={() =>
                    item.id ? router.push(`/benchmarks?item=${item.id}`) : router.push("/review")
                  }
                  title={
                    item.id
                      ? `Compare ${item.name} against the local market`
                      : `Map ${item.name} to a catalogue ingredient`
                  }
                  className="flex w-full cursor-pointer items-center justify-between gap-4 border-b border-rule-soft py-3.5 text-left transition-colors hover:bg-panel"
                >
                  <span className="flex min-w-0 items-baseline gap-3">
                    <span className="num w-[18px] font-display text-[11px] font-bold text-ramp-5">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="truncate text-[15px] font-semibold text-ink">{item.name}</span>
                    {item.category === "Unmapped" && (
                      <span className="shrink-0 rounded-sm bg-over-wash px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-over-ink">
                        Unmapped
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-baseline gap-3 whitespace-nowrap">
                    <span className="num text-[13px] text-ink-muted">
                      {item.pct_of_spend.toFixed(0)}%
                    </span>
                    <span className="num text-[15px] font-semibold text-ink">
                      ${money(item.total_spend)}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <p className="py-8 text-center text-xs text-ink-muted">
                Top cost drivers populate automatically as invoices are processed.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Alert inspection */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-3xl overflow-hidden rounded border border-rule bg-panel shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-rule bg-paper-raised p-5">
              <div>
                <span className="eyebrow">Price trajectory</span>
                <h3 className="display-sm mt-1.5 text-xl">{selectedAlert.item_name}</h3>
                <p className="mt-1 text-xs text-ink-muted">
                  Your invoiced price against your baseline and the local market corridor
                </p>
              </div>
              <button
                onClick={() => setSelectedAlert(null)}
                aria-label="Close"
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-rule text-ink-muted transition-colors hover:border-edge hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-6">
              {loadingAlertDetail ? (
                <div className="py-12 text-center text-xs text-ink-muted">
                  <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  <p className="mt-2">Loading price history and local benchmarks…</p>
                </div>
              ) : (
                <PriceCreepLineChart
                  history={alertHistory}
                  baseUnit={selectedAlert.base_unit}
                  median={alertBenchmark?.median}
                  p25={alertBenchmark?.p25}
                  p75={alertBenchmark?.p75}
                  baselineMedian={selectedAlert.baseline_median}
                  latestPrice={selectedAlert.latest_price}
                  itemName={selectedAlert.item_name}
                />
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-paper-raised p-4">
              <span className="text-xs text-ink-soft">
                Estimated impact:{" "}
                <strong className="num font-bold text-over-ink">
                  +${money(selectedAlert.estimated_dollar_impact)}
                </strong>
              </span>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => router.push(`/benchmarks?item=${selectedAlert.canonical_item_id}`)}
                  className="pill-primary"
                >
                  Full local benchmark
                </button>
                <button type="button" onClick={() => setSelectedAlert(null)} className="pill-secondary">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
