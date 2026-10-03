"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api, CanonicalItem, BenchmarkData } from "@/lib/api";
import { Scale, Search, ShieldCheck, AlertCircle, Info, MapPin, Building2, Calendar } from "lucide-react";

function BenchmarkContent() {
  const searchParams = useSearchParams();
  const initialItemId = searchParams.get("item");

  const [items, setItems] = useState<CanonicalItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string>(initialItemId || "");
  const [windowDays, setWindowDays] = useState<number>(90);
  const [searchQuery, setSearchQuery] = useState("");
  const [benchmark, setBenchmark] = useState<BenchmarkData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load catalog items
  useEffect(() => {
    async function loadCatalog() {
      try {
        const catalog = await api.getCatalogItems("", true);
        setItems(catalog);
        if (!selectedItemId && catalog.length > 0) {
          const defaultItem = catalog.find((i) => i.name.includes("Roma Tomatoes")) || catalog[0];
          setSelectedItemId(defaultItem.id);
        }
      } catch (err: any) {
        setError("Failed to load canonical item catalogue.");
      }
    }
    loadCatalog();
  }, []);

  // Load benchmark whenever selected item or window changes
  useEffect(() => {
    if (!selectedItemId) return;
    async function fetchBenchmark() {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getBenchmark(selectedItemId, windowDays);
        setBenchmark(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchBenchmark();
  }, [selectedItemId, windowDays]);

  const selectedItem = items.find((i) => i.id === selectedItemId);

  const filteredItems = items.filter((i) =>
    i.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">
          <ShieldCheck className="h-4 w-4" /> k-Anonymous Local Price Network
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          Local Market Benchmarks
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 max-w-3xl">
          Compare your normalized gross invoiced pricing against an anonymized cohort of participating independent restaurants across the Greater Toronto Area.
        </p>
      </div>

      {/* Main Grid: Item Picker + Benchmark Display */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: Item Selector (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search benchmarkable items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-9 pr-3 py-1.5 text-sm outline-none focus:border-orange-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            <div className="max-h-[500px] overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
              {filteredItems.map((item) => {
                const isSelected = item.id === selectedItemId;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center justify-between text-sm ${
                      isSelected
                        ? "bg-orange-50 font-semibold text-orange-900 dark:bg-orange-950/50 dark:text-orange-200"
                        : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/50"
                    }`}
                  >
                    <span>{item.name}</span>
                    <span className="text-[11px] font-mono text-zinc-400">/{item.base_unit}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Benchmark Card & Distribution (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Controls Bar: Window Selection */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
            <div>
              <span className="text-xs font-medium text-zinc-500">Selected Item:</span>
              <div className="text-base font-bold text-zinc-900 dark:text-zinc-50">
                {selectedItem?.name || "Select an item"}
                {selectedItem && <span className="ml-1 text-xs text-zinc-400 font-normal">({selectedItem.base_unit})</span>}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-500">Rolling Window:</span>
              <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
                <button
                  onClick={() => setWindowDays(30)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    windowDays === 30
                      ? "bg-white text-zinc-900 shadow-xs font-semibold dark:bg-zinc-900 dark:text-zinc-50"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400"
                  }`}
                >
                  30 Days
                </button>
                <button
                  onClick={() => setWindowDays(90)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    windowDays === 90
                      ? "bg-white text-zinc-900 shadow-xs font-semibold dark:bg-zinc-900 dark:text-zinc-50"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400"
                  }`}
                >
                  90 Days
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-orange-600 border-t-transparent" />
              <p className="mt-3 text-sm text-zinc-500">Executing k-anonymity SQL query & radius ladder...</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="h-5 w-5" /> Entitlement Notice
              </div>
              <p className="mt-1 text-sm">{error}</p>
            </div>
          ) : benchmark?.suppressed ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                Cell Suppressed for Anonymity Protection
              </h3>
              <p className="text-sm text-zinc-500 max-w-md mx-auto">
                {benchmark.suppression_reason ||
                  "Insufficient contributing restaurants or observation density to meet strict k-anonymity privacy thresholds."}
              </p>
              <div className="pt-2 text-xs text-zinc-400">
                Enforced by database: Minimum 5 restaurants, 15 observations, ≤30% dominance.
              </div>
            </div>
          ) : (
            benchmark && (
              <div className="space-y-6">
                {/* Cohort Label & Radius Banner */}
                <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-blue-900 dark:text-blue-200 font-medium">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <span>
                        Calculated across <strong className="font-semibold">{benchmark.n_restaurants} independent restaurants</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <span>
                        Radius ladder used:{" "}
                        <strong className="rounded bg-blue-100 dark:bg-blue-900/60 px-1.5 py-0.5">
                          {benchmark.radius_km_used}km corridor
                        </strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <span>Trailing {windowDays} days (7-day lag)</span>
                    </div>
                  </div>
                </div>

                {/* Benchmark Cards: p25 / Median / p75 */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {/* p25 */}
                  <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 text-center">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      25th Percentile
                    </span>
                    <div className="mt-2 text-2xl font-bold font-mono text-zinc-700 dark:text-zinc-300">
                      ${benchmark.p25?.toFixed(2)}
                    </div>
                    <span className="text-xs text-zinc-400">Lower quartile market rate</span>
                  </div>

                  {/* Median (Highlighted) */}
                  <div className="rounded-xl border-2 border-orange-500 bg-orange-50/30 p-5 shadow-xs dark:bg-orange-950/20 text-center">
                    <span className="text-xs font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">
                      Market Median (p50)
                    </span>
                    <div className="mt-2 text-3xl font-extrabold font-mono text-zinc-900 dark:text-zinc-50">
                      ${benchmark.median?.toFixed(2)}
                    </div>
                    <span className="text-xs font-medium text-orange-700 dark:text-orange-300">
                      Central GTA market benchmark
                    </span>
                  </div>

                  {/* p75 */}
                  <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 text-center">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      75th Percentile
                    </span>
                    <div className="mt-2 text-2xl font-bold font-mono text-zinc-700 dark:text-zinc-300">
                      ${benchmark.p75?.toFixed(2)}
                    </div>
                    <span className="text-xs text-zinc-400">Upper quartile market rate</span>
                  </div>
                </div>

                {/* Restaurant Variance Card */}
                {benchmark.tenant_latest_price && benchmark.median && (
                  <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <span className="text-xs font-medium text-zinc-500">Your Last Invoiced Unit Price</span>
                      <div className="text-xl font-bold font-mono text-zinc-900 dark:text-zinc-50">
                        ${benchmark.tenant_latest_price.toFixed(2)}{" "}
                        <span className="text-xs text-zinc-400 font-normal">/{selectedItem?.base_unit}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      {benchmark.tenant_latest_price > benchmark.median ? (
                        <div>
                          <span className="inline-flex items-center rounded-md bg-rose-50 px-2.5 py-1 text-sm font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-950/40 dark:text-rose-400">
                            +{(((benchmark.tenant_latest_price - benchmark.median) / benchmark.median) * 100).toFixed(1)}% vs. Market Median
                          </span>
                          <p className="mt-1 text-xs text-zinc-400">Potential renegotiation opportunity</p>
                        </div>
                      ) : (
                        <div>
                          <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-400">
                            {(((benchmark.tenant_latest_price - benchmark.median) / benchmark.median) * 100).toFixed(1)}% vs. Market Median
                          </span>
                          <p className="mt-1 text-xs text-zinc-400">Competitive contract rate</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Crucial Comparability Caveat Notice (Section 3.7) */}
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50 flex items-start gap-2.5">
                  <Info className="h-4 w-4 shrink-0 text-zinc-400 mt-0.5" />
                  <div>
                    <strong className="font-semibold text-zinc-700 dark:text-zinc-300">Comparability Note: </strong>
                    {benchmark.comparability_caveat}
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

export default function BenchmarkPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-zinc-500">Loading benchmark tool...</div>}>
      <BenchmarkContent />
    </Suspense>
  );
}

