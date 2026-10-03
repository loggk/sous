"""
Script to generate a realistic Broadline Distributor (Sysco GTA) invoice PDF for testing.
Output: sample_sysco_invoice.pdf
"""

import os
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

def generate_pdf(output_path="sample_sysco_invoice.pdf"):
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()

    # Custom styles
    brand_style = ParagraphStyle(
        "BrandHeader",
        parent=styles["Heading1"],
        fontSize=22,
        leading=24,
        textColor=colors.HexColor("#0f3d64"),  # Sysco blue
        fontName="Helvetica-Bold",
    )

    title_style = ParagraphStyle(
        "InvoiceTitle",
        parent=styles["Heading2"],
        fontSize=14,
        leading=16,
        textColor=colors.HexColor("#2d3748"),
        fontName="Helvetica-Bold",
        alignment=2,  # Right align
    )

    normal_style = ParagraphStyle(
        "NormalText",
        parent=styles["Normal"],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#2d3748"),
        fontName="Helvetica",
    )

    bold_style = ParagraphStyle(
        "BoldText",
        parent=styles["Normal"],
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#1a202c"),
        fontName="Helvetica-Bold",
    )

    table_header_style = ParagraphStyle(
        "TableHeader",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
        textColor=colors.white,
        fontName="Helvetica-Bold",
        alignment=1,
    )

    table_cell_style = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#2d3748"),
        fontName="Helvetica",
    )

    table_cell_right = ParagraphStyle(
        "TableCellRight",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#2d3748"),
        fontName="Helvetica",
        alignment=2,
    )

    story = []

    # 1. Header Section: Supplier Info + Invoice Title
    header_data = [
        [
            Paragraph("<b>SYSCO TORONTO</b>", brand_style),
            Paragraph("<b>INVOICE / DELIVERY RECEIPT</b>", title_style),
        ],
        [
            Paragraph("Sysco Canada Inc. &bull; Toronto OpCo<br/>21 Progress Ave, Scarborough, ON M1P 2Y7<br/>GST/HST: 104928172 RT0001", normal_style),
            Paragraph("<b>Invoice #:</b> SYS-7491028<br/><b>Invoice Date:</b> Oct 02, 2026<br/><b>Delivery Date:</b> Oct 03, 2026<br/><b>Payment Terms:</b> Net 14 Days", normal_style),
        ],
    ]
    t_header = Table(header_data, colWidths=[320, 220])
    t_header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(t_header)
    story.append(Spacer(1, 12))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#cbd5e0"), spaceBefore=2, spaceAfter=8))

    # 2. Bill To & Ship To
    addresses_data = [
        [
            Paragraph("<b>SOLD TO:</b>", bold_style),
            Paragraph("<b>SHIP TO:</b>", bold_style),
            Paragraph("<b>DELIVERY DETAILS:</b>", bold_style),
        ],
        [
            Paragraph("Queen St Slice Co.<br/>Acct #: 8472910<br/>620 Queen St W<br/>Toronto, ON M6J 1E4", normal_style),
            Paragraph("Queen St Slice Co.<br/>Store #101 - Downtown West<br/>620 Queen St W<br/>Toronto, ON M6J 1E4", normal_style),
            Paragraph("<b>Route:</b> 14-DOWNTOWN<br/><b>Stop:</b> 08<br/><b>Driver:</b> M. Kowalski<br/><b>Cases:</b> 15", normal_style),
        ],
    ]
    t_addr = Table(addresses_data, colWidths=[180, 180, 180])
    t_addr.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(t_addr)
    story.append(Spacer(1, 14))

    # 3. Line Items Table
    lines = [
        ("1", "SYS-10492", "Tomatoes, Roma 20lb CS", "20lb", "2", "38.50", "77.00"),
        ("2", "SYS-50211", "Canola Frying Oil 16L Pail", "16L", "2", "41.60", "83.20"),
        ("3", "SYS-21045", "Mozzarella Shredded 28% MF", "4x2.5kg", "3", "118.00", "354.00"),
        ("4", "SYS-33019", "Flour Unbleached Pizza '00'", "20kg", "5", "29.00", "145.00"),
        ("5", "SYS-88120", "Pepperoni Sliced 14-slice/oz", "2x5kg", "2", "119.00", "238.00"),
        ("6", "SYS-90001", "Broadline Delivery Fuel Surcharge", "EA", "1", "7.25", "7.25"),
    ]

    table_data = [
        [
            Paragraph("Ln", table_header_style),
            Paragraph("Supplier SKU", table_header_style),
            Paragraph("Description", table_header_style),
            Paragraph("Pack Size", table_header_style),
            Paragraph("Qty", table_header_style),
            Paragraph("Unit Price", table_header_style),
            Paragraph("Extended Total", table_header_style),
        ]
    ]

    for ln, sku, desc, pack, qty, price, ext in lines:
        table_data.append([
            Paragraph(ln, table_cell_style),
            Paragraph(sku, table_cell_style),
            Paragraph(desc, table_cell_style),
            Paragraph(pack, table_cell_style),
            Paragraph(qty, table_cell_right),
            Paragraph(f"${price}", table_cell_right),
            Paragraph(f"${ext}", table_cell_right),
        ])

    t_lines = Table(table_data, colWidths=[25, 75, 210, 65, 35, 60, 70])
    t_lines.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f3d64")),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t_lines)
    story.append(Spacer(1, 14))

    # 4. Summary & Totals Block
    summary_data = [
        [
            Paragraph("<b>IMPORTANT NOTICE TO CUSTOMER:</b><br/>"
                      "All claims for shortage, breakage, or quality must be noted on this receipt at time of delivery.<br/>"
                      "Gross invoiced amounts shown. Terms Net 14 Days. Thank you for your business!", normal_style),
            Table([
                [Paragraph("Merchandise Subtotal:", normal_style), Paragraph("$897.20", table_cell_right)],
                [Paragraph("Fuel Surcharges:", normal_style), Paragraph("$7.25", table_cell_right)],
                [Paragraph("HST (Groceries Zero-Rated):", normal_style), Paragraph("$0.00", table_cell_right)],
                [Paragraph("<b>TOTAL DUE (CAD):</b>", bold_style), Paragraph("<b>$904.45</b>", ParagraphStyle("BigTotal", parent=table_cell_right, fontSize=11, fontName="Helvetica-Bold", textColor=colors.HexColor("#0f3d64")))],
            ], colWidths=[130, 80], style=[
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("LINEABOVE", (0, 3), (-1, 3), 1, colors.HexColor("#0f3d64")),
            ])
        ]
    ]

    t_summary = Table(summary_data, colWidths=[330, 210])
    t_summary.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (1, 0), (1, 0), 0.5, colors.HexColor("#cbd5e0")),
        ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#f1f5f9")),
        ("LEFTPADDING", (1, 0), (1, 0), 8),
        ("RIGHTPADDING", (1, 0), (1, 0), 8),
        ("TOPPADDING", (1, 0), (1, 0), 6),
        ("BOTTOMPADDING", (1, 0), (1, 0), 6),
    ]))
    story.append(t_summary)
    story.append(Spacer(1, 24))

    # 5. Delivery Signature section
    sig_data = [
        [
            Paragraph("Received By (Print Name): ___________________________", normal_style),
            Paragraph("Signature: ___________________________", normal_style),
            Paragraph("Date: ____________", normal_style),
        ]
    ]
    t_sig = Table(sig_data, colWidths=[200, 200, 140])
    story.append(t_sig)

    doc.build(story)
    print(f"✓ Generated PDF: {output_path} ({os.path.getsize(output_path)} bytes)")

if __name__ == "__main__":
    generate_pdf()
