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

  // Auto-focus search input or pre-select top AI match when navigating items
  useEffect(() => {
    if (currentItem) {
      const suggestions = currentItem.payload?.suggested_matches || [];
      if (suggestions.length > 0) {
        const top = suggestions[0];
        setSelectedCanonicalId(top.id);
        setPackMeasure(top.base_unit || "kg");
        setSearchQuery(top.name);
      } else {
        const desc = currentItem.payload?.raw_description || "";
        const tokens = desc.split(" ")[0];
        setSearchQuery(tokens);
        const match = catalog.find((c) => desc.toLowerCase().includes(c.name.toLowerCase()));
        if (match) {
          setSelectedCanonicalId(match.id);
          setPackMeasure(match.base_unit);
        }
      }
    }
  }, [currentIndex, currentItem, catalog]);

  // Global Keyboard shortcuts: Enter to resolve, 'd' to dismiss, '1-3' for top AI matches
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (document.activeElement?.tagName === "INPUT" && e.key !== "Enter") {
        return;
      }

      // Quick select AI suggestions via number keys [1-3]
      if (["1", "2", "3"].includes(e.key) && currentItem?.payload?.suggested_matches) {
        const idx = parseInt(e.key) - 1;
        const candidate = currentItem.payload.suggested_matches[idx];
        if (candidate) {
          e.preventDefault();
          setSelectedCanonicalId(candidate.id);
          setPackMeasure(candidate.base_unit || "kg");
          setSearchQuery(candidate.name);
          return;
        }
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
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-200/60 dark:border-slate-800">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#f0f4fa] px-3 py-1 text-xs font-semibold text-[#2f4a7d] dark:bg-[#1a2c4e] dark:text-blue-300">
            <Sparkles className="h-3.5 w-3.5" /> Human-in-the-Loop Mapping
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#1b2b4a] dark:text-slate-100 sm:text-3xl">
            Item Mapping Review
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Map supplier-specific line item descriptions to universal canonical items. Confirmed mappings are permanently cached in <code className="text-xs font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700 dark:bg-slate-800 dark:text-slate-300">sku_mappings</code>.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs dark:border-slate-800 dark:bg-[#131f37]">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#2f4a7d] dark:border-blue-400 border-t-transparent" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Loading review queue...</p>
        </div>
      ) : reviews.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs space-y-3 dark:border-slate-800 dark:bg-[#131f37]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-[#1b2b4a] dark:text-slate-100">
            Review Queue Clean & Up-to-Date
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            All invoice line items have been mapped to canonical catalog ingredients. Newly uploaded broadline items requiring review will appear here.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-6 dark:border-slate-800 dark:bg-[#131f37]">
          {/* Progress Indicator */}
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pb-4 border-b border-slate-100 dark:border-slate-800">
            <span className="font-semibold text-[#1b2b4a] dark:text-slate-100">
              Item {currentIndex + 1} of {reviews.length} pending
            </span>
            <div className="flex gap-1.5">
              {reviews.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-6 rounded-full transition-colors ${
                    i === currentIndex ? "bg-[#2f4a7d] dark:bg-blue-500" : "bg-slate-200 dark:bg-slate-800"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Unmapped Line Item Card */}
          <div className="rounded-xl border border-slate-200 bg-[#f8fafc] p-5 space-y-3 dark:border-slate-800 dark:bg-[#0e182c]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#2f4a7d] dark:text-blue-300">
              Raw Supplier Invoice Line
            </span>
            <div className="text-xl font-bold text-[#1b2b4a] dark:text-slate-100">
              {currentItem?.payload?.raw_description || "Unknown item"}
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-400">
              <div>
                Supplier: <strong className="text-slate-800 dark:text-slate-200">{currentItem?.payload?.supplier_name || "Sysco"}</strong>
              </div>
              <div>
                SKU: <strong className="font-mono text-slate-800 dark:text-slate-200">{currentItem?.payload?.supplier_sku || "N/A"}</strong>
              </div>
              <div>
                Pack Descriptor: <strong className="font-mono text-slate-800 dark:text-slate-200">{currentItem?.payload?.pack_descriptor || "EA"}</strong>
              </div>
            </div>
          </div>

          {/* AI Vector Match Suggestions */}
          {currentItem?.payload?.suggested_matches && currentItem.payload.suggested_matches.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3" /> AI Vector Suggestions
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">Press [1-3] or click to select</span>
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
                      }}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? "border-indigo-600 bg-indigo-50/70 shadow-xs ring-1 ring-indigo-600 dark:border-indigo-400 dark:bg-indigo-950/40"
                          : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-[#0e182c] dark:hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          [{idx + 1}]
                        </span>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                          {matchPct}% Match
                        </span>
                      </div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {s.name}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                        {s.category} • {s.base_unit}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Canonical Target Picker */}
          <div className="space-y-4">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Map to Canonical Ingredient
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search canonical item names..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm outline-none transition-colors focus:border-[#2f4a7d] focus:bg-white focus:ring-1 focus:ring-[#2f4a7d] dark:border-slate-700 dark:bg-[#0e182c] dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-blue-400 dark:focus:bg-[#0e182c]"
              />
            </div>

            <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 dark:border-slate-700 dark:divide-slate-800">
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
                        ? "bg-[#f0f4fa] font-semibold text-[#1b2b4a] border-l-4 border-l-[#2f4a7d] dark:bg-[#1a2c4e] dark:text-blue-100 dark:border-blue-400"
                        : "text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-[#1a2c4e]/40"
                    }`}
                  >
                    <span>{c.name}</span>
                    <span className="text-xs font-mono text-slate-400 dark:text-slate-500">Base Unit: {c.base_unit}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Packaging Math Specifications */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Pack Units</label>
              <input
                type="number"
                min="1"
                value={packUnits}
                onChange={(e) => setPackUnits(parseInt(e.target.value) || 1)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-[#2f4a7d] focus:ring-1 focus:ring-[#2f4a7d] dark:border-slate-700 dark:bg-[#0e182c] dark:text-slate-100 dark:focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Pack Size</label>
              <input
                type="number"
                step="0.01"
                value={packSize}
                onChange={(e) => setPackSize(parseFloat(e.target.value) || 1)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-[#2f4a7d] focus:ring-1 focus:ring-[#2f4a7d] dark:border-slate-700 dark:bg-[#0e182c] dark:text-slate-100 dark:focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Pack Measure</label>
              <select
                value={packMeasure}
                onChange={(e) => setPackMeasure(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-[#2f4a7d] focus:ring-1 focus:ring-[#2f4a7d] dark:border-slate-700 dark:bg-[#0e182c] dark:text-slate-100 dark:focus:border-blue-400"
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
          <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={handleDismiss}
              disabled={resolving}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="h-4 w-4" /> Dismiss (d)
            </button>

            <button
              onClick={handleResolve}
              disabled={resolving || !selectedCanonicalId}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1b2b4a] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#2f4a7d] dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-50 transition-colors"
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

