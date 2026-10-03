"use client";

import { useEffect, useState, useRef } from "react";
import { api, ReviewItem, CanonicalItem } from "@/lib/api";
import { Sparkles, X, Keyboard, Search, CheckCircle2, ArrowRight } from "lucide-react";

export default function ReviewPage() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [catalog, setCatalog] = useState<CanonicalItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedCanonicalId, setSelectedCanonicalId] = useState<string>("");
  const [packUnits, setPackUnits] = useState<number>(1);
  const [packSize, setPackSize] = useState<number>(1);
  const [packMeasure, setPackMeasure] = useState<string>("kg");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
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

  const currentItem = reviews[currentIndex];

  // Auto-focus search input when navigating items
  useEffect(() => {
    if (currentItem) {
      const desc = currentItem.payload?.raw_description || "";
      const tokens = desc.split(" ")[0];
      setSearchQuery(tokens);
      const match = catalog.find((c) => desc.toLowerCase().includes(c.name.toLowerCase()));
      if (match) {
        setSelectedCanonicalId(match.id);
        setPackMeasure(match.base_unit);
      }
    }
  }, [currentIndex, currentItem, catalog]);

  // Global Keyboard shortcuts: Enter to resolve, 'd' to dismiss
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (document.activeElement?.tagName === "INPUT" && e.key !== "Enter") {
        return;
      }

      if (e.key === "Enter" && !resolving && currentItem && selectedCanonicalId) {
        e.preventDefault();
        handleResolve();
      } else if (e.key.toLowerCase() === "d" && !resolving && currentItem) {
        e.preventDefault();
        handleDismiss();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentItem, selectedCanonicalId, packUnits, packSize, packMeasure, resolving]);

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
      alert("Failed to resolve review item: " + err.message);
    } finally {
      setResolving(false);
    }
  }

  async function handleDismiss() {
    if (!currentItem) return;
    try {
      setResolving(true);
      await api.dismissReview(currentItem.id);
      const nextReviews = reviews.filter((r) => r.id !== currentItem.id);
      setReviews(nextReviews);
      if (currentIndex >= nextReviews.length) {
        setCurrentIndex(Math.max(0, nextReviews.length - 1));
      }
    } catch (err: any) {
      alert("Failed to dismiss review item: " + err.message);
    } finally {
      setResolving(false);
    }
  }

  const filteredCatalog = catalog.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">
            <Sparkles className="h-4 w-4" /> Human-in-the-Loop Normalization
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
            Mapping Review Queue
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Resolve unmapped broadline items into universal canonical ingredients. Mappings are permanently cached in <code className="text-xs font-mono bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">sku_mappings</code>.
          </p>
        </div>

        {/* Keyboard Helper Badge */}
        <div className="hidden sm:flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          <Keyboard className="h-4 w-4 text-orange-600" />
          <span>
            <kbd className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 font-mono font-bold">↵ Enter</kbd> Accept |{" "}
            <kbd className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 font-mono font-bold">d</kbd> Dismiss
          </span>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-orange-600 border-t-transparent" />
          <p className="mt-3 text-sm text-zinc-500">Loading review queue...</p>
        </div>
      ) : reviews.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Review Queue Empty
          </h3>
          <p className="text-sm text-zinc-500 max-w-sm mx-auto">
            All invoice line items have been successfully resolved and mapped to the canonical catalogue.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-6">
          {/* Progress Indicator */}
          <div className="flex items-center justify-between text-xs text-zinc-500 pb-4 border-b border-zinc-100 dark:border-zinc-800">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
              Item {currentIndex + 1} of {reviews.length} pending
            </span>
            <div className="flex gap-1.5">
              {reviews.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-6 rounded-full transition-colors ${
                    i === currentIndex ? "bg-orange-600" : "bg-zinc-200 dark:bg-zinc-800"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Unmapped Line Item Card */}
          <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-5 dark:border-orange-900/40 dark:bg-orange-950/20 space-y-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400">
              Raw Supplier Invoice Line
            </span>
            <div className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
              {currentItem?.payload?.raw_description || "Unknown item"}
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-zinc-600 dark:text-zinc-300">
              <div>
                Supplier: <strong>{currentItem?.payload?.supplier_name || "Sysco"}</strong>
              </div>
              <div>
                SKU: <strong className="font-mono">{currentItem?.payload?.supplier_sku || "N/A"}</strong>
              </div>
              <div>
                Pack Descriptor: <strong className="font-mono">{currentItem?.payload?.pack_descriptor || "EA"}</strong>
              </div>
            </div>
          </div>

          {/* Canonical Target Picker */}
          <div className="space-y-4">
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Map to Canonical Ingredient
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search canonical item names..."
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-orange-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            <div className="max-h-56 overflow-y-auto rounded-xl border border-zinc-200 divide-y divide-zinc-100 dark:border-zinc-700 dark:divide-zinc-800">
              {filteredCatalog.slice(0, 10).map((c) => {
                const isSelected = c.id === selectedCanonicalId;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedCanonicalId(c.id);
                      setPackMeasure(c.base_unit);
                    }}
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between text-sm transition-colors ${
                      isSelected
                        ? "bg-orange-50 font-semibold text-orange-900 dark:bg-orange-950/60 dark:text-orange-200"
                        : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/50"
                    }`}
                  >
                    <span>{c.name}</span>
                    <span className="text-xs font-mono text-zinc-400">Base Unit: {c.base_unit}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Packaging Math Specifications */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Pack Units</label>
              <input
                type="number"
                min="1"
                value={packUnits}
                onChange={(e) => setPackUnits(parseInt(e.target.value) || 1)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Pack Size</label>
              <input
                type="number"
                step="0.01"
                value={packSize}
                onChange={(e) => setPackSize(parseFloat(e.target.value) || 1)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Pack Measure</label>
              <select
                value={packMeasure}
                onChange={(e) => setPackMeasure(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="kg">kg</option>
                <option value="L">L</option>
                <option value="each">each</option>
                <option value="lb">lb</option>
                <option value="ml">ml</option>
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <button
              onClick={handleDismiss}
              disabled={resolving}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <X className="h-4 w-4" /> Dismiss (d)
            </button>

            <button
              onClick={handleResolve}
              disabled={resolving || !selectedCanonicalId}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-500/20 hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              {resolving ? "Saving to cache..." : "Accept & Cache Mapping (Enter)"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

