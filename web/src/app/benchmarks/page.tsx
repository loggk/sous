"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api, BenchmarkData, BenchmarkSummaryItem, ItemPriceHistoryRecord } from "@/lib/api";
import { PriceCreepLineChart } from "@/components/charts/PriceCreepLineChart";
import { AuditWindowControl } from "@/components/AuditWindowControl";
import { AlertCircle, ShieldCheck } from "lucide-react";

interface RadiusStop {
  value: number | null;
  label: string;
  sublabel: string;
}

const RADIUS_STOPS: RadiusStop[] = [
  { value: null, label: "Auto", sublabel: "Widens until there is enough data" },
  { value: 3, label: "3 km", sublabel: "Hyperlocal" },
  { value: 5, label: "5 km", sublabel: "District" },
  { value: 10, label: "10 km", sublabel: "Sub-region" },
  { value: 15, label: "15 km", sublabel: "Greater area" },
  { value: 25, label: "25 km", sublabel: "Regional" },
  { value: 50, label: "50 km", sublabel: "GTA-wide" },
];

function money(value: number, decimals = 2) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * The local spread as one number line: the middle half as a band, the median
 * as a tick, and your own price flagged against it. One look answers "am I
 * paying over the odds", which three equal percentile cards never did.
 */
function SpreadStrip({
  p25,
  median,
  p75,
  yours,
  baseUnit,
}: {
  p25: number;
  median: number;
  p75: number;
  yours?: number | null;
  baseUnit: string;
}) {
  const points = [p25, p75, median, ...(yours ? [yours] : [])];
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const pad = Math.max((hi - lo) * 0.28, hi * 0.02);
  const min = lo - pad;
  const max = hi + pad;
  const x = (v: number) => ((v - min) / (max - min)) * 1000;

  const yoursOver = yours != null && yours > median;
  const flagX = yours != null ? x(yours) : 0;
  const flagAnchor = flagX > 880 ? "end" : flagX < 120 ? "start" : "middle";

  return (
    <svg
      viewBox="0 0 1000 148"
      width="100%"
      height="148"
      role="img"
      aria-label={`Local spread: middle half $${p25.toFixed(2)} to $${p75.toFixed(2)}, median $${median.toFixed(
        2
      )}${yours != null ? `. Your price $${yours.toFixed(2)}` : ""}`}
      className="block"
    >
      <line x1={x(p25)} y1="74" x2={x(p75)} y2="74" stroke="var(--edge)" strokeWidth="2" />
      <rect
        x={x(p25)}
        y="56"
        width={Math.max(x(p75) - x(p25), 2)}
        height="36"
        rx="4"
        fill="var(--accent)"
        opacity="0.2"
      />
      <line x1={x(median)} y1="46" x2={x(median)} y2="102" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
      <text
        x={x(median)}
        y="36"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fill="var(--ink)"
        className="font-display"
      >
        Median ${median.toFixed(2)}
      </text>

      {yours != null && (
        <g>
          <line
            x1={flagX}
            y1="74"
            x2={flagX}
            y2="110"
            stroke={yoursOver ? "var(--over)" : "var(--under)"}
            strokeWidth="2"
            strokeDasharray="4 4"
          />
          <circle
            cx={flagX}
            cy="74"
            r="8"
            fill={yoursOver ? "var(--over)" : "var(--under)"}
            stroke="var(--panel)"
            strokeWidth="2.5"
          />
          <text
            x={flagX}
            y="130"
            textAnchor={flagAnchor}
            fontSize="13"
            fontWeight="700"
            fill={yoursOver ? "var(--over-ink)" : "var(--under-ink)"}
            className="font-display"
          >
            You · ${yours.toFixed(2)}
          </text>
        </g>
      )}

      <text x={x(p25)} y="120" textAnchor="middle" fontSize="11" fill="var(--ink-muted)">
        ${p25.toFixed(2)}
      </text>
      <text x={x(p75)} y="120" textAnchor="middle" fontSize="11" fill="var(--ink-muted)">
        ${p75.toFixed(2)}
      </text>
      <text x="0" y="16" fontSize="11" fill="var(--ink-muted)">
        per {baseUnit}
      </text>
    </svg>
  );
}

