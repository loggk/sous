"use client";

import { useEffect, useState, useRef } from "react";
import { api, InvoiceSummary, InvoiceDetail } from "@/lib/api";
import { CheckCircle2, ChevronDown, Clock, FileText, UploadCloud, X } from "lucide-react";
import { useConfirm } from "@/context/ConfirmContext";

function money(value: number, decimals = 2) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
  const [detailTab, setDetailTab] = useState<"lines" | "pdf">("lines");
  const [directPdfUrl, setDirectPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: "success" | "warning" | "error"; message: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "passed" | "attention">("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { confirm, alert } = useConfirm();

  async function loadInvoices() {
    try {
      setLoading(true);
      const data = await api.getInvoices();
      setInvoices(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInvoices();

    const handleRestChanged = () => {
      loadInvoices();
    };
    window.addEventListener("sous_restaurant_changed", handleRestChanged);
    return () => window.removeEventListener("sous_restaurant_changed", handleRestChanged);
  }, []);

  useEffect(() => {
    if (selectedInvoice) {
      api.getInvoicePdfUrl(selectedInvoice.id)
        .then((url) => {
          if (url) setDirectPdfUrl(url);
        })
        .catch(() => setDirectPdfUrl(null));
    } else {
      setDirectPdfUrl(null);
    }
  }, [selectedInvoice?.id]);

  async function handleOpenPdf(inv: { id: string; pdf_url?: string | null }) {
    let targetUrl = inv.pdf_url?.startsWith("http")
      ? inv.pdf_url
      : `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}${inv.pdf_url || `/invoices/${inv.id}/pdf`}`;
    try {
      const direct = await api.getInvoicePdfUrl(inv.id);
      if (direct) targetUrl = direct;
    } catch (e) {
      console.warn("Could not fetch direct signed URL, using direct stream endpoint", e);
    }
    window.open(targetUrl, "_blank");
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadStatus(null);

    try {
      const file = files[0];
      const res = await api.uploadInvoice(file);

      if (res.message.includes("Duplicate")) {
        setUploadStatus({
          type: "warning",
          message: `You have already uploaded “${file.name}”. The existing record was kept.`,
        });
      } else {
        setUploadStatus({
          type: "success",
          message: `“${file.name}” is in. Reading the lines now; the table updates on its own.`,
        });
      }

      await loadInvoices();
      setTimeout(() => loadInvoices(), 1500);
      setTimeout(() => loadInvoices(), 3500);
    } catch (err: any) {
      setUploadStatus({
        type: "error",
        message: err.message || "That upload didn't go through.",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function toggleInvoice(invoiceId: string) {
    if (selectedInvoice?.id === invoiceId) {
      setSelectedInvoice(null);
      return;
    }
    try {
      const detail = await api.getInvoiceDetail(invoiceId);
      setSelectedInvoice(detail);
      setDetailTab("lines");
    } catch (err: any) {
      await alert({
        title: "Couldn't open that invoice",
        message: err.message || "Unknown error",
        variant: "danger",
      });
    }
  }

  async function handleDeleteInvoice(invoiceId: string, name: string) {
    const confirmed = await confirm({
      title: "Delete this invoice?",
      message: `“${name}” goes for good, along with everything read from it: line items, price history, the lot.`,
      confirmText: "Delete it",
      cancelText: "Keep it",
      variant: "danger",
    });
    if (!confirmed) return;

    try {
      await api.deleteInvoice(invoiceId);
      setUploadStatus({ type: "success", message: `Deleted “${name}”.` });
      if (selectedInvoice?.id === invoiceId) setSelectedInvoice(null);
      await loadInvoices();
    } catch (err: any) {
      setUploadStatus({ type: "error", message: err.message || "Couldn't delete that invoice." });
      await alert({
        title: "Delete failed",
        message: err.message || "Couldn't delete that invoice.",
        variant: "danger",
      });
    }
  }

  const suppliers = Array.from(
    new Set(invoices.map((i) => i.supplier_name).filter((s): s is string => Boolean(s)))
  ).sort();

  const filtered = invoices.filter((inv) => {
    if (statusFilter === "passed" && inv.validation_status !== "passed") return false;
    if (statusFilter === "attention" && inv.validation_status === "passed") return false;
    if (supplierFilter !== "all" && inv.supplier_name !== supplierFilter) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (inv.file_name || "").toLowerCase().includes(q) ||
      inv.invoice_number.toLowerCase().includes(q) ||
      (inv.supplier_name || "").toLowerCase().includes(q)
    );
  });

  const pdfUrlFor = (inv: InvoiceDetail) =>
    directPdfUrl ||
    (inv.pdf_url?.startsWith("http")
      ? inv.pdf_url
      : `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}${inv.pdf_url || `/invoices/${inv.id}/pdf`}`);

  return (
    <div>
      {/* Page head */}
      <div className="pb-7">
        <span className="eyebrow">Ingestion</span>
        <h1 className="display-xl mt-2 text-4xl sm:text-[46px]">Invoices</h1>
        <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Drop a delivery receipt in and Sous reads it, normalises every pack size to a base unit,
          and files it against the right supplier. PDF, JPG, PNG or HEIC.
        </p>
      </div>

      {/* Drop zone */}
      <section className="section-open section-close py-7">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFileUpload(e.dataTransfer.files);
            }}
            className="flex w-full cursor-pointer flex-col items-center gap-2.5 rounded border-2 border-dashed border-edge bg-panel px-6 py-9 text-center transition-colors hover:border-accent"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.heic"
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />
            {uploading ? (
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            ) : (
              <UploadCloud className="h-7 w-7 text-accent" />
            )}
            <span className="display-sm text-[17px]">
              {uploading ? "Reading it now…" : "Drop invoices here"}
            </span>
            <span className="text-[13px] text-ink-soft">
              or <span className="font-semibold text-accent underline">browse your files</span>,
              up to 25&nbsp;MB each
            </span>
            <span className="text-xs text-ink-muted">
              Duplicates are caught by content hash before anything is filed twice
            </span>
          </button>
        </div>
      </section>

      {/* Upload feedback */}
      {uploadStatus && (
        <div
          className={`mt-5 flex items-start justify-between gap-4 rounded px-4 py-3.5 text-sm ${
            uploadStatus.type === "success"
              ? "bg-under-wash text-under-ink"
              : "bg-over-wash text-over-ink"
          }`}
        >
          <span>{uploadStatus.message}</span>
          <button
            onClick={() => setUploadStatus(null)}
            aria-label="Dismiss"
            className="shrink-0 cursor-pointer opacity-70 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filters */}
      <section className="flex flex-wrap items-end justify-between gap-5 pb-2.5 pt-6">
        <div className="max-w-[420px] flex-[1_1_280px]">
          <label htmlFor="inv-q" className="label-caps block pb-2">
            Find an invoice
          </label>
          <input
            id="inv-q"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="File name, invoice number or supplier"
            className="field"
          />
        </div>

        <fieldset className="m-0 border-0 p-0">
          <legend className="label-caps pb-2">Show</legend>
          <div className="flex flex-wrap gap-2">
            {([
              ["all", `All ${invoices.length}`],
              ["attention", "Needs a look"],
              ["passed", "Checked out"],
            ] as const).map(([key, label]) => (
              <label
                key={key}
                className={`inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-[13px] transition-colors ${
                  statusFilter === key
                    ? "border border-ink bg-ink font-bold text-on-ink"
                    : "border border-edge font-semibold text-ink-soft hover:text-ink"
                }`}
              >
                <input
                  type="radio"
                  name="invoice-filter"
                  checked={statusFilter === key}
                  onChange={() => setStatusFilter(key)}
                  className="absolute h-px w-px opacity-0"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {suppliers.length > 0 && (
          <div>
            <label htmlFor="inv-supplier" className="label-caps block pb-2">
              Supplier
            </label>
            <div className="relative">
              <select
                id="inv-supplier"
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="min-h-11 w-full cursor-pointer appearance-none rounded-full border border-edge bg-panel py-2 pl-4 pr-11 text-sm text-ink outline-none focus:border-accent"
              >
                <option value="all">All {suppliers.length} suppliers</option>
                {suppliers.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            </div>
          </div>
        )}
      </section>

      {/* The pile */}
      <section>
        <div className="hidden grid-cols-[minmax(0,3fr)_minmax(0,1.1fr)_minmax(0,1.8fr)_minmax(0,1.1fr)_84px] border-b-2 border-ink pb-2.5 pt-3.5 sm:grid">
          <span className="label-caps">Document</span>
          <span className="label-caps">Date</span>
          <span className="label-caps">Check</span>
          <span className="label-caps text-right">Total</span>
          <span className="label-caps text-right">File</span>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-ink-soft">Loading your invoices…</p>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-soft">
            {invoices.length === 0
              ? "Nothing filed yet. Drop your first invoice in above."
              : "No invoices match those filters."}
          </p>
        ) : (
          filtered.map((inv) => {
            const isOpen = selectedInvoice?.id === inv.id;
            const passed = inv.validation_status === "passed";
            return (
              <div
                key={inv.id}
                className={`border-b border-rule-soft ${isOpen ? "bg-panel" : ""}`}
                style={isOpen ? { borderLeft: "3px solid var(--ink)" } : undefined}
              >
                <div
                  className={`grid grid-cols-2 items-center gap-y-2 py-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,1.1fr)_minmax(0,1.8fr)_minmax(0,1.1fr)_84px] sm:gap-y-0 ${
                    isOpen ? "pl-3.5" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleInvoice(inv.id)}
                    aria-expanded={isOpen}
                    className="col-span-2 flex min-w-0 cursor-pointer items-center gap-3.5 text-left sm:col-span-1"
                  >
                    <FileText
                      className={`h-5 w-5 shrink-0 ${passed ? "text-accent" : "text-over"}`}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-ink">
                        {inv.file_name || inv.invoice_number}
                      </span>
                      <span className="block truncate text-xs text-ink-muted">
                        {inv.invoice_number}
                        {inv.supplier_name ? ` · ${inv.supplier_name}` : ""}
                      </span>
                    </span>
                  </button>

                  <span className="text-[13px] text-ink-soft">{inv.invoice_date}</span>

                  <span>
                    {passed ? (
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-under-ink">
                        <CheckCircle2 className="h-3.5 w-3.5 text-under" />
                        Lines match the total
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-over-ink">
                        <Clock className="h-3.5 w-3.5 text-over" />
                        {inv.validation_status}
                      </span>
                    )}
                  </span>

                  <span className="num font-display text-[15px] font-bold text-ink sm:text-right">
                    ${money(inv.total)}
                  </span>

                  <span className="sm:text-right">
                    <button
                      type="button"
                      onClick={() => handleOpenPdf(inv)}
                      className="cursor-pointer text-[12.5px] font-semibold text-accent hover:underline"
                    >
                      PDF &nearr;
                    </button>
                  </span>
                </div>

                {/* Inline expansion: what was on it */}
                {isOpen && selectedInvoice && (
                  <div className="px-0 pb-7 pl-3.5 pr-6 pt-1">
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setDetailTab("lines")}
                          className={`min-h-11 cursor-pointer rounded-full px-4 text-[13px] transition-colors ${
                            detailTab === "lines"
                              ? "border border-ink bg-ink font-bold text-on-ink"
                              : "border border-edge font-semibold text-ink-soft hover:text-ink"
                          }`}
                        >
                          {selectedInvoice.lines.length} lines
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailTab("pdf")}
                          className={`min-h-11 cursor-pointer rounded-full px-4 text-[13px] transition-colors ${
                            detailTab === "pdf"
                              ? "border border-ink bg-ink font-bold text-on-ink"
                              : "border border-edge font-semibold text-ink-soft hover:text-ink"
                          }`}
                        >
                          Original document
                        </button>
                      </div>
                      <span className="text-xs text-ink-muted">
                        {selectedInvoice.extraction_provider
                          ? `Read by ${selectedInvoice.extraction_provider}`
                          : "Every pack normalised to a base unit"}
                      </span>
                    </div>

                    {detailTab === "lines" ? (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] border-collapse text-[13px]">
                          <thead>
                            <tr>
                              <th className="label-caps border-b border-rule py-2 text-left">
                                As printed on the invoice
                              </th>
                              <th className="label-caps border-b border-rule px-3 py-2 text-left">Pack</th>
                              <th className="label-caps border-b border-rule px-3 py-2 text-right">Qty</th>
                              <th className="label-caps border-b border-rule px-3 py-2 text-right">Unit</th>
                              <th className="label-caps border-b border-rule px-3 py-2 text-right">Line</th>
                              <th className="label-caps border-b border-rule py-2 pl-3 text-right text-accent">
                                Per base unit
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedInvoice.lines.map((l) => (
                              <tr key={l.id}>
                                <td className="border-b border-rule-soft py-2.5">
                                  <span className="font-semibold text-ink">{l.raw_description}</span>
                                  {l.line_kind !== "item" && (
                                    <span className="ml-2 rounded-sm bg-chip px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-ink-soft">
                                      {l.line_kind}
                                    </span>
                                  )}
                                  {l.supplier_sku && (
                                    <span className="block text-[11.5px] text-ink-muted">
                                      SKU {l.supplier_sku}
                                    </span>
                                  )}
                                </td>
                                <td className="border-b border-rule-soft px-3 py-2.5 text-ink-soft">
                                  {l.pack_descriptor || "–"}
                                </td>
                                <td className="num border-b border-rule-soft px-3 py-2.5 text-right text-ink-soft">
                                  {l.quantity}
                                </td>
                                <td className="num border-b border-rule-soft px-3 py-2.5 text-right text-ink-soft">
                                  ${l.unit_price.toFixed(2)}
                                </td>
                                <td className="num border-b border-rule-soft px-3 py-2.5 text-right font-semibold text-ink">
                                  ${l.line_total.toFixed(2)}
                                </td>
                                <td className="num border-b border-rule-soft py-2.5 pl-3 text-right font-bold text-accent">
                                  {l.price_per_base_unit ? `$${l.price_per_base_unit.toFixed(2)}` : "–"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        <div className="flex items-center justify-between pb-2">
                          <span className="text-xs text-ink-muted">The document as it arrived</span>
                          <a
                            href={pdfUrlFor(selectedInvoice)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-accent no-underline hover:underline"
                          >
                            Open in a new tab &nearr;
                          </a>
                        </div>
                        <iframe
                          src={pdfUrlFor(selectedInvoice)}
                          className="min-h-[500px] w-full rounded border border-rule bg-panel"
                          title={`Invoice ${selectedInvoice.invoice_number}`}
                        />
                      </div>
                    )}

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleOpenPdf(selectedInvoice)}
                          className="pill-primary"
                        >
                          Open original PDF
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteInvoice(
                              selectedInvoice.id,
                              selectedInvoice.file_name || selectedInvoice.invoice_number
                            )
                          }
                          className="min-h-11 cursor-pointer px-2 font-display text-xs font-bold uppercase tracking-[0.08em] text-over-ink hover:underline"
                        >
                          Delete invoice
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-5 text-xs">
                        {selectedInvoice.subtotal != null &&
                        selectedInvoice.tax != null &&
                        selectedInvoice.tax > 0 &&
                        selectedInvoice.subtotal !== selectedInvoice.total ? (
                          <>
                            <span className="text-ink-muted">
                              Subtotal{" "}
                              <span className="num font-semibold text-ink-soft">
                                ${money(selectedInvoice.subtotal)}
                              </span>
                            </span>
                            <span className="text-ink-muted">
                              Tax{" "}
                              <span className="num font-semibold text-ink-soft">
                                ${money(selectedInvoice.tax)}
                              </span>
                            </span>
                          </>
                        ) : null}
                        <span className="num display-sm text-sm">
                          Total ${money(selectedInvoice.total)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        {!loading && filtered.length > 0 && (
          <p className="pt-4 text-xs text-ink-muted">
            Showing {filtered.length} of {invoices.length} invoices
          </p>
        )}
      </section>
    </div>
  );
}
