"use client";

import { useEffect, useState, useRef } from "react";
import { api, InvoiceSummary, InvoiceDetail } from "@/lib/api";
import { UploadCloud, FileText, CheckCircle2, Clock, ChevronRight, X, Trash2 } from "lucide-react";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDetail | null>(null);
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
  }, []);

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
    } catch (err: any) {
      alert("Failed to load invoice details: " + err.message);
    }
  }

  async function handleDeleteInvoice(invoiceId: string, name: string) {
    if (!confirm(`Are you sure you want to delete "${name}"?\n\nThis will remove the invoice, lines, and document record, resetting duplicate detection so you can re-upload cleanly.`)) {
      return;
    }
    try {
      await api.deleteInvoice(invoiceId);
      setUploadStatus({
        type: "success",
        message: `Deleted "${name}" and reset its document record successfully.`,
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          Invoices & Ingestion
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Upload supplier invoices (PDF / JPG / PNG / HEIC). Each document is deduplicated via SHA-256 and asynchronously parsed into normalized unit economics.
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
        className="group relative cursor-pointer rounded-2xl border-2 border-dashed border-zinc-300 bg-white p-8 text-center transition-colors hover:border-orange-500 hover:bg-orange-50/20 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-orange-500/80"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.heic"
          className="hidden"
          onChange={(e) => handleFileUpload(e.target.files)}
        />
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-100 text-orange-600 transition-transform group-hover:scale-110 dark:bg-orange-950/60 dark:text-orange-400">
          {uploading ? (
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-orange-600 border-t-transparent" />
          ) : (
            <UploadCloud className="h-7 w-7" />
          )}
        </div>
        <h3 className="mt-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {uploading ? "Uploading & hashing..." : "Click or drag invoice files here to ingest"}
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Supports multi-page PDF, JPG, PNG, and HEIC files up to 25MB
        </p>
      </div>

      {/* Upload Feedback Toast / Banner */}
      {uploadStatus && (
        <div
          className={`rounded-xl p-4 text-sm flex items-start justify-between ${
            uploadStatus.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
              : uploadStatus.type === "warning"
              ? "border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
              : "border border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
          }`}
        >
          <span>{uploadStatus.message}</span>
          <button onClick={() => setUploadStatus(null)} className="text-zinc-400 hover:text-zinc-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Invoices List Table */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
        <div className="border-b border-zinc-200 p-4 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Processed Invoices ({invoices.length})
          </h2>
          <span className="text-xs text-zinc-400">Click any row to inspect line breakdown</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-zinc-500">Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            No invoices found. Use the upload box above to ingest your first invoice.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50/70 border-b border-zinc-200 text-xs font-medium text-zinc-500 dark:bg-zinc-800/40 dark:border-zinc-800">
                <tr>
                  <th className="px-4 py-3 font-medium">Document / Invoice</th>
                  <th className="px-4 py-3 font-medium">Invoice Date</th>
                  <th className="px-4 py-3 font-medium">Validation Status</th>
                  <th className="px-4 py-3 font-medium text-right">Subtotal</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => openInvoiceModal(inv.id)}
                    className="cursor-pointer hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                            {inv.file_name || inv.invoice_number}
                          </span>
                          <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                            <span className="font-mono text-[11px] font-medium">{inv.invoice_number}</span>
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
                    <td className="px-4 py-3.5 text-zinc-600 dark:text-zinc-400">
                      {inv.invoice_date}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                          inv.validation_status === "passed"
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-400"
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
                    <td className="px-4 py-3.5 text-right font-mono text-zinc-600 dark:text-zinc-400">
                      ${inv.subtotal?.toFixed(2)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-bold text-zinc-900 dark:text-zinc-100">
                      ${inv.total.toFixed(2)}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleDeleteInvoice(inv.id, inv.file_name || inv.invoice_number)}
                          title="Delete invoice & document"
                          className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 transition-colors dark:hover:bg-red-950/40 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <ChevronRight
                          onClick={() => openInvoiceModal(inv.id)}
                          className="h-4 w-4 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice Line Breakdown Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-200 p-5 dark:border-zinc-800">
              <div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {selectedInvoice.file_name || selectedInvoice.invoice_number}
                </h3>
                <p className="text-xs text-zinc-500">
                  Invoice #: <span className="font-mono font-medium">{selectedInvoice.invoice_number}</span>
                  {selectedInvoice.supplier_name && ` | Supplier: ${selectedInvoice.supplier_name}`}
                  {` | Date: ${selectedInvoice.invoice_date}`}
                  {selectedInvoice.extraction_provider && ` | Provider: ${selectedInvoice.extraction_provider}`}
                </p>
              </div>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                  <tr>
                    <th className="pb-2">Line</th>
                    <th className="pb-2">Raw Description</th>
                    <th className="pb-2">Supplier SKU</th>
                    <th className="pb-2">Pack</th>
                    <th className="pb-2 text-right">Qty</th>
                    <th className="pb-2 text-right">Unit Price</th>
                    <th className="pb-2 text-right">Line Total</th>
                    <th className="pb-2 text-right">Base Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {selectedInvoice.lines.map((l) => (
                    <tr key={l.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                      <td className="py-2.5 text-zinc-400 font-mono">{l.line_index}</td>
                      <td className="py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                        {l.raw_description}
                        {l.line_kind !== "item" && (
                          <span className="ml-2 rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500 uppercase">
                            {l.line_kind}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-zinc-500 font-mono">{l.supplier_sku || "—"}</td>
                      <td className="py-2.5 text-zinc-600 dark:text-zinc-400">{l.pack_descriptor || "—"}</td>
                      <td className="py-2.5 text-right font-mono">{l.quantity}</td>
                      <td className="py-2.5 text-right font-mono">${l.unit_price.toFixed(2)}</td>
                      <td className="py-2.5 text-right font-mono font-medium">${l.line_total.toFixed(2)}</td>
                      <td className="py-2.5 text-right font-mono text-orange-600 dark:text-orange-400 font-semibold">
                        {l.price_per_base_unit ? `$${l.price_per_base_unit.toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50 flex flex-wrap justify-between items-center gap-3 text-sm">
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500">
                  Validation: <strong className="text-zinc-700 dark:text-zinc-300">{selectedInvoice.validation_status}</strong>
                </span>
                <button
                  onClick={() => handleDeleteInvoice(selectedInvoice.id, selectedInvoice.file_name || selectedInvoice.invoice_number)}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Invoice & Reset Document
                </button>
              </div>
              <div className="flex gap-4 font-mono">
                <span>Subtotal: ${selectedInvoice.subtotal?.toFixed(2)}</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  Total: ${selectedInvoice.total.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

