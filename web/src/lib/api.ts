const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface SpendSummary {
  total_spend: number;
  by_category: Record<string, number>;
  by_supplier: Record<string, number>;
  fees_total: number;
}

export interface PriceAlert {
  canonical_item_id: string;
  item_name: string;
  base_unit: string;
  latest_price: number;
  baseline_median: number;
  percent_increase: number;
  estimated_dollar_impact: number;
  classification: string;
}

export interface CanonicalItem {
  id: string;
  name: string;
  category: string;
  base_unit: string;
  benchmarkable: boolean;
}

export interface BenchmarkData {
  canonical_item_id: string;
  canonical_item_name?: string;
  base_unit?: string;
  p25?: number | null;
  median?: number | null;
  p75?: number | null;
  n_restaurants: number;
  radius_km_used?: number | null;
  window_start?: string | null;
  window_end?: string | null;
  suppressed: boolean;
  suppression_reason?: string | null;
  tenant_latest_price?: number | null;
  comparability_caveat: string;
}

export interface InvoiceSummary {
  id: string;
  invoice_number: string;
  file_name?: string | null;
  invoice_date: string;
  supplier_id: string;
  supplier_name?: string | null;
  subtotal?: number | null;
  tax?: number | null;
  total: number;
  validation_status: string;
}

export interface InvoiceLine {
  id: string;
  line_index: number;
  raw_description: string;
  supplier_sku?: string | null;
  quantity: number;
  pack_descriptor?: string | null;
  unit_price: number;
  line_total: number;
  line_kind: string;
  price_per_base_unit?: number | null;
  canonical_item_id?: string | null;
}

export interface InvoiceDetail extends InvoiceSummary {
  delivery_date?: string | null;
  extraction_provider?: string | null;
  lines: InvoiceLine[];
}

export interface ReviewItem {
  id: string;
  kind: string;
  invoice_id?: string | null;
  invoice_line_id?: string | null;
  status: string;
  payload?: {
    raw_description?: string;
    supplier_sku?: string;
    pack_descriptor?: string;
    supplier_name?: string;
    errors?: string[];
  } | null;
}

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let token: string | null = null;
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token || null;
  } catch {
    // Supabase credentials not set or in offline mode
  }

  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(url, { ...options, headers });
}

export const api = {
  async getHealth() {
    const res = await authFetch(`${API_BASE_URL}/health`);
    return res.json();
  },

  async getSpendSummary(days = 90): Promise<SpendSummary> {
    const res = await authFetch(`${API_BASE_URL}/audit/spend?days=${days}`);
    if (!res.ok) throw new Error("Failed to fetch spend summary");
    return res.json();
  },

  async getPriceAlerts(): Promise<PriceAlert[]> {
    const res = await authFetch(`${API_BASE_URL}/audit/alerts`);
    if (!res.ok) throw new Error("Failed to fetch price alerts");
    return res.json();
  },

  async getCatalogItems(query = "", benchmarkableOnly = false): Promise<CanonicalItem[]> {
    const params = new URLSearchParams();
    if (query) params.append("q", query);
    if (benchmarkableOnly) params.append("benchmarkable_only", "true");
    const res = await authFetch(`${API_BASE_URL}/catalog/items?${params.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch catalog items");
    return res.json();
  },

  async getBenchmark(canonicalItemId: string, windowDays = 90): Promise<BenchmarkData> {
    const res = await authFetch(`${API_BASE_URL}/benchmarks/${canonicalItemId}?window_days=${windowDays}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to fetch benchmark" }));
      throw new Error(err.detail || "Failed to fetch benchmark");
    }
    return res.json();
  },

  async getInvoices(): Promise<InvoiceSummary[]> {
    const res = await authFetch(`${API_BASE_URL}/invoices`);
    if (!res.ok) throw new Error("Failed to fetch invoices");
    return res.json();
  },

  async getInvoiceDetail(id: string): Promise<InvoiceDetail> {
    const res = await authFetch(`${API_BASE_URL}/invoices/${id}`);
    if (!res.ok) throw new Error("Failed to fetch invoice detail");
    return res.json();
  },

  async deleteInvoice(id: string): Promise<{ success: boolean; message: string }> {
    const res = await authFetch(`${API_BASE_URL}/invoices/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to delete invoice" }));
      throw new Error(err.detail || "Failed to delete invoice");
    }
    return res.json();
  },

  async uploadInvoice(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await authFetch(`${API_BASE_URL}/invoices/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Upload failed" }));
      throw new Error(err.detail || "Upload failed");
    }
    return res.json();
  },

  async getPendingReviews(): Promise<ReviewItem[]> {
    const res = await authFetch(`${API_BASE_URL}/review`);
    if (!res.ok) throw new Error("Failed to fetch reviews");
    return res.json();
  },

  async resolveReview(
    reviewId: string,
    canonicalItemId: string,
    packUnits = 1,
    packSize?: number,
    packMeasure?: string
  ) {
    const res = await authFetch(`${API_BASE_URL}/review/${reviewId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        canonical_item_id: canonicalItemId,
        pack_units: packUnits,
        pack_size: packSize,
        pack_measure: packMeasure,
        update_sku_cache: true,
      }),
    });
    if (!res.ok) throw new Error("Failed to resolve review item");
    return res.json();
  },

  async dismissReview(reviewId: string) {
    const res = await authFetch(`${API_BASE_URL}/review/${reviewId}/dismiss`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to dismiss review item");
    return res.json();
  },
};

