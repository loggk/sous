"""
Dynamic Invoice PDF Generator for Sous.
Synthesizes professional broadline distributor invoices for mock/seeded records
or when an original scan is requested for demonstration.
"""

import io
from typing import Any
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable


def generate_invoice_pdf(invoice: Any) -> bytes:
    """
    Generate a high-fidelity PDF invoice for the given Invoice ORM model.
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
    )
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        "InvoiceTitle",
        parent=styles["Heading1"],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#1b2b4a"),
        fontName="Helvetica-Bold",
        spaceAfter=4,
    )
    subtitle_style = ParagraphStyle(
        "InvoiceSubtitle",
        parent=styles["Normal"],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#64748b"),
    )
    meta_label = ParagraphStyle(
        "MetaLabel",
        parent=styles["Normal"],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#475569"),
        fontName="Helvetica-Bold",
    )
    meta_val = ParagraphStyle(
        "MetaVal",
        parent=styles["Normal"],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#0f172a"),
    )
    cell_text = ParagraphStyle(
        "CellText",
        parent=styles["Normal"],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#1e293b"),
    )
    cell_bold = ParagraphStyle(
        "CellBold",
        parent=styles["Normal"],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#0f172a"),
        fontName="Helvetica-Bold",
    )

    elements = []

    # 1. Header Section
    supplier_name = (
        invoice.supplier.name.upper()
        if hasattr(invoice, "supplier") and invoice.supplier and invoice.supplier.name
        else "BROADLINE FOODSERVICE DISTRIBUTION"
    )
    inv_num = invoice.invoice_number or str(invoice.id)[:8].upper()
    inv_date = str(invoice.invoice_date or "2026-11-01")
    restaurant_name = (
        invoice.restaurant.name
        if hasattr(invoice, "restaurant") and invoice.restaurant and invoice.restaurant.name
        else "Sous Partner Restaurant"
    )
    restaurant_addr = (
        invoice.restaurant.address
        if hasattr(invoice, "restaurant") and invoice.restaurant and invoice.restaurant.address
        else "Toronto, ON"
    )

    header_table_data = [
        [
            Paragraph(f"<b>{supplier_name}</b>", title_style),
            Paragraph("<b>INVOICE / PACKING SLIP</b>", ParagraphStyle("RightTitle", parent=title_style, alignment=2)),
        ],
        [
            Paragraph("Broadline Food & Supply Logistics", subtitle_style),
            Paragraph(f"<b>Invoice #:</b> {inv_num}<br/><b>Invoice Date:</b> {inv_date}", ParagraphStyle("RightMeta", parent=subtitle_style, alignment=2)),
        ],
    ]
    header_table = Table(header_table_data, colWidths=[320, 220])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 12))

    # Divider line
    elements.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#2f4a7d"), spaceAfter=12))

    # 2. Bill To & Order Info Block
    bill_info = [
        [
            Paragraph("<b>DELIVER TO / BILL TO:</b>", meta_label),
            Paragraph("<b>ACCOUNT SUMMARY:</b>", meta_label),
        ],
        [
            Paragraph(f"<b>{restaurant_name}</b><br/>{restaurant_addr}", meta_val),
            Paragraph(f"Customer Acc #: <b>{str(invoice.restaurant_id)[:8].upper() if hasattr(invoice, 'restaurant_id') else '70192'}</b><br/>Terms: <b>Net 30 Days</b><br/>Status: <b>PROCESSED</b>", meta_val),
        ]
    ]
    info_table = Table(bill_info, colWidths=[320, 220])
    info_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 14))

    # 3. Line Items Table
    lines = getattr(invoice, "lines", []) or []
    table_rows = [
        [
            Paragraph("<b>#</b>", cell_bold),
            Paragraph("<b>Item Description / Broadline Spec</b>", cell_bold),
            Paragraph("<b>SKU</b>", cell_bold),
            Paragraph("<b>Pack Descriptor</b>", cell_bold),
            Paragraph("<b>Qty</b>", ParagraphStyle("RBold", parent=cell_bold, alignment=2)),
            Paragraph("<b>Unit Price</b>", ParagraphStyle("RBold", parent=cell_bold, alignment=2)),
            Paragraph("<b>Line Total</b>", ParagraphStyle("RBold", parent=cell_bold, alignment=2)),
        ]
    ]

    subtotal = 0.0
    for idx, line in enumerate(lines, 1):
        desc = line.raw_description or "Unspecified Item"
        sku = line.supplier_sku or "—"
        pack = line.pack_descriptor or "—"
        qty = float(line.quantity or 1.0)
        u_price = float(line.unit_price or 0.0)
        l_total = float(line.line_total or (qty * u_price))
        subtotal += l_total

        table_rows.append([
            Paragraph(str(line.line_index or idx), cell_text),
            Paragraph(desc, cell_text),
            Paragraph(sku, cell_text),
            Paragraph(pack, cell_text),
            Paragraph(f"{qty:g}", ParagraphStyle("RText", parent=cell_text, alignment=2)),
            Paragraph(f"${u_price:,.2f}", ParagraphStyle("RText", parent=cell_text, alignment=2)),
            Paragraph(f"${l_total:,.2f}", ParagraphStyle("RText", parent=cell_bold, alignment=2)),
        ])

    if not lines:
        table_rows.append([
            Paragraph("1", cell_text),
            Paragraph("Broadline Foodservice Delivery", cell_text),
            Paragraph("—", cell_text),
            Paragraph("1 Case", cell_text),
            Paragraph("1", ParagraphStyle("RText", parent=cell_text, alignment=2)),
            Paragraph(f"${float(invoice.total or 0.0):,.2f}", ParagraphStyle("RText", parent=cell_text, alignment=2)),
            Paragraph(f"${float(invoice.total or 0.0):,.2f}", ParagraphStyle("RText", parent=cell_bold, alignment=2)),
        ])
        subtotal = float(invoice.total or 0.0)

    line_table = Table(
        table_rows,
        colWidths=[24, 216, 60, 70, 40, 65, 65]
    )
    line_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1b2b4a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
    ]))
    elements.append(line_table)
    elements.append(Spacer(1, 10))

    # 4. Totals Summary Block
    inv_total = float(invoice.total or subtotal)
    tax_amt = float(getattr(invoice, "tax", 0.0) or 0.0)
    totals_data = [
        [Paragraph("Subtotal:", ParagraphStyle("RSub", parent=meta_label, alignment=2)), Paragraph(f"${subtotal:,.2f}", ParagraphStyle("RSubV", parent=meta_val, alignment=2))],
        [Paragraph("Taxes / HST:", ParagraphStyle("RSub", parent=meta_label, alignment=2)), Paragraph(f"${tax_amt:,.2f}", ParagraphStyle("RSubV", parent=meta_val, alignment=2))],
        [Paragraph("<b>TOTAL DUE:</b>", ParagraphStyle("RTot", parent=meta_label, fontSize=11, alignment=2)), Paragraph(f"<b>${inv_total:,.2f}</b>", ParagraphStyle("RTotV", parent=title_style, fontSize=12, alignment=2))],
    ]
    totals_table = Table(totals_data, colWidths=[440, 100])
    totals_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    elements.append(totals_table)
    elements.append(Spacer(1, 20))

    # 5. Footer Watermark
    footer_text = Paragraph(
        "<font color='#94a3b8'>Sous Cost-Intelligence Platform • Localized Restaurant Intelligence & Broadline Verification</font>",
        ParagraphStyle("Footer", parent=subtitle_style, alignment=1, fontSize=8)
    )
    elements.append(footer_text)

    doc.build(elements)
    return buf.getvalue()
