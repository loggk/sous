"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import { api, ReviewItem, CanonicalItem } from "@/lib/api";
import {
  Sparkles,
  X,
  Search,
  CheckCircle2,
  ArrowRight,
  Package,
  Building2,
  Tag,
  Check,
  ChevronRight,
  Filter,
  Layers,
  SkipForward,
  CornerDownLeft,
  Scale,
  UploadCloud,
} from "lucide-react";
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

  // Global keyboard shortcuts removed per user directive; all interactions are button-driven.

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
        title: "Failed to Resolve Item",
        message: err.message || "An error occurred while resolving item mapping.",
        variant: "danger",
      });
    } finally {
      setResolving(false);
    }
  }

  async function handleDismiss() {
    if (!currentItem) return;
    const confirmed = await confirm({
      title: "Dismiss Mapping",
      message: `Are you sure you want to dismiss "${currentItem?.payload?.raw_description || "this item"}"? It will be skipped and left unmapped in benchmarks.`,
      confirmText: "Dismiss Item",
      cancelText: "Keep Reviewing",
      variant: "warning",
    });
    if (!confirmed) {
      return;
    }

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
        title: "Failed to Dismiss Item",
        message: err.message || "An error occurred while dismissing the item.",
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-200/60 dark:border-slate-800">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#f0f4fa] px-3 py-1 text-xs font-semibold text-[#2f4a7d] dark:bg-[#1a2c4e] dark:text-blue-300">
            <Sparkles className="h-3.5 w-3.5" /> Human-in-the-Loop Mapping
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#1b2b4a] dark:text-slate-100 sm:text-3xl">
            Item Mapping Review
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Map distributor line item descriptions to universal canonical items. Confirmed mappings are permanently cached in your SKU catalog.
          </p>
        </div>

        {/* Review Queue Status Counter */}
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-right shadow-2xs dark:border-slate-800 dark:bg-[#131f37]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Review Queue</span>
            <div className="text-sm font-black text-[#1b2b4a] dark:text-slate-100 flex items-center gap-1.5 justify-end font-mono">
              <span className={`inline-block h-2 w-2 rounded-full ${reviews.length > 0 ? "bg-blue-500 animate-pulse" : "bg-emerald-500"}`} />
              <span>{reviews.length} Pending</span>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs dark:border-slate-800 dark:bg-[#131f37]">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#2f4a7d] dark:border-blue-400 border-t-transparent" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Loading review queue...</p>
        </div>
      ) : reviews.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs space-y-4 dark:border-slate-800 dark:bg-[#131f37]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#1b2b4a] dark:text-slate-100">
              Review Queue Clean & Up-to-Date
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              All invoice line items have been mapped to canonical catalog ingredients. Newly uploaded broadline invoices requiring verification will automatically appear here.
            </p>
          </div>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/benchmarks"
              className="inline-flex items-center gap-2 rounded-xl bg-[#1b2b4a] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#2f4a7d] dark:bg-blue-600 dark:hover:bg-blue-500 transition-colors"
            >
              <Scale className="h-3.5 w-3.5" />
              <span>View Local Benchmarks</span>
            </Link>
            <Link
              href="/invoices"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#0e182c] dark:text-slate-200 dark:hover:bg-slate-800 transition-colors"
            >
              <UploadCloud className="h-3.5 w-3.5" />
              <span>Upload New Invoice</span>
            </Link>
          </div>
        </div>
      ) : (
        /* Split-Pane Master-Detail (Option 1) */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Left Column: Master Queue List (5 cols) */}
          <div className="lg:col-span-5 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#131f37] space-y-3">
            {/* Queue Filter Bar */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter queue items or SKU..."
                  value={queueFilter}
                  onChange={(e) => setQueueFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8.5 pr-3 py-1.5 text-xs outline-none transition-colors focus:border-[#2f4a7d] focus:bg-white dark:border-slate-700 dark:bg-[#0e182c] dark:text-slate-100 dark:focus:border-blue-400 placeholder-slate-400"
                />
              </div>

              {/* Supplier Filter Chips (if multiple suppliers) */}
              {queueSuppliers.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSupplierFilter("all")}
                    className={`cursor-pointer px-2 py-0.5 rounded-md font-semibold whitespace-nowrap transition-colors ${
                      supplierFilter === "all"
                        ? "bg-[#1b2b4a] text-white dark:bg-blue-600"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                  >
                    All ({reviews.length})
                  </button>
                  {queueSuppliers.map((supp) => (
                    <button
                      key={supp}
                      type="button"
                      onClick={() => setSupplierFilter(supp.toLowerCase())}
                      className={`cursor-pointer px-2 py-0.5 rounded-md font-semibold whitespace-nowrap transition-colors ${
                        supplierFilter === supp.toLowerCase()
                          ? "bg-[#1b2b4a] text-white dark:bg-blue-600"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {supp}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Queue Summary Header */}
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 dark:text-slate-500 px-1 pt-1 border-t border-slate-100 dark:border-slate-800">
              <span>{filteredReviews.length} ITEMS TO REVIEW</span>
            </div>

            {/* Scrollable Queue List */}
            <div className="max-h-[580px] overflow-y-auto space-y-2 pr-1">
              {filteredReviews.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                  No queue items match your filter.
                </div>
              ) : (
                filteredReviews.map((item, idx) => {
                  const isSelected = item.id === currentItem?.id;
                  const suggestions = item.payload?.suggested_matches || [];
                  const topSuggestion = suggestions[0];
                  const matchPct = topSuggestion ? Math.round((topSuggestion.similarity || 0) * 100) : 0;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setCurrentIndex(idx)}
                      className={`cursor-pointer w-full text-left p-3.5 rounded-xl border transition-all relative ${
                        isSelected
                          ? "border-[#2f4a7d] bg-[#f0f4fa] shadow-xs ring-1 ring-[#2f4a7d] dark:border-blue-400 dark:bg-[#162544] dark:ring-blue-400"
                          : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/70 dark:border-slate-800 dark:bg-[#0e182c] dark:hover:border-slate-700"
                      }`}
                    >
                      {/* Top Row: Supplier & Match Pill */}
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5">
                          <Building2 className="h-3 w-3 text-slate-400" />
                          <span className="truncate max-w-[120px]">{item.payload?.supplier_name || "Supplier"}</span>
                        </span>

                        {topSuggestion ? (
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              matchPct >= 85
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                                : matchPct >= 70
                                ? "bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800"
                                : "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                            }`}
                          >
                            {matchPct}% Match
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                            Manual search
                          </span>
                        )}
                      </div>

                      {/* Raw Description */}
                      <div className="text-xs font-bold text-[#1b2b4a] dark:text-slate-100 line-clamp-1">
                        {item.payload?.raw_description || "Unknown item"}
                      </div>

                      {/* Target Preview & SKU */}
                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="truncate pr-2 font-medium text-slate-600 dark:text-slate-300">
                          {topSuggestion ? `→ ${topSuggestion.name}` : "Requires selection"}
                        </span>
                        {item.payload?.pack_descriptor && (
                          <span className="font-mono text-[10px] shrink-0 text-slate-400 dark:text-slate-500">
                            {item.payload.pack_descriptor}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Focused Mapping Canvas (7 cols) */}
          {currentItem && (
            <div className="lg:col-span-7 rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800 dark:bg-[#131f37] space-y-6">
              {/* Item Header Banner */}
              <div className="pb-4 border-b border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    RAW INVOICE LINE ITEM ({currentIndex + 1} of {filteredReviews.length})
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <button
                      type="button"
                      disabled={currentIndex === 0}
                      onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                      className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                      title="Previous item"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={currentIndex >= filteredReviews.length - 1}
                      onClick={() => setCurrentIndex((prev) => Math.min(filteredReviews.length - 1, prev + 1))}
                      className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                      title="Next item"
                    >
                      ▼
                    </button>
                  </div>
                </div>

                <div className="text-lg sm:text-xl font-black text-[#1b2b4a] dark:text-slate-100">
                  {currentItem.payload?.raw_description || "Unknown item"}
                </div>

                {/* Metadata Pills */}
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-slate-700 dark:text-slate-300 font-medium">
                    <Building2 className="h-3.5 w-3.5 text-slate-400" />
                    Supplier: <strong>{currentItem.payload?.supplier_name || "Sysco"}</strong>
                  </span>
                  {currentItem.payload?.supplier_sku && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-slate-700 dark:text-slate-300 font-mono">
                      <Tag className="h-3.5 w-3.5 text-slate-400" />
                      SKU: <strong>{currentItem.payload.supplier_sku}</strong>
                    </span>
                  )}
                  {currentItem.payload?.pack_descriptor && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-slate-700 dark:text-slate-300 font-mono">
                      <Package className="h-3.5 w-3.5 text-slate-400" />
                      Descriptor: <strong>{currentItem.payload.pack_descriptor}</strong>
                    </span>
                  )}
                </div>
              </div>

              {/* AI Vector Match Candidates */}
              {currentItem.payload?.suggested_matches && currentItem.payload.suggested_matches.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                      AI Vector Recommendations
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      Click to select recommendation
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {currentItem.payload.suggested_matches.map((s, idx) => {
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
                          className={`cursor-pointer p-3 rounded-xl border text-left transition-all relative ${
                            isSelected
                              ? "border-indigo-600 bg-indigo-50/70 shadow-xs ring-2 ring-indigo-600/30 dark:border-indigo-400 dark:bg-indigo-950/40"
                              : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-[#0e182c] dark:hover:border-slate-700"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1.5">
                            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                              Option {idx + 1}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                matchPct >= 85
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                  : "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300"
                              }`}
                            >
                              {matchPct}% Match
                            </span>
                          </div>

                          <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                            {s.name}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 capitalize truncate">
                            {s.category} • {s.base_unit}
                          </div>

                          {isSelected && (
                            <div className="absolute right-2.5 bottom-2.5 text-indigo-600 dark:text-indigo-400">
                              <Check className="h-4 w-4" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Full Canonical Catalog Search & Dropdown (Collapsible or Search) */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Selected Benchmark Item:
                  </span>
                  <button
                    type="button"
                    onClick={() => setCatalogSearchOpen(!catalogSearchOpen)}
                    className="text-xs font-semibold text-[#2f4a7d] hover:underline dark:text-blue-400 cursor-pointer"
                  >
                    {catalogSearchOpen ? "Close catalog search" : "Search full catalog..."}
                  </button>
                </div>

                {/* Selected Item Preview Pill */}
                {selectedCanonicalItem && (
                  <div className="rounded-xl border border-slate-200 bg-[#f8fafc] p-3 flex items-center justify-between dark:border-slate-800 dark:bg-[#0e182c]">
                    <div className="flex items-center gap-2.5 truncate pr-2">
                      <div className="h-8 w-8 rounded-lg bg-[#2f4a7d]/10 text-[#2f4a7d] flex items-center justify-center shrink-0 dark:bg-blue-400/10 dark:text-blue-400 font-bold text-xs">
                        {selectedCanonicalItem.category[0].toUpperCase()}
                      </div>
                      <div className="truncate">
                        <div className="text-sm font-bold text-[#1b2b4a] dark:text-slate-100 truncate">
                          {selectedCanonicalItem.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                          {selectedCanonicalItem.category} • Standard Unit: <span className="font-mono font-semibold">{selectedCanonicalItem.base_unit}</span>
                        </div>
                      </div>
                    </div>

                    <span className="shrink-0 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 rounded-md">
                      Selected Target
                    </span>
                  </div>
                )}

                {/* Collapsible Full Catalog Search Combobox */}
                {catalogSearchOpen && (
                  <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 dark:border-slate-800 dark:bg-[#0e182c] animate-in fade-in duration-100">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search all benchmark catalog ingredients..."
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-1.5 text-xs outline-none focus:border-[#2f4a7d] focus:bg-white dark:border-slate-700 dark:bg-[#131f37] dark:text-slate-100"
                        autoFocus
                      />
                    </div>

                    <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-100 dark:border-slate-800">
                      {filteredCatalog.slice(0, 15).map((c) => {
                        const isSelected = c.id === selectedCanonicalId;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setSelectedCanonicalId(c.id);
                              setPackMeasure(c.base_unit);
                              setCatalogSearchOpen(false);
                            }}
                            className={`cursor-pointer w-full text-left px-3 py-2 flex items-center justify-between text-xs transition-colors ${
                              isSelected
                                ? "bg-[#f0f4fa] font-bold text-[#1b2b4a] dark:bg-[#1a2c4e] dark:text-blue-100"
                                : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                            }`}
                          >
                            <span className="truncate pr-2">{c.name}</span>
                            <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 shrink-0">
                              {c.category} • /{c.base_unit}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Packaging Conversion Specifications */}
              <div className="rounded-xl border border-slate-200 bg-[#f8fafc] p-4 space-y-3 dark:border-slate-800 dark:bg-[#0e182c]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-[#2f4a7d] dark:text-blue-400" />
                    Packaging Conversion & Math
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    Defines purchase case to benchmark base unit
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Pack Units
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={packUnits}
                      onChange={(e) => setPackUnits(parseInt(e.target.value, 10) || 1)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs sm:text-sm font-mono font-bold text-slate-800 outline-none focus:border-[#2f4a7d] dark:border-slate-700 dark:bg-[#131f37] dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Unit Size
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={packSize}
                      onChange={(e) => setPackSize(parseFloat(e.target.value) || 1)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs sm:text-sm font-mono font-bold text-slate-800 outline-none focus:border-[#2f4a7d] dark:border-slate-700 dark:bg-[#131f37] dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Measure Unit
                    </label>
                    <select
                      value={packMeasure}
                      onChange={(e) => setPackMeasure(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-800 outline-none focus:border-[#2f4a7d] dark:border-slate-700 dark:bg-[#131f37] dark:text-slate-100"
                    >
                      <option value="kg">kg</option>
                      <option value="L">L</option>
                      <option value="each">each</option>
                      <option value="lb">lb</option>
                      <option value="ml">ml</option>
                      <option value="g">g</option>
                    </select>
                  </div>
                </div>

                {/* Conversion Summary Callout */}
                <div className="pt-1 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                  <span>
                    1 Invoiced Case = <strong className="font-mono text-slate-800 dark:text-white">{(packUnits * packSize).toFixed(2)} {packMeasure}</strong>
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    Normalizes to standard <strong className="font-mono">{selectedCanonicalItem?.base_unit || packMeasure}</strong>
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDismiss}
                    disabled={resolving}
                    className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Dismiss Item</span>
                  </button>

                  {filteredReviews.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setCurrentIndex((prev) => (prev + 1) % filteredReviews.length)}
                      className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                    >
                      <SkipForward className="h-3.5 w-3.5" />
                      <span>Skip</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleResolve}
                  disabled={resolving || !selectedCanonicalId}
                  className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-[#1b2b4a] px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow-xs hover:bg-[#2f4a7d] dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-50 transition-all"
                >
                  {resolving ? (
                    <>
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Saving & Caching...</span>
                    </>
                  ) : (
                    <span>Accept & Cache Mapping</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
