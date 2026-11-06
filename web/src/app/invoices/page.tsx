"use client";

import { useEffect, useState, useRef } from "react";
import { api, InvoiceSummary, InvoiceDetail } from "@/lib/api";
import { UploadCloud, FileText, CheckCircle2, Clock, X, Trash2, ExternalLink } from "lucide-react";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
  const [modalTab, setModalTab] = useState<"lines" | "pdf">("lines");
  const [directPdfUrl, setDirectPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: "success" | "warning" | "error"; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          message: `Duplicate document detected for "${file.name}" (SHA-256: ${res.content_sha256.slice(0, 10)}...). Existing record retrieved.`,
        });
      } else {
        setUploadStatus({
          type: "success",
          message: `Invoice "${file.name}" uploaded successfully! Background extraction running...`,
        });
      }

      await loadInvoices();
      // Poll automatically so background extraction updates the table as soon as completed
      setTimeout(() => loadInvoices(), 1500);
      setTimeout(() => loadInvoices(), 3500);
    } catch (err: any) {
      setUploadStatus({
        type: "error",
        message: err.message || "Failed to upload invoice.",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function openInvoiceModal(invoiceId: string) {
    try {
      const detail = await api.getInvoiceDetail(invoiceId);
      setSelectedInvoice(detail);
      setModalTab("lines");
    } catch (err: any) {
      alert("Failed to load invoice details: " + err.message);
    }
  }

  async function handleDeleteInvoice(invoiceId: string, name: string) {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) {
      return;
    }
    try {
      await api.deleteInvoice(invoiceId);
      setUploadStatus({
        type: "success",
        message: `Deleted "${name}" successfully.`,
      });
      if (selectedInvoice?.id === invoiceId) {
        setSelectedInvoice(null);
      }
      await loadInvoices();
    } catch (err: any) {
      setUploadStatus({
        type: "error",
        message: err.message || "Failed to delete invoice.",
      });
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="pb-2 border-b border-slate-200/60 dark:border-slate-800">
        <h1 className="text-2xl font-bold tracking-tight text-[#1b2b4a] dark:text-slate-100 sm:text-3xl">
          Invoices & Ingestion
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Upload supplier delivery receipts (PDF / JPG / PNG / HEIC). Each document is deduplicated via SHA-256 and asynchronously parsed into normalized unit economics.
        </p>
      </div>

      {/* Upload Dropzone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFileUpload(e.dataTransfer.files);
        }}
        className="group relative cursor-pointer rounded-2xl border-2 border-dashed border-slate-300 bg-white p-7 text-center transition-all hover:border-[#2f4a7d] hover:bg-[#f6f8fc] dark:border-slate-700 dark:bg-[#131f37] dark:hover:border-blue-400 dark:hover:bg-[#1a2c4e]/50 shadow-xs"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.heic"
          className="hidden"
          onChange={(e) => handleFileUpload(e.target.files)}
        />
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f0f4fa] text-[#2f4a7d] transition-transform group-hover:scale-105 dark:bg-[#1a2c4e] dark:text-blue-300">
          {uploading ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#2f4a7d] dark:border-blue-400 border-t-transparent" />
          ) : (
            <UploadCloud className="h-6 w-6" />
          )}
        </div>
        <h3 className="mt-3 text-sm font-bold text-[#1b2b4a] dark:text-slate-100">
          {uploading ? "Uploading & hashing..." : "Click or drag invoice files here to ingest"}
        </h3>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          Supports multi-page PDF, JPG, PNG, and HEIC files up to 25MB
        </p>
      </div>

      {/* Upload Feedback Toast / Banner */}
      {uploadStatus && (
        <div
          className={`rounded-xl p-4 text-sm flex items-start justify-between ${
            uploadStatus.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300"
              : uploadStatus.type === "warning"
              ? "border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300"
              : "border border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300"
          }`}
        >
          <span>{uploadStatus.message}</span>
          <button onClick={() => setUploadStatus(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Invoices List Table */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-xs overflow-hidden dark:border-slate-800 dark:bg-[#131f37]">
        <div className="border-b border-slate-200/80 p-5 flex items-center justify-between dark:border-slate-800">
          <h2 className="text-base font-bold text-[#1b2b4a] dark:text-slate-100">
            Processed Invoices ({invoices.length})
          </h2>
          <span className="text-xs text-slate-400 dark:text-slate-500">Click any row to inspect line breakdown</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No invoices found. Use the upload box above to ingest your first invoice.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f8fafc] border-b border-slate-200 text-xs font-semibold text-slate-500 dark:bg-[#0e182c] dark:border-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Document / Invoice</th>
                  <th className="px-5 py-3.5 font-semibold">Invoice Date</th>
                  <th className="px-5 py-3.5 font-semibold">Validation Status</th>
                  <th className="px-5 py-3.5 font-semibold text-right">Total</th>
                  <th className="px-5 py-3.5 font-semibold text-right">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => openInvoiceModal(inv.id)}
                    className="group cursor-pointer hover:bg-[#f8fafc] dark:hover:bg-[#1a2c4e]/30 transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f0f4fa] text-[#2f4a7d] group-hover:bg-[#e4ecf7] dark:bg-[#1a2c4e] dark:text-blue-300 dark:group-hover:bg-[#223963] transition-colors">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-[#1b2b4a] dark:text-slate-100 truncate group-hover:text-[#2f4a7d] dark:group-hover:text-blue-400 transition-colors">
                            {inv.file_name || inv.invoice_number}
                          </span>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{inv.invoice_number}</span>
                            {inv.supplier_name && (
                              <>
                                <span>&bull;</span>
                                <span className="truncate">{inv.supplier_name}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300">
                      {inv.invoice_date}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-medium ${
                          inv.validation_status === "passed"
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-500/30"
                            : "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-500/30"
                        }`}
                      >
                        {inv.validation_status === "passed" ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                        {inv.validation_status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-[#1b2b4a] dark:text-slate-100">
                      ${inv.total.toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleOpenPdf(inv)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-[#2f4a7d] hover:border-blue-300 dark:border-slate-700 dark:bg-[#1a2c4e]/50 dark:text-slate-300 dark:hover:bg-[#1a2c4e] transition-colors cursor-pointer"
                        title="Open original PDF invoice in new tab"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice Line Breakdown Modal */}
      {selectedInvoice && (() => {
        const pdfUrl =
          directPdfUrl ||
          (selectedInvoice.pdf_url?.startsWith("http")
            ? selectedInvoice.pdf_url
            : `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}${selectedInvoice.pdf_url || `/invoices/${selectedInvoice.id}/pdf`}`);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#131f37] overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-200 p-5 bg-[#f8fafc] dark:border-slate-800 dark:bg-[#0e182c]">
                <div>
                  <h3 className="text-lg font-bold text-[#1b2b4a] dark:text-slate-100 flex items-center gap-2">
                    {selectedInvoice.file_name || selectedInvoice.invoice_number}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Invoice #: <span className="font-mono font-medium">{selectedInvoice.invoice_number}</span>
                    {selectedInvoice.supplier_name && ` | Supplier: ${selectedInvoice.supplier_name}`}
                    {` | Date: ${selectedInvoice.invoice_date}`}
                    {selectedInvoice.extraction_provider && ` | Provider: ${selectedInvoice.extraction_provider}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenPdf(selectedInvoice)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#2f4a7d]/20 bg-[#f0f4fa] px-3 py-1.5 text-xs font-bold text-[#2f4a7d] hover:bg-[#e4ecf7] dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300 transition-colors shadow-2xs cursor-pointer"
                    title="Open original PDF invoice in new tab"
                  >
                    <FileText className="h-4 w-4" />
                    Open PDF
                    <ExternalLink className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setSelectedInvoice(null)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* View Switcher Tabs */}
              <div className="flex items-center gap-2 border-b border-slate-200 bg-[#f8fafc] px-5 py-2.5 dark:border-slate-800 dark:bg-[#0e182c]">
                <button
                  type="button"
                  onClick={() => setModalTab("lines")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    modalTab === "lines"
                      ? "bg-[#2f4a7d] text-white dark:bg-blue-600 shadow-2xs"
                      : "text-slate-600 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"
                  }`}
                >
                  Line Items Breakdown ({selectedInvoice.lines.length})
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab("pdf")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    modalTab === "pdf"
                      ? "bg-[#2f4a7d] text-white dark:bg-blue-600 shadow-2xs"
                      : "text-slate-600 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Original PDF Document View
                </button>
              </div>

              {/* Modal Body */}
              {modalTab === "lines" ? (
                <div className="flex-1 overflow-y-auto p-5">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="pb-2.5 font-semibold">Line</th>
                        <th className="pb-2.5 font-semibold">Raw Description</th>
                        <th className="pb-2.5 font-semibold">Supplier SKU</th>
                        <th className="pb-2.5 font-semibold">Pack</th>
                        <th className="pb-2.5 text-right font-semibold">Qty</th>
                        <th className="pb-2.5 text-right font-semibold">Unit Price</th>
                        <th className="pb-2.5 text-right font-semibold">Line Total</th>
                        <th className="pb-2.5 text-right font-semibold" title="Normalized cost per standard base unit (e.g. $/kg, $/L) used for market comparisons">
                          Base Price
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {selectedInvoice.lines.map((l) => (
                        <tr key={l.id} className="hover:bg-[#f8fafc] dark:hover:bg-[#1a2c4e]/30 transition-colors">
                          <td className="py-2.5 text-slate-400 dark:text-slate-500">{l.line_index}</td>
                          <td className="py-2.5 font-medium text-[#1b2b4a] dark:text-slate-100">
                            {l.raw_description}
                            {l.line_kind !== "item" && (
                              <span className="ml-2 rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500 dark:text-slate-400 uppercase">
                                {l.line_kind}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 text-slate-500 dark:text-slate-400">{l.supplier_sku || "—"}</td>
                          <td className="py-2.5 text-slate-600 dark:text-slate-300">{l.pack_descriptor || "—"}</td>
                          <td className="py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{l.quantity}</td>
                          <td className="py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">${l.unit_price.toFixed(2)}</td>
                          <td className="py-2.5 text-right tabular-nums font-semibold text-[#1b2b4a] dark:text-slate-100">${l.line_total.toFixed(2)}</td>
                          <td className="py-2.5 text-right tabular-nums text-[#2f4a7d] dark:text-blue-400 font-semibold">
                            {l.price_per_base_unit ? `$${l.price_per_base_unit.toFixed(2)}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex-1 min-h-[550px] flex flex-col p-4 bg-slate-100 dark:bg-[#0a1120]">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-[#2f4a7d] dark:text-blue-400" />
                      Document Stream via Supabase Storage
                    </span>
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#2f4a7d] hover:underline dark:text-blue-400"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Open in full window
                    </a>
                  </div>
                  <iframe
                    src={pdfUrl}
                    className="w-full flex-1 min-h-[500px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white"
                    title="Invoice PDF"
                  />
                </div>
              )}

              {/* Modal Footer */}
              <div className="border-t border-slate-200 bg-[#f8fafc] dark:border-slate-800 dark:bg-[#0e182c] p-4 flex flex-wrap justify-between items-center gap-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    Validation:
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                        selectedInvoice.validation_status === "passed"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                      }`}
                    >
                      {selectedInvoice.validation_status === "passed" ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <Clock className="h-3 w-3" />
                      )}
                      {selectedInvoice.validation_status}
                    </span>
                  </span>
                  <button
                    onClick={() => handleDeleteInvoice(selectedInvoice.id, selectedInvoice.file_name || selectedInvoice.invoice_number)}
                    className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Invoice
                  </button>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  {selectedInvoice.subtotal != null &&
                  selectedInvoice.tax != null &&
                  selectedInvoice.tax > 0 &&
                  selectedInvoice.subtotal !== selectedInvoice.total ? (
                    <>
                      <span className="text-slate-500 dark:text-slate-400">
                        Subtotal:{" "}
                        <span className="tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                          ${selectedInvoice.subtotal.toFixed(2)}
                        </span>
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        Tax:{" "}
                        <span className="tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                          ${selectedInvoice.tax.toFixed(2)}
                        </span>
                      </span>
                    </>
                  ) : null}
                  <span className="text-sm font-bold text-[#1b2b4a] dark:text-slate-100">
                    Total: <span className="tabular-nums">${selectedInvoice.total.toFixed(2)}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

