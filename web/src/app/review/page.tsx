"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import { api, ReviewItem, CanonicalItem } from "@/lib/api";
import { Check, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { useConfirm } from "@/context/ConfirmContext";

export default function ReviewPage() {
  const { confirm, alert } = useConfirm();
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [catalog, setCatalog] = useState<CanonicalItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedCanonicalId, setSelectedCanonicalId] = useState<string>("");
  const [packUnits, setPackUnits] = useState<number>(1);
  const [packSize, setPackSize] = useState<number>(1);
  const [packMeasure, setPackMeasure] = useState<string>("kg");
  const [searchQuery, setSearchQuery] = useState("");
  const [queueFilter, setQueueFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [catalogSearchOpen, setCatalogSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  async function loadData() {
    try {
      setLoading(true);
      const [pendingReviews, items] = await Promise.all([
        api.getPendingReviews(),
        api.getCatalogItems("", false),
      ]);
      setReviews(pendingReviews);
      setCatalog(items);
      if (items.length > 0) {
        setSelectedCanonicalId(items[0].id);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Filter queue items based on search query and supplier
  const filteredReviews = useMemo(() => {
    return reviews.filter((item) => {
      const desc = (item.payload?.raw_description || "").toLowerCase();
      const sku = (item.payload?.supplier_sku || "").toLowerCase();
      const supp = (item.payload?.supplier_name || "").toLowerCase();

      const matchesSearch =
        !queueFilter.trim() ||
        desc.includes(queueFilter.toLowerCase()) ||
        sku.includes(queueFilter.toLowerCase()) ||
        supp.includes(queueFilter.toLowerCase());

      const matchesSupplier =
        supplierFilter === "all" ||
        supp === supplierFilter.toLowerCase();

      return matchesSearch && matchesSupplier;
    });
  }, [reviews, queueFilter, supplierFilter]);

  // Unique list of suppliers present in the queue
  const queueSuppliers = useMemo(() => {
    const set = new Set<string>();
    reviews.forEach((r) => {
      if (r.payload?.supplier_name) {
        set.add(r.payload.supplier_name);
      }
    });
    return Array.from(set);
  }, [reviews]);

  const currentItem = filteredReviews[currentIndex] || reviews[currentIndex];

  // Helper to extract intelligent default packaging from descriptor (e.g. "6/5LB", "1/16L", "2KG")
  const parseDescriptorDefaults = (desc?: string, fallbackBaseUnit = "kg") => {
    if (!desc) return { units: 1, size: 1, measure: fallbackBaseUnit };
    const clean = desc.trim().toUpperCase();

    // Multi-pack pattern: 6/5LB or 6/5 LB
    const slashMatch = clean.match(/^(\d+)\s*\/\s*(\d+(?:\.\d+)?)\s*([A-Z#]+)?$/);
    if (slashMatch) {
      const units = parseInt(slashMatch[1], 10) || 1;
      const size = parseFloat(slashMatch[2]) || 1;
      const rawUnit = (slashMatch[3] || fallbackBaseUnit).toLowerCase();
      const measure = rawUnit === "lb" || rawUnit === "#" ? "lb" : rawUnit === "l" ? "L" : rawUnit;
      return { units, size, measure };
    }

    // "X" pattern: 2x5KG
    const xMatch = clean.match(/^(\d+)\s*[Xx]\s*(\d+(?:\.\d+)?)\s*([A-Z#]+)?$/);
    if (xMatch) {
      const units = parseInt(xMatch[1], 10) || 1;
      const size = parseFloat(xMatch[2]) || 1;
      const rawUnit = (xMatch[3] || fallbackBaseUnit).toLowerCase();
      const measure = rawUnit === "lb" || rawUnit === "#" ? "lb" : rawUnit === "l" ? "L" : rawUnit;
      return { units, size, measure };
    }

    // Single pack: 20LB or 16L
    const singleMatch = clean.match(/^(\d+(?:\.\d+)?)\s*([A-Z#]+)$/);
    if (singleMatch) {
      const size = parseFloat(singleMatch[1]) || 1;
      const rawUnit = singleMatch[2].toLowerCase();
      const measure = rawUnit === "lb" || rawUnit === "#" ? "lb" : rawUnit === "l" ? "L" : rawUnit;
      return { units: 1, size, measure };
    }

    return { units: 1, size: 1, measure: fallbackBaseUnit };
  };

  // Sync state whenever selected item changes
  useEffect(() => {
    if (currentItem) {
      const suggestions = currentItem.payload?.suggested_matches || [];
      const parsed = parseDescriptorDefaults(
        currentItem.payload?.pack_descriptor,
        suggestions[0]?.base_unit || "kg"
      );

      setPackUnits(parsed.units);
      setPackSize(parsed.size);

      if (suggestions.length > 0) {
        const top = suggestions[0];
        setSelectedCanonicalId(top.id);
        setPackMeasure(top.base_unit || parsed.measure);
        setSearchQuery(top.name);
        setCatalogSearchOpen(false);
      } else {
        const desc = currentItem.payload?.raw_description || "";
        const token = desc.split(" ")[0];
        setSearchQuery(token);
        const match = catalog.find((c) => desc.toLowerCase().includes(c.name.toLowerCase()));
        if (match) {
          setSelectedCanonicalId(match.id);
          setPackMeasure(match.base_unit);
        }
        setCatalogSearchOpen(true);
      }
    }
  }, [currentIndex, currentItem, catalog]);

  async function handleResolve() {
    if (!currentItem || !selectedCanonicalId) return;
    try {
      setResolving(true);
      await api.resolveReview(
        currentItem.id,
        selectedCanonicalId,
        packUnits,
        packSize,
        packMeasure
      );

      const nextReviews = reviews.filter((r) => r.id !== currentItem.id);
      setReviews(nextReviews);
      if (currentIndex >= nextReviews.length) {
        setCurrentIndex(Math.max(0, nextReviews.length - 1));
      }
    } catch (err: any) {
      await alert({
        title: "Couldn't save that mapping",
        message: err.message || "Something went wrong while saving.",
        variant: "danger",
      });
    } finally {
      setResolving(false);
    }
  }

  async function handleDismiss() {
    if (!currentItem) return;
    const confirmed = await confirm({
      title: "Skip this line?",
      message: `“${currentItem?.payload?.raw_description || "This item"}” stays unmapped, so it won't count towards your categories or benchmarks.`,
      confirmText: "Skip it",
      cancelText: "Keep reviewing",
      variant: "warning",
    });
    if (!confirmed) return;

    try {
      setResolving(true);
      await api.dismissReview(currentItem.id);
      const nextReviews = reviews.filter((r) => r.id !== currentItem.id);
      setReviews(nextReviews);
      if (currentIndex >= nextReviews.length) {
        setCurrentIndex(Math.max(0, nextReviews.length - 1));
      }
    } catch (err: any) {
      await alert({
        title: "Couldn't skip that line",
        message: err.message || "Something went wrong.",
        variant: "danger",
      });
    } finally {
      setResolving(false);
    }
  }

  const selectedCanonicalItem = catalog.find((c) => c.id === selectedCanonicalId);

  const filteredCatalog = catalog.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const suggestions = currentItem?.payload?.suggested_matches || [];
  const caseTotal = packUnits * packSize;

  return (
    <div>
      {/* Page head */}
      <div className="pb-7">
        <span className="eyebrow">Your call, not the machine&rsquo;s</span>
        <h1 className="display-xl mt-2 text-4xl sm:text-[46px]">Item Mapping</h1>
        <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Suppliers write the same ingredient a dozen different ways. Confirm what each line really
          is once, and Sous remembers it for every invoice after.
        </p>
      </div>

      {loading ? (
        <div className="section-open py-16 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="mt-3 text-sm text-ink-soft">Loading the queue…</p>
        </div>
      ) : reviews.length === 0 ? (
        <div className="section-open pt-8">
          <CheckCircle2 className="h-8 w-8 text-under" />
          <h2 className="display-xl mt-4 text-3xl">Nothing left to confirm</h2>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-soft">
            Every invoice line is mapped to a catalogue ingredient. Anything new that needs your eye
            will turn up here on its own.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/benchmarks" className="pill-primary no-underline">
              See your benchmarks
            </Link>
            <Link href="/invoices" className="pill-secondary no-underline">
              Upload an invoice
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* What's at stake */}
          <section className="section-open section-close flex flex-wrap items-center justify-between gap-8 py-7">
            <div className="min-w-0 flex-[1_1_480px]">
              <p className="display-sm max-w-2xl text-[25px] leading-snug">
                {reviews.length} {reviews.length === 1 ? "line is" : "lines are"} waiting. Until they
                are mapped they sit outside your category totals and benchmarks.
              </p>
              <p className="mt-3 text-sm text-ink-soft">
                Most take one click. The top suggestion is usually the right one.
              </p>
            </div>
            <div className="flex-[0_1_260px]">
              <span className="label-caps">In the queue</span>
              <div className="num display-xl mt-1.5 text-4xl">{reviews.length}</div>
              <p className="mt-1.5 text-xs text-ink-muted">
                {catalog.length} ingredients in the catalogue to match against
              </p>
            </div>
          </section>

          <section className="flex flex-wrap items-start gap-11 pt-8">
            {/* Queue */}
            <div className="min-w-0 max-w-[400px] flex-[1_1_320px]">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="display-sm text-base">The queue</h2>
                <span className="text-xs text-ink-muted">{filteredReviews.length} shown</span>
              </div>

              <label htmlFor="q-filter" className="label-caps mt-3.5 block pb-2">
                Filter
              </label>
              <input
                id="q-filter"
                type="search"
                value={queueFilter}
                onChange={(e) => {
                  setQueueFilter(e.target.value);
                  setCurrentIndex(0);
                }}
                placeholder="Description or supplier SKU"
                className="field"
              />

              {queueSuppliers.length > 1 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSupplierFilter("all");
                      setCurrentIndex(0);
                    }}
                    className={`min-h-9 cursor-pointer rounded-full px-3 text-xs transition-colors ${
                      supplierFilter === "all"
                        ? "border border-ink bg-ink font-bold text-on-ink"
                        : "border border-edge font-semibold text-ink-soft hover:text-ink"
                    }`}
                  >
                    All suppliers
                  </button>
                  {queueSuppliers.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setSupplierFilter(s);
                        setCurrentIndex(0);
                      }}
                      className={`min-h-9 cursor-pointer rounded-full px-3 text-xs transition-colors ${
                        supplierFilter === s
                          ? "border border-ink bg-ink font-bold text-on-ink"
                          : "border border-edge font-semibold text-ink-soft hover:text-ink"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-5 border-t border-rule">
                {filteredReviews.length === 0 ? (
                  <p className="py-10 text-center text-xs text-ink-muted">Nothing matches that.</p>
                ) : (
                  filteredReviews.map((item, idx) => {
                    const isCurrent = idx === currentIndex;
                    const topMatch = item.payload?.suggested_matches?.[0];
                    const confidence = topMatch ? Math.round((topMatch.similarity || 0) * 100) : null;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setCurrentIndex(idx)}
                        className={`block w-full border-b border-rule-soft py-3.5 text-left transition-colors hover:bg-panel ${
                          isCurrent ? "border-l-[3px] border-l-ink bg-panel pl-3.5" : "pl-[3px]"
                        }`}
                      >
                        <span className="flex items-baseline justify-between gap-3">
                          <span
                            className={`truncate text-[13.5px] ${
                              isCurrent ? "font-bold text-ink" : "font-semibold text-ink"
                            }`}
                          >
                            {item.payload?.raw_description || "Unknown line"}
                          </span>
                          {confidence !== null && (
                            <span
                              className={`num shrink-0 text-xs font-bold ${
                                confidence >= 85 ? "text-under-ink" : "text-over-ink"
                              }`}
                            >
                              {confidence}% sure
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-ink-muted">
                          {item.payload?.supplier_name || "Unknown supplier"}
                          {item.payload?.supplier_sku ? ` · SKU ${item.payload.supplier_sku}` : ""}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Mapping panel */}
            {currentItem && (
              <div className="min-w-0 flex-[999_1_540px]">
                <div className="flex flex-wrap items-center justify-between gap-3 pt-5">
                  <span className="label-caps">
                    Line {currentIndex + 1} of {filteredReviews.length} · as printed on the invoice
                  </span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      aria-label="Previous line"
                      disabled={currentIndex === 0}
                      onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                      className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-edge text-ink transition-colors hover:bg-panel disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Next line"
                      disabled={currentIndex >= filteredReviews.length - 1}
                      onClick={() =>
                        setCurrentIndex((prev) => Math.min(filteredReviews.length - 1, prev + 1))
                      }
                      className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-edge text-ink transition-colors hover:bg-panel disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </span>
                </div>

                <h2 className="display-xl mt-3 text-2xl leading-tight sm:text-[32px]">
                  {currentItem.payload?.raw_description || "Unknown item"}
                </h2>

                <div className="mt-3.5 flex flex-wrap gap-2">
                  <span className="rounded-sm bg-chip px-2.5 py-1.5 text-[12.5px] text-ink">
                    Supplier{" "}
                    <strong className="font-semibold">
                      {currentItem.payload?.supplier_name || "unknown"}
                    </strong>
                  </span>
                  {currentItem.payload?.supplier_sku && (
                    <span className="rounded-sm bg-chip px-2.5 py-1.5 text-[12.5px] text-ink">
                      SKU <strong className="font-semibold">{currentItem.payload.supplier_sku}</strong>
                    </span>
                  )}
                  {currentItem.payload?.pack_descriptor && (
                    <span className="rounded-sm bg-chip px-2.5 py-1.5 text-[12.5px] text-ink">
                      Pack{" "}
                      <strong className="font-semibold">{currentItem.payload.pack_descriptor}</strong>
                    </span>
                  )}
                </div>

                {/* Suggestions */}
                {suggestions.length > 0 && (
                  <div className="mt-8">
                    <div className="flex flex-wrap items-baseline justify-between gap-2.5 border-b border-rule pb-2.5">
                      <h3 className="display-sm text-[11px] uppercase tracking-[0.18em]">
                        What Sous thinks this is
                      </h3>
                      <span className="text-xs text-ink-muted">
                        Pick one, or search the catalogue below
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {suggestions.map((s) => {
                        const isSelected = selectedCanonicalId === s.id;
                        const matchPct = Math.round((s.similarity || 0) * 100);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setSelectedCanonicalId(s.id);
                              setPackMeasure(s.base_unit || "kg");
                              setSearchQuery(s.name);
                              setCatalogSearchOpen(false);
                            }}
                            className={`min-h-11 cursor-pointer rounded p-4 text-left transition-colors ${
                              isSelected
                                ? "border-2 border-ink bg-panel"
                                : "border border-edge hover:bg-panel"
                            }`}
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span
                                className={`num text-[11.5px] font-bold ${
                                  matchPct >= 85 ? "text-under-ink" : "text-ink-soft"
                                }`}
                              >
                                {matchPct}% sure
                              </span>
                              {isSelected && (
                                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-ink">
                                  <Check className="h-3 w-3 text-on-ink" />
                                </span>
                              )}
                            </span>
                            <span
                              className={`mt-2 block truncate text-[15px] ${
                                isSelected ? "font-bold text-ink" : "font-semibold text-ink"
                              }`}
                            >
                              {s.name}
                            </span>
                            <span className="mt-0.5 block truncate text-xs capitalize text-ink-muted">
                              {s.category} &middot; priced per {s.base_unit}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Catalogue search */}
                <div className="mt-5">
                  <label htmlFor="cat-search" className="label-caps block pb-2">
                    {suggestions.length > 0
                      ? `Or search all ${catalog.length} catalogue ingredients`
                      : `Search all ${catalog.length} catalogue ingredients`}
                  </label>
                  <input
                    id="cat-search"
                    ref={searchInputRef}
                    type="search"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCatalogSearchOpen(true);
                    }}
                    onFocus={() => setCatalogSearchOpen(true)}
                    placeholder="Start typing an ingredient name"
                    className="field"
                  />

                  {selectedCanonicalItem && !catalogSearchOpen && (
                    <p className="mt-2.5 text-[13px] text-ink-soft">
                      Mapping to{" "}
                      <strong className="font-semibold text-ink">{selectedCanonicalItem.name}</strong>{" "}
                      <span className="capitalize text-ink-muted">
                        ({selectedCanonicalItem.category} · per {selectedCanonicalItem.base_unit})
                      </span>{" "}
                      <button
                        type="button"
                        onClick={() => setCatalogSearchOpen(true)}
                        className="cursor-pointer font-semibold text-accent hover:underline"
                      >
                        change
                      </button>
                    </p>
                  )}

                  {catalogSearchOpen && (
                    <div className="mt-3 max-h-56 overflow-y-auto border-t border-rule">
                      {filteredCatalog.length === 0 ? (
                        <p className="py-6 text-center text-xs text-ink-muted">
                          Nothing in the catalogue matches that.
                        </p>
                      ) : (
                        filteredCatalog.slice(0, 40).map((c) => {
                          const isSelected = c.id === selectedCanonicalId;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setSelectedCanonicalId(c.id);
                                setPackMeasure(c.base_unit);
                                setSearchQuery(c.name);
                                setCatalogSearchOpen(false);
                              }}
                              className={`flex w-full cursor-pointer items-center justify-between gap-3 border-b border-rule-soft px-1 py-2.5 text-left text-[13.5px] transition-colors hover:bg-panel ${
                                isSelected ? "font-bold text-ink" : "text-ink-soft"
                              }`}
                            >
                              <span className="truncate">{c.name}</span>
                              <span className="shrink-0 text-[11.5px] capitalize text-ink-muted">
                                {c.category} · {c.base_unit}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {/* Pack maths */}
                <div className="panel mt-8 px-6 py-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2.5">
                    <h3 className="display-sm text-[11px] uppercase tracking-[0.18em]">
                      How the case breaks down
                    </h3>
                    <span className="text-xs text-ink-muted">
                      {currentItem.payload?.pack_descriptor
                        ? `Read from “${currentItem.payload.pack_descriptor}”. Correct it if it's wrong`
                        : "Set this so the unit price can be compared"}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                    <div>
                      <label htmlFor="pk-units" className="block pb-2 text-xs font-semibold text-ink-soft">
                        Units in the case
                      </label>
                      <input
                        id="pk-units"
                        type="number"
                        min="1"
                        value={packUnits}
                        onChange={(e) => setPackUnits(parseInt(e.target.value, 10) || 1)}
                        className="h-11 w-full rounded border border-edge bg-panel px-3.5 text-[15px] font-semibold text-ink outline-none focus:border-accent"
                      />
                    </div>
                    <div>
                      <label htmlFor="pk-size" className="block pb-2 text-xs font-semibold text-ink-soft">
                        Size of each
                      </label>
                      <input
                        id="pk-size"
                        type="number"
                        step="0.01"
                        value={packSize}
                        onChange={(e) => setPackSize(parseFloat(e.target.value) || 1)}
                        className="h-11 w-full rounded border border-edge bg-panel px-3.5 text-[15px] font-semibold text-ink outline-none focus:border-accent"
                      />
                    </div>
                    <div>
                      <label htmlFor="pk-measure" className="block pb-2 text-xs font-semibold text-ink-soft">
                        Measured in
                      </label>
                      <div className="relative">
                        <select
                          id="pk-measure"
                          value={packMeasure}
                          onChange={(e) => setPackMeasure(e.target.value)}
                          className="h-11 w-full cursor-pointer appearance-none rounded border border-edge bg-panel pl-3.5 pr-10 text-[15px] font-semibold text-ink outline-none focus:border-accent"
                        >
                          <option value="kg">kg</option>
                          <option value="L">L</option>
                          <option value="each">each</option>
                          <option value="lb">lb</option>
                          <option value="ml">ml</option>
                          <option value="g">g</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                      </div>
                    </div>
                  </div>

                  <p className="display-sm mt-5 text-[19px] leading-snug">
                    One case = <span className="num">{caseTotal.toFixed(2)} {packMeasure}</span>
                    {selectedCanonicalItem && (
                      <>
                        , normalised to{" "}
                        <span className="text-accent">{selectedCanonicalItem.base_unit}</span> for
                        comparison.
                      </>
                    )}
                  </p>
                </div>

                {/* Actions */}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-5">
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleResolve}
                      disabled={resolving || !selectedCanonicalId}
                      className="pill-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {resolving ? "Saving…" : "Confirm & remember"}
                    </button>
                    <button
                      type="button"
                      onClick={handleDismiss}
                      disabled={resolving}
                      className="pill-secondary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Skip this line
                    </button>
                  </div>
                  <span className="text-xs text-ink-muted">
                    Confirming caches this SKU, so the next invoice maps itself.
                  </span>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
