"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api, CanonicalItem, BenchmarkData, BenchmarkSummaryItem } from "@/lib/api";
import { Scale, Search, ShieldCheck, AlertCircle, Info, MapPin, Building2, Sliders } from "lucide-react";

interface RadiusStop {
  value: number | null;
  label: string;
  sublabel: string;
}

const RADIUS_STOPS: RadiusStop[] = [
  { value: null, label: "Auto", sublabel: "Adaptive Ladder" },
  { value: 3, label: "3 km", sublabel: "Hyperlocal" },
  { value: 5, label: "5 km", sublabel: "District" },
  { value: 10, label: "10 km", sublabel: "Sub-region" },
  { value: 15, label: "15 km", sublabel: "Greater Area" },
  { value: 25, label: "25 km", sublabel: "Regional" },
  { value: 50, label: "50 km", sublabel: "GTA-wide" },
];

function BenchmarkContent() {
  const searchParams = useSearchParams();
  const initialItemId = searchParams.get("item");

  const [items, setItems] = useState<BenchmarkSummaryItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string>(initialItemId || "");
  const [windowDays, setWindowDays] = useState<number>(90);
  const [sliderIndex, setSliderIndex] = useState<number>(0);
  const [activeRadiusKm, setActiveRadiusKm] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [withDataOnly, setWithDataOnly] = useState<boolean>(true);
  const [benchmark, setBenchmark] = useState<BenchmarkData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSliderChange(newIndex: number) {
    const clamped = Math.max(0, Math.min(newIndex, RADIUS_STOPS.length - 1));
    setSliderIndex(clamped);
    setActiveRadiusKm(RADIUS_STOPS[clamped].value);
  }

  // Load catalog items with benchmark availability summary
  useEffect(() => {
    async function loadCatalog() {
      try {
        const catalog = await api.getBenchmarkSummary(windowDays, activeRadiusKm);
        setItems(catalog);

        setSelectedItemId((prev) => {
          if (catalog.length === 0) return "";
          const existing = catalog.find((i) => i.id === prev);
          if (existing && (!withDataOnly || existing.has_data)) {
            return prev;
          }
          const defaultItem = withDataOnly
            ? catalog.find((i) => i.has_data) || catalog[0]
            : catalog.find((i) => i.name.includes("Roma Tomatoes")) || catalog[0];
          return defaultItem.id;
        });
      } catch {
        // Fallback to basic catalog items if summary is unavailable
        try {
          const fallback = await api.getCatalogItems("", true);
          const mappedFallback: BenchmarkSummaryItem[] = fallback.map((f) => ({
            ...f,
            has_data: false,
            suppressed: true,
          }));
          setItems(mappedFallback);
          if (mappedFallback.length > 0) {
            setSelectedItemId((prev) => prev || mappedFallback[0].id);
          }
        } catch {
          setError("Failed to load canonical item catalogue.");
        }
      }
    }
    loadCatalog();

    const handleRestChanged = () => {
      loadCatalog();
    };
    window.addEventListener("sous_restaurant_changed", handleRestChanged);
    return () => window.removeEventListener("sous_restaurant_changed", handleRestChanged);
  }, [windowDays, activeRadiusKm]);

  function handleToggleWithDataOnly(val: boolean) {
    setWithDataOnly(val);
    if (val) {
      const current = items.find((i) => i.id === selectedItemId);
      if (current && !current.has_data) {
        const firstWithData = items.find((i) => i.has_data);
        if (firstWithData) {
          setSelectedItemId(firstWithData.id);
        }
      }
    }
  }

  // Load benchmark whenever selected item, rolling window, or radius changes
  useEffect(() => {
    if (!selectedItemId) return;
    async function fetchBenchmark() {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getBenchmark(selectedItemId, windowDays, activeRadiusKm);
        setBenchmark(data);
        // Sync item data availability with live benchmark response
        setItems((prev) =>
          prev.map((item) =>
            item.id === selectedItemId
              ? { ...item, has_data: !data.suppressed, suppressed: data.suppressed }
              : item
          )
        );
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchBenchmark();
  }, [selectedItemId, windowDays, activeRadiusKm]);

  const selectedItem = items.find((i) => i.id === selectedItemId);

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (withDataOnly) {
      return item.has_data === true;
    }
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="pb-2 border-b border-slate-200/60 dark:border-slate-800">
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#1b2b4a] dark:text-slate-100 sm:text-3xl">
          Local Market Benchmarks
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-3xl">
          Compare your invoiced ingredient pricing against an anonymized network of participating independent restaurants in your local region.
        </p>
      </div>

      {/* Main Grid: Item Picker + Benchmark Display */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: Item Selector (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#131f37]">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Search benchmarkable items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-3 py-2 text-sm outline-none transition-colors focus:border-[#2f4a7d] focus:bg-white text-[#1b2b4a] placeholder-slate-400 dark:border-slate-700 dark:bg-[#0e182c] dark:text-slate-100 dark:focus:border-blue-400 dark:focus:bg-[#0e182c] dark:placeholder-slate-500"
              />
            </div>

            {/* Toggle: Filter items with enough data */}
            <div className="flex items-center justify-between px-1 pb-3 mb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-[#1b2b4a] dark:text-slate-200">
                  {withDataOnly ? "Active Benchmarks" : "All Benchmark Items"}
                </span>
                <span className="text-[11px] font-mono rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {filteredItems.length}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Active only
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={withDataOnly}
                  onClick={() => handleToggleWithDataOnly(!withDataOnly)}
                  title={withDataOnly ? "Showing items with active market benchmarks" : "Showing all items"}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    withDataOnly
                      ? "bg-[#1b2b4a] dark:bg-blue-600"
                      : "bg-slate-200 dark:bg-slate-700"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                      withDataOnly ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="max-h-[375px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 pr-1">
              {filteredItems.length === 0 ? (
                <div className="py-12 px-4 text-center">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No items match your criteria.
                  </p>
                  {withDataOnly && (
                    <button
                      type="button"
                      onClick={() => handleToggleWithDataOnly(false)}
                      className="mt-2 text-xs font-semibold text-[#2f4a7d] hover:underline dark:text-blue-400"
                    >
                      Show all items
                    </button>
                  )}
                </div>
              ) : (
                filteredItems.map((item) => {
                  const isSelected = item.id === selectedItemId;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedItemId(item.id)}
                      className={`w-full text-left px-3.5 py-3 rounded-xl transition-all flex items-center justify-between text-sm ${
                        isSelected
                          ? "bg-[#f0f4fa] font-bold text-[#1b2b4a] shadow-2xs ring-2 ring-inset ring-[#2f4a7d] border-0 dark:bg-[#1a2c4e] dark:text-blue-100 dark:ring-blue-400"
                          : "text-slate-600 hover:bg-[#f8fafc] hover:text-[#1b2b4a] dark:text-slate-400 dark:hover:bg-[#1a2c4e]/50 dark:hover:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <span className="truncate">{item.name}</span>
                        {!withDataOnly && !item.has_data && (
                          <span className="shrink-0 text-[10px] font-normal text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 rounded">
                            pending data
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500 shrink-0">/{item.base_unit}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Benchmark Card & Distribution (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Controls Bar: Window Selection */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#131f37]">
            <div>
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Selected Item</span>
              <div className="text-lg font-extrabold text-[#1b2b4a] dark:text-slate-100">
                {selectedItem?.name || "Select an item"}
                {selectedItem && <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500 font-normal">({selectedItem.base_unit})</span>}
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Rolling Window:</span>
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

          {/* Interactive Competitor Radius Slider */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#131f37] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-[#2f4a7d] dark:text-blue-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Competitor Trade Radius
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-[#f0f4fa] px-2.5 py-1 text-xs font-bold text-[#1b2b4a] dark:bg-[#1a2c4e] dark:text-blue-200">
                <span>{RADIUS_STOPS[sliderIndex].label}</span>
                <span className="text-slate-400 dark:text-slate-400 font-normal">
                  — {RADIUS_STOPS[sliderIndex].sublabel}
                </span>
              </div>
            </div>

            {/* Range slider track */}
            <div className="pt-2 px-1">
              <input
                type="range"
                min={0}
                max={RADIUS_STOPS.length - 1}
                step={1}
                value={sliderIndex}
                onChange={(e) => handleSliderChange(Number(e.target.value))}
                className="w-full accent-[#1b2b4a] dark:accent-blue-500 cursor-pointer h-2 bg-slate-100 dark:bg-slate-700 rounded-lg appearance-none transition-all"
              />
              <div className="flex justify-between text-[11px] text-slate-400 dark:text-slate-500 pt-2 font-mono">
                {RADIUS_STOPS.map((stop, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSliderChange(idx)}
                    className={`cursor-pointer transition-all hover:text-[#1b2b4a] dark:hover:text-white ${
                      idx === sliderIndex
                        ? "font-bold text-[#1b2b4a] dark:text-blue-400 scale-105"
                        : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {stop.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white p-12 text-center shadow-xs dark:border-slate-800 dark:bg-[#131f37]">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-[#2f4a7d] dark:border-blue-400 border-t-transparent" />
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Calculating regional market benchmarks...</p>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-6 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="h-5 w-5 text-amber-700 dark:text-amber-400" /> Benchmark Notice
              </div>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">{error}</p>
            </div>
          ) : benchmark?.suppressed ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white p-10 text-center shadow-xs dark:border-slate-800 dark:bg-[#131f37] space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f0f4fa] text-[#2f4a7d] dark:bg-[#1a2c4e] dark:text-blue-300">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-[#1b2b4a] dark:text-slate-100">
                {activeRadiusKm !== null
                  ? `More Data Needed Within ${activeRadiusKm} km`
                  : "More Data Needed for this Item"}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                {benchmark.suppression_reason ||
                  "To protect restaurant privacy and ensure accurate numbers, benchmarks only appear once enough participating restaurants report prices for this ingredient."}
              </p>

              {activeRadiusKm !== null && (
                <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleSliderChange(0)}
                    className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl bg-[#1b2b4a] px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#2f4a7d] transition-all dark:bg-blue-600 dark:hover:bg-blue-500"
                  >
                    Switch to Auto-Expand
                  </button>
                  {sliderIndex < RADIUS_STOPS.length - 1 && (
                    <button
                      type="button"
                      onClick={() => handleSliderChange(sliderIndex + 1)}
                      className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all dark:border-slate-700 dark:bg-[#0e182c] dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Expand to {RADIUS_STOPS[sliderIndex + 1].label}
                    </button>
                  )}
                </div>
              )}

              <div className="pt-1 text-xs text-slate-400 dark:text-slate-500">
                Benchmarks update automatically as new invoices are uploaded by local operators.
              </div>
            </div>
          ) : (
            benchmark && (
              <div className="space-y-6">
                {/* Cohort Label & Radius Banner */}
                <div className="rounded-2xl border border-blue-200/60 bg-[#f6f8fc] p-4 dark:border-blue-900/40 dark:bg-[#162544]">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#1b2b4a] dark:text-slate-200 font-medium">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-4 w-4 text-[#2f4a7d] dark:text-blue-400" />
                      <span>
                        Calculated across <strong className="font-bold">{benchmark.n_restaurants} independent restaurants</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-[#2f4a7d] dark:text-blue-400" />
                      <span>
                        Market Area:{" "}
                        <strong className="rounded-md bg-blue-100/70 text-[#1b2b4a] px-2 py-0.5 font-bold dark:bg-blue-900/60 dark:text-blue-100">
                          Within {benchmark.radius_km_used} km
                          {activeRadiusKm !== null ? ` (Target: ${activeRadiusKm} km)` : " (Auto-adapted)"}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Benchmark Cards: p25 / Median / p75 */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {/* p25 */}
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs text-center dark:border-slate-800 dark:bg-[#131f37]">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      25th Percentile
                    </span>
                    <div className="mt-2 text-2xl font-bold font-mono text-slate-700 dark:text-slate-200">
                      ${benchmark.p25?.toFixed(2)}
                    </div>
                    <span className="text-xs text-slate-400 dark:text-slate-500">Lower quartile market rate</span>
                  </div>

                  {/* Median (Highlighted Hero Card) */}
                  <div className="rounded-2xl border-2 border-[#2f4a7d] bg-[#f6f8fc] p-5 shadow-sm text-center relative overflow-hidden dark:border-blue-500 dark:bg-[#162544]">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-[#2f4a7d] dark:text-blue-300">
                      Market Median
                    </span>
                    <div className="mt-2 text-3xl font-black font-mono text-[#1b2b4a] dark:text-white">
                      ${benchmark.median?.toFixed(2)}
                    </div>
                    <span className="text-xs font-semibold text-[#2f4a7d] dark:text-blue-300">
                      Regional market median
                    </span>
                  </div>

                  {/* p75 */}
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs text-center dark:border-slate-800 dark:bg-[#131f37]">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      75th Percentile
                    </span>
                    <div className="mt-2 text-2xl font-bold font-mono text-slate-700 dark:text-slate-200">
                      ${benchmark.p75?.toFixed(2)}
                    </div>
                    <span className="text-xs text-slate-400 dark:text-slate-500">Upper quartile market rate</span>
                  </div>
                </div>

                {/* Restaurant Variance Card */}
                {benchmark.tenant_latest_price && benchmark.median && (
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-wrap items-center justify-between gap-4 dark:border-slate-800 dark:bg-[#131f37]">
                    <div>
                      <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Your Last Invoiced Unit Price</span>
                      <div className="text-xl font-black font-mono text-[#1b2b4a] dark:text-slate-100">
                        ${benchmark.tenant_latest_price.toFixed(2)}{" "}
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-normal">/{selectedItem?.base_unit}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      {benchmark.tenant_latest_price > benchmark.median ? (
                        <div>
                          <span className="inline-flex items-center rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-500/30">
                            +{(((benchmark.tenant_latest_price - benchmark.median) / benchmark.median) * 100).toFixed(1)}% vs. Market Median
                          </span>
                          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Potential renegotiation opportunity</p>
                        </div>
                      ) : (
                        <div>
                          <span className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/30">
                            {(((benchmark.tenant_latest_price - benchmark.median) / benchmark.median) * 100).toFixed(1)}% vs. Market Median
                          </span>
                          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Competitive contract rate</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Crucial Comparability Notice */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500 shadow-2xs flex items-start gap-2.5 dark:border-slate-800 dark:bg-[#131f37] dark:text-slate-400">
                  <Info className="h-4 w-4 shrink-0 text-[#2f4a7d] dark:text-blue-400 mt-0.5" />
                  <div>
                    <strong className="font-semibold text-[#1b2b4a] dark:text-slate-200">Pricing Note: </strong>
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
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Loading benchmark tool...</div>}>
      <BenchmarkContent />
    </Suspense>
  );
}