function BenchmarkContent() {
  const searchParams = useSearchParams();
  const initialItemId = searchParams.get("item");

  const [items, setItems] = useState<BenchmarkSummaryItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string>(initialItemId || "");
  const [windowDays, setWindowDays] = useState<number>(90);
  const [radiusIndex, setRadiusIndex] = useState<number>(0);
  const [activeRadiusKm, setActiveRadiusKm] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [withDataOnly, setWithDataOnly] = useState<boolean>(true);
  const [benchmark, setBenchmark] = useState<BenchmarkData | null>(null);
  const [itemHistory, setItemHistory] = useState<ItemPriceHistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleRadiusChange(newIndex: number) {
    const clamped = Math.max(0, Math.min(newIndex, RADIUS_STOPS.length - 1));
    setRadiusIndex(clamped);
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
            : catalog[0];
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
          setError("Could not load the ingredient catalogue.");
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

  useEffect(() => {
    if (!selectedItemId) {
      setItemHistory([]);
      return;
    }
    api.getItemPriceHistory(selectedItemId)
      .then(setItemHistory)
      .catch(() => setItemHistory([]));
  }, [selectedItemId]);

  const selectedItem = items.find((i) => i.id === selectedItemId);

  const filteredItems = items
    .filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;
      if (withDataOnly) return item.has_data === true;
      return true;
    })
    .sort((a, b) => {
      if (a.has_data !== b.has_data) return a.has_data ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const yours = benchmark?.tenant_latest_price ?? null;
  const gapPct =
    yours != null && benchmark?.median ? ((yours - benchmark.median) / benchmark.median) * 100 : null;
  const gapAbs = yours != null && benchmark?.median ? yours - benchmark.median : null;

  return (
    <div>
      {/* Page head */}
      <div className="pb-7">
        <span className="eyebrow">Local market</span>
        <h1 className="display-xl mt-2 text-4xl sm:text-[46px]">Benchmarks</h1>
        <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
          What independent kitchens around you actually pay for the same ingredient.
        </p>
      </div>

      {/* Cohort controls */}
      <section className="section-open section-close flex flex-wrap items-end justify-between gap-8 py-5">
        <fieldset className="m-0 min-w-0 flex-[1_1_520px] border-0 p-0">
          <legend className="label-caps pb-2.5">Trade radius</legend>
          <div className="flex flex-wrap gap-2">
            {RADIUS_STOPS.map((stop, idx) => {
              const isActive = idx === radiusIndex;
              return (
                <label
                  key={stop.label}
                  title={stop.sublabel}
                  className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-[13px] transition-colors ${
                    isActive
                      ? "border border-ink bg-ink font-bold text-on-ink"
                      : "border border-edge font-semibold text-ink-soft hover:text-ink"
                  }`}
                >
                  <input
                    type="radio"
                    name="trade-radius"
                    checked={isActive}
                    onChange={() => handleRadiusChange(idx)}
                    className="absolute h-px w-px opacity-0"
                  />
                  {stop.label}
                  {isActive && benchmark && !benchmark.suppressed && (
                    <span className="font-semibold text-ramp-5">
                      {benchmark.n_restaurants} kitchens
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>

        <AuditWindowControl value={windowDays} onChange={setWindowDays} label="Audit window" />
      </section>

      <section className="flex flex-wrap items-start gap-12 pt-9">
        {/* Item list */}
        <div className="min-w-0 max-w-[400px] flex-[1_1_320px]">
          <h2 className="display-sm text-base">Your benchmarkable items</h2>
          <p className="mb-4 mt-1.5 text-xs leading-relaxed text-ink-muted">
            Items with a live local cohort come first.
          </p>

          <label htmlFor="bm-search" className="label-caps block pb-2">
            Find an item
          </label>
          <input
            id="bm-search"
            type="search"
            placeholder={`Search ${items.length} items`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="field"
          />

          <div className="mt-3.5 flex items-center justify-between gap-3">
            <span className="text-xs text-ink-muted">
              {filteredItems.length} shown
            </span>
            <label className="flex cursor-pointer items-center gap-2.5 text-xs text-ink-soft">
              <input
                type="checkbox"
                checked={withDataOnly}
                onChange={() => handleToggleWithDataOnly(!withDataOnly)}
                className="h-4 w-4 accent-[var(--ink)]"
              />
              Live benchmarks only
            </label>
          </div>

          <div className="mt-4 max-h-[560px] overflow-y-auto border-t border-rule">
            {filteredItems.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-xs text-ink-muted">Nothing matches that.</p>
                {withDataOnly && (
                  <button
                    type="button"
                    onClick={() => handleToggleWithDataOnly(false)}
                    className="mt-2 cursor-pointer text-xs font-semibold text-accent hover:underline"
                  >
                    Show every item
                  </button>
                )}
              </div>
            ) : (
              filteredItems.map((item) => {
                const isSelected = item.id === selectedItemId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedItemId(item.id)}
                    className={`flex w-full cursor-pointer items-center justify-between gap-3 border-b border-rule-soft py-3.5 text-left transition-colors hover:bg-panel ${
                      isSelected ? "border-l-[3px] border-l-ink bg-panel pl-3.5" : "pl-[3px]"
                    }`}
                  >
                    <span className="min-w-0">
                      <span
                        className={`block truncate text-sm ${
                          isSelected ? "font-bold text-ink" : "font-semibold text-ink"
                        }`}
                      >
                        {item.name}
                      </span>
                      <span className="num block text-[11px] text-ink-muted">
                        {item.median ? `Median $${money(item.median)}` : "No local median yet"} /
                        {item.base_unit}
                      </span>
                    </span>
                    {!item.has_data && (
                      <span className="shrink-0 rounded-sm bg-chip px-1.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-ink-soft">
                        Pending
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Detail */}
        <div className="min-w-0 flex-[999_1_540px]">
          {loading ? (
            <div className="panel p-12 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <p className="mt-3 text-sm text-ink-soft">Working out the local market…</p>
            </div>
          ) : error ? (
            <div className="flex items-start gap-3 border-t-2 border-over pt-5">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-over" />
              <div>
                <h2 className="display-sm text-base">Benchmark notice</h2>
                <p className="mt-1 text-sm text-ink-soft">{error}</p>
              </div>
            </div>
          ) : benchmark?.suppressed ? (
            <div className="border-t-2 border-ink pt-7">
              <ShieldCheck className="h-7 w-7 text-accent" />
              <h2 className="display-sm mt-4 text-2xl">
                {activeRadiusKm !== null
                  ? `Not enough kitchens within ${activeRadiusKm} km yet`
                  : "Not enough kitchens reporting this yet"}
              </h2>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-soft">
                {benchmark.suppression_reason ||
                  "A benchmark only appears once enough nearby restaurants have invoiced this ingredient, so no single kitchen's pricing can be worked out from it."}
              </p>

              {activeRadiusKm !== null && (
                <div className="mt-6 flex flex-wrap gap-3">
                  <button type="button" onClick={() => handleRadiusChange(0)} className="pill-primary">
                    Let it widen automatically
                  </button>
                  {radiusIndex < RADIUS_STOPS.length - 1 && (
                    <button
                      type="button"
                      onClick={() => handleRadiusChange(radiusIndex + 1)}
                      className="pill-secondary"
                    >
                      Try {RADIUS_STOPS[radiusIndex + 1].label}
                    </button>
                  )}
                </div>
              )}

              <p className="mt-6 text-xs text-ink-muted">
                This fills in on its own as nearby operators upload invoices.
              </p>
            </div>
          ) : (
            benchmark && (
              <>
                {/* Verdict */}
                <div className="pt-6">
                  <div className="flex flex-wrap items-baseline gap-2.5">
                    <h2 className="display-xl text-3xl">{selectedItem?.name || "Select an item"}</h2>
                    <span className="text-sm text-ink-muted">
                      per {selectedItem?.base_unit} &middot; {benchmark.n_restaurants} kitchens
                      {benchmark.radius_km_used ? ` within ${benchmark.radius_km_used} km` : ""}
                    </span>
                  </div>

                  {gapAbs != null && gapPct != null && benchmark.median ? (
                    <p className="display-sm mt-5 max-w-2xl text-[26px] leading-snug">
                      {gapAbs > 0 ? (
                        <>
                          You are paying{" "}
                          <span className="num text-over-ink">
                            ${money(Math.abs(gapAbs))} over
                          </span>{" "}
                          the local median, {gapPct.toFixed(1)}% above what kitchens around you pay.
                        </>
                      ) : (
                        <>
                          You are paying{" "}
                          <span className="num text-under-ink">
                            ${money(Math.abs(gapAbs))} under
                          </span>{" "}
                          the local median. This one is working for you.
                        </>
                      )}
                    </p>
                  ) : (
                    <p className="display-sm mt-5 max-w-2xl text-[26px] leading-snug">
                      The local median is{" "}
                      <span className="num">${money(benchmark.median ?? 0)}</span> per{" "}
                      {selectedItem?.base_unit}. Upload an invoice with this item to see where you sit.
                    </p>
                  )}
                </div>

                {/* Spread */}
                {benchmark.p25 != null && benchmark.p75 != null && benchmark.median != null && (
                  <div className="panel mt-7 px-6 pb-3 pt-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2.5">
                      <h3 className="display-sm text-[13px] uppercase tracking-[0.1em]">
                        Where you sit in the local spread
                      </h3>
                      <span className="text-xs text-ink-muted">Past {windowDays} days</span>
                    </div>
                    <div className="mt-2">
                      <SpreadStrip
                        p25={benchmark.p25}
                        median={benchmark.median}
                        p75={benchmark.p75}
                        yours={yours}
                        baseUnit={selectedItem?.base_unit || "unit"}
                      />
                    </div>
                    <p className="mt-1 pb-2 text-[13px] text-ink-soft">
                      The band is the middle half of the cohort: a quarter of kitchens pay less
                      than ${money(benchmark.p25)}, a quarter pay more than ${money(benchmark.p75)}.
                    </p>
                  </div>
                )}

                {/* Trajectory */}
                <div className="panel mt-6 px-6 pb-4 pt-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2.5 pb-4">
                    <h3 className="display-sm text-[13px] uppercase tracking-[0.1em]">
                      Your price against the market
                    </h3>
                    <span className="text-xs text-ink-muted">
                      {itemHistory.length === 1 ? "1 purchase" : `${itemHistory.length} purchases`}
                    </span>
                  </div>
                  <PriceCreepLineChart
                    history={itemHistory}
                    baseUnit={selectedItem?.base_unit || "unit"}
                    median={benchmark.median}
                    p25={benchmark.p25}
                    p75={benchmark.p75}
                    baselineMedian={benchmark.tenant_latest_price}
                    latestPrice={benchmark.tenant_latest_price}
                    itemName={selectedItem?.name}
                  />
                </div>

                {/* Comparability */}
                <div className="mt-7 flex items-start gap-3.5 border-t border-rule pt-5">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                  <p className="max-w-3xl text-[13px] leading-relaxed text-ink-soft">
                    <strong className="font-semibold text-ink">How this is kept fair. </strong>
                    {benchmark.comparability_caveat}
                  </p>
                </div>
              </>
            )
          )}
        </div>
      </section>
    </div>
  );
}

export default function BenchmarkPage() {
  return (
    <Suspense
      fallback={<div className="p-8 text-center text-sm text-ink-soft">Loading benchmarks…</div>}
    >
      <BenchmarkContent />
    </Suspense>
  );
}
