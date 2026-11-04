const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface TopCostItem {
  id?: string | null;
  name: string;
  category: string;
  base_unit: string;
  total_spend: number;
  total_qty: number;
  avg_price: number;
  pct_of_spend: number;
}

export interface SpendSummary {
  total_spend: number;
  by_category: Record<string, number>;
  by_supplier: Record<string, number>;
  fees_total: number;
  top_items?: TopCostItem[];
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
  has_data?: boolean;
}

export interface BenchmarkSummaryItem extends CanonicalItem {
  has_data: boolean;
  suppressed: boolean;
  n_restaurants?: number;
  radius_km_used?: number | null;
  selected_radius_km?: number | null;
  median?: number | null;
  p25?: number | null;
  p75?: number | null;
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
  selected_radius_km?: number | null;
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

export interface RestaurantSummary {
  id: string;
  name: string;
  address?: string | null;
  seats?: number | null;
  cuisine_type?: string | null;
}

export interface Company {
  id: string;
  name: string;
  restaurants: RestaurantSummary[];
  assigned_restaurant_ids: string[];
  is_owner: boolean;
  user_role: string;
}

export interface TeamMember {
  id: string;
  email: string;
  role: string;
  assigned_restaurant_ids: string[];
  assigned_restaurants: RestaurantSummary[];
}

export interface TeamInvitation {
  id: string;
  email: string;
  restaurant_ids: string[];
  created_at: string;
}

export interface TeamData {
  company_id: string;
  company_name: string;
  members: TeamMember[];
  invitations: TeamInvitation[];
}

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let token: string | null = null;
  let supabaseClient: any = null;
  try {
    const { createClient } = await import("@/lib/supabase/client");
    supabaseClient = createClient();
    const { data } = await supabaseClient.auth.getSession();
    token = data.session?.access_token || null;
  } catch {
    // Supabase credentials not set or in offline mode
  }

  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Attach X-Restaurant-ID if stored in localStorage
  if (typeof window !== "undefined") {
    const activeRestId = localStorage.getItem("sous_active_restaurant_id");
    if (activeRestId && !headers.has("X-Restaurant-ID")) {
      headers.set("X-Restaurant-ID", activeRestId);
    }
  }

  const res = await fetch(url, { ...options, headers });
  return res;
}

export const api = {
  async getHealth() {
    const res = await authFetch(`${API_BASE_URL}/health`);
    return res.json();
  },

  async getSpendSummary(days = 90): Promise<SpendSummary> {
    const res = await authFetch(`${API_BASE_URL}/audit/spend?days=${days}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to fetch spend summary" }));
      throw new Error(err.detail || "Failed to fetch spend summary");
    }
    return res.json();
  },

  async getPriceAlerts(): Promise<PriceAlert[]> {
    const res = await authFetch(`${API_BASE_URL}/audit/alerts`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to fetch price alerts" }));
      throw new Error(err.detail || "Failed to fetch price alerts");
    }
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

  async getBenchmark(canonicalItemId: string, windowDays = 90, radiusKm?: number | null): Promise<BenchmarkData> {
    const params = new URLSearchParams();
    params.append("window_days", windowDays.toString());
    if (radiusKm !== undefined && radiusKm !== null) {
      params.append("radius_km", radiusKm.toString());
    }
    const res = await authFetch(`${API_BASE_URL}/benchmarks/${canonicalItemId}?${params.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to fetch benchmark" }));
      throw new Error(err.detail || "Failed to fetch benchmark");
    }
    return res.json();
  },

  async getBenchmarkSummary(windowDays = 90, radiusKm?: number | null): Promise<BenchmarkSummaryItem[]> {
    const params = new URLSearchParams();
    params.append("window_days", windowDays.toString());
    if (radiusKm !== undefined && radiusKm !== null) {
      params.append("radius_km", radiusKm.toString());
    }
    const res = await authFetch(`${API_BASE_URL}/benchmarks/summary?${params.toString()}`);
    if (!res.ok) {
      const catalog = await this.getCatalogItems("", true);
      return catalog.map((c) => ({
        ...c,
        has_data: false,
        suppressed: true,
      }));
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

  async getCompany(): Promise<Company> {
    const res = await authFetch(`${API_BASE_URL}/company/me`);
    if (!res.ok) throw new Error("Failed to fetch company details");
    return res.json();
  },

  async registerCompany(data: {
    company_name: string;
    restaurant_name: string;
    address?: string;
    cuisine_type?: string;
    admin_email: string;
  }): Promise<Company> {
    const res = await authFetch(`${API_BASE_URL}/company/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to register company" }));
      throw new Error(err.detail || "Failed to register company");
    }
    return res.json();
  },

  async addLocation(data: {
    name: string;
    address?: string;
    cuisine_type?: string;
  }): Promise<RestaurantSummary> {
    const res = await authFetch(`${API_BASE_URL}/company/locations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to add location" }));
      throw new Error(err.detail || "Failed to add location");
    }
    return res.json();
  },

  async getTeam(): Promise<TeamData> {
    const res = await authFetch(`${API_BASE_URL}/company/team`);
    if (!res.ok) throw new Error("Failed to fetch team");
    return res.json();
  },

  async inviteTeamMember(email: string, restaurantIds: string[]) {
    const res = await authFetch(`${API_BASE_URL}/company/team/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, restaurant_ids: restaurantIds }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to invite team member" }));
      throw new Error(err.detail || "Failed to invite team member");
    }
    return res.json();
  },

  async updateUserRestaurants(userId: string, restaurantIds: string[]) {
    const res = await authFetch(`${API_BASE_URL}/company/team/${userId}/restaurants`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurant_ids: restaurantIds }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to update assignments" }));
      throw new Error(err.detail || "Failed to update assignments");
    }
    return res.json();
  },

  async removeTeamMember(userId: string) {
    const res = await authFetch(`${API_BASE_URL}/company/team/${userId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to remove member" }));
      throw new Error(err.detail || "Failed to remove member");
    }
    return res.json();
  },

  async cancelInvitation(inviteId: string) {
    const res = await authFetch(`${API_BASE_URL}/company/team/invitations/${inviteId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to cancel invitation" }));
      throw new Error(err.detail || "Failed to cancel invitation");
    }
    return res.json();
  },

  async acceptInvite(email: string, password: string): Promise<{ status: string; company_name: string; message: string }> {
    const res = await fetch(`${API_BASE_URL}/company/accept-invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to accept invitation" }));
      throw new Error(err.detail || "Failed to accept invitation");
    }
    return res.json();
  },
};

