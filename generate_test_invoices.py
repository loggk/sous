"""
Script to generate realistic test invoice PDFs across broadline distributors.
Generated PDFs are saved to test_invoices/
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


def make_invoice(
    output_path: str,
    supplier_brand_html: str,
    supplier_address_html: str,
    brand_color_hex: str,
    inv_number: str,
    inv_date: str,
    del_date: str,
    customer_account: str,
    route_info: str,
    lines: list,
    merchandise_subtotal: str,
    fuel_surcharge: str,
    total_due: str,
):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
    )
    styles = getSampleStyleSheet()

    brand_style = ParagraphStyle(
        "BrandHeader",
        parent=styles["Heading1"],
        fontSize=20,
        leading=22,
        textColor=colors.HexColor(brand_color_hex),
        fontName="Helvetica-Bold",
    )

    title_style = ParagraphStyle(
        "InvoiceTitle",
        parent=styles["Heading2"],
        fontSize=13,
        leading=15,
        textColor=colors.HexColor("#2d3748"),
        fontName="Helvetica-Bold",
        alignment=2,
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

    # 1. Header Section
    header_data = [
        [
            Paragraph(f"<b>{supplier_brand_html}</b>", brand_style),
            Paragraph("<b>INVOICE / DELIVERY RECEIPT</b>", title_style),
        ],
        [
            Paragraph(supplier_address_html, normal_style),
            Paragraph(
                f"<b>Invoice #:</b> {inv_number}<br/><b>Invoice Date:</b> {inv_date}<br/><b>Delivery Date:</b> {del_date}<br/><b>Payment Terms:</b> Net 14 Days",
                normal_style,
            ),
        ],
    ]
    t_header = Table(header_data, colWidths=[320, 220])
    t_header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(t_header)
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#cbd5e0"), spaceBefore=2, spaceAfter=8))

    # 2. Addresses
    addresses_data = [
        [
            Paragraph("<b>SOLD TO:</b>", bold_style),
            Paragraph("<b>SHIP TO:</b>", bold_style),
            Paragraph("<b>DELIVERY DETAILS:</b>", bold_style),
        ],
        [
            Paragraph(f"Queen St Slice Co.<br/>Acct #: {customer_account}<br/>620 Queen St W<br/>Toronto, ON M6J 1E4", normal_style),
            Paragraph(f"Queen St Slice Co.<br/>Store #101 - Downtown West<br/>620 Queen St W<br/>Toronto, ON M6J 1E4", normal_style),
            Paragraph(route_info, normal_style),
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
    story.append(Spacer(1, 12))

    # 3. Line Items Table
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
            Paragraph(str(ln), table_cell_style),
            Paragraph(sku, table_cell_style),
            Paragraph(desc, table_cell_style),
            Paragraph(pack, table_cell_style),
            Paragraph(str(qty), table_cell_right),
            Paragraph(f"${price}", table_cell_right),
            Paragraph(f"${ext}", table_cell_right),
        ])

    t_lines = Table(table_data, colWidths=[25, 75, 210, 65, 35, 60, 70])
    t_lines.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(brand_color_hex)),
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
    story.append(Spacer(1, 12))

    # 4. Summary & Totals
    summary_data = [
        [
            Paragraph(
                "<b>IMPORTANT NOTICE TO CUSTOMER:</b><br/>"
                "All claims for shortage, breakage, or quality must be noted on this receipt at time of delivery.<br/>"
                "Gross invoiced amounts shown. Terms Net 14 Days. Thank you for your business!",
                normal_style,
            ),
            Table(
                [
                    [Paragraph("Merchandise Subtotal:", normal_style), Paragraph(f"${merchandise_subtotal}", table_cell_right)],
                    [Paragraph("Fuel Surcharges:", normal_style), Paragraph(f"${fuel_surcharge}", table_cell_right)],
                    [Paragraph("HST (Groceries Zero-Rated):", normal_style), Paragraph("$0.00", table_cell_right)],
                    [
                        Paragraph("<b>TOTAL DUE (CAD):</b>", bold_style),
                        Paragraph(
                            f"<b>${total_due}</b>",
                            ParagraphStyle("BigTotal", parent=table_cell_right, fontSize=11, fontName="Helvetica-Bold", textColor=colors.HexColor(brand_color_hex)),
                        ),
                    ],
                ],
                colWidths=[130, 80],
                style=[
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("LINEABOVE", (0, 3), (-1, 3), 1, colors.HexColor(brand_color_hex)),
                ],
            ),
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
    story.append(Spacer(1, 20))

    # 5. Signature
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
    print(f"✓ Generated {output_path} ({os.path.getsize(output_path)} bytes)")


def generate_all():
    # Invoice 1: Sysco GTA Produce & Dairy Delivery
    make_invoice(
        "test_invoices/01_sysco_produce_dairy.pdf",
        "SYSCO TORONTO",
        "Sysco Canada Inc. &bull; Toronto OpCo<br/>21 Progress Ave, Scarborough, ON M1P 2Y7<br/>GST/HST: 104928172 RT0001",
        "#0f3d64",
        "SYS-8492011",
        "Oct 02, 2026",
        "Oct 03, 2026",
        "8472910",
        "<b>Route:</b> 14-DOWNTOWN<br/><b>Stop:</b> 08<br/><b>Driver:</b> M. Kowalski<br/><b>Cases:</b> 12",
        [
            ("1", "SYS-10492", "Tomatoes, Roma 20lb CS", "20lb", "3", "39.50", "118.50"),
            ("2", "SYS-21045", "Mozzarella Shredded 28% MF", "4x2.5kg", "4", "118.00", "472.00"),
            ("3", "SYS-10488", "Fresh Basil Organic 1lb", "1lb", "2", "14.50", "29.00"),
            ("4", "SYS-21049", "Heavy Whipping Cream 35% 4L", "4x4L", "2", "42.00", "84.00"),
            ("5", "SYS-10481", "Green Onions (Scallions) CS", "48ct", "1", "35.00", "35.00"),
            ("6", "SYS-90001", "Broadline Delivery Fuel Surcharge", "EA", "1", "7.50", "7.50"),
        ],
        "738.50",
        "7.50",
        "746.00",
    )

    # Invoice 2: Gordon Food Service (GFS) Dry Goods & Proteins
    make_invoice(
        "test_invoices/02_gfs_drygoods_meat.pdf",
        "GORDON FOOD SERVICE",
        "Gordon Food Service Canada Ltd. &bull; Ontario DC<br/>5555 GFS Way, Milton, ON L9T 6Z5<br/>GST/HST: 123984719 RT0001",
        "#b81414",
        "GFS-5928104",
        "Oct 03, 2026",
        "Oct 04, 2026",
        "GFS-91824",
        "<b>Route:</b> GFS-TOR-4<br/><b>Stop:</b> 12<br/><b>Driver:</b> T. Henderson<br/><b>Cases:</b> 16",
        [
            ("1", "GFS-33019", "Flour Unbleached Pizza '00' 20kg", "20kg", "6", "28.50", "171.00"),
            ("2", "GFS-50211", "Canola Frying Oil 16L JIB", "16L", "4", "42.50", "170.00"),
            ("3", "GFS-88120", "Pepperoni Sliced 14-slice/oz 10kg", "2x5kg", "3", "122.00", "366.00"),
            ("4", "GFS-33022", "Semolina Flour Fine 20kg", "20kg", "2", "36.00", "72.00"),
            ("5", "GFS-33025", "Instant Dry Yeast 500g", "20x500g", "1", "82.00", "82.00"),
            ("6", "GFS-90002", "Fuel and Environmental Surcharge", "EA", "1", "8.25", "8.25"),
        ],
        "861.00",
        "8.25",
        "869.25",
    )

    # Invoice 3: Flanagan Foodservice Specialty Italian Cheeses & Oils
    make_invoice(
        "test_invoices/03_flanagan_specialty_cheese.pdf",
        "FLANAGAN FOODSERVICE",
        "Flanagan Foodservice Inc. &bull; Kitchener/GTA DC<br/>100 Lackner Place, Kitchener, ON N2E 4A8<br/>GST/HST: 101893714 RT0001",
        "#1e4c27",
        "FLA-7102948",
        "Oct 04, 2026",
        "Oct 05, 2026",
        "FLA-38192",
        "<b>Route:</b> FL-WEST-07<br/><b>Stop:</b> 04<br/><b>Driver:</b> D. Campbell<br/><b>Cases:</b> 11",
        [
            ("1", "FLA-21055", "Parmigiano Reggiano Grated 5kg", "5kg", "2", "132.50", "265.00"),
            ("2", "FLA-21058", "Pecorino Romano Grated 5kg", "5kg", "2", "120.00", "240.00"),
            ("3", "FLA-50215", "Extra Virgin Olive Oil 4x3L Tin", "4x3L", "2", "148.00", "296.00"),
            ("4", "FLA-10495", "Yukon Gold Potatoes 50lb Bag", "50lb", "3", "37.50", "112.50"),
            ("5", "FLA-21060", "Butter Salted Solid 25kg CS", "25kg", "1", "212.50", "212.50"),
            ("6", "FLA-90003", "Broadline Split Case & Fuel Fee", "EA", "1", "6.75", "6.75"),
        ],
        "1126.00",
        "6.75",
        "1132.75",
    )

    # Invoice 4: Sysco GTA Italian Pantry & Commodities
    make_invoice(
        "test_invoices/04_sysco_san_marzano_pantry.pdf",
        "SYSCO TORONTO",
        "Sysco Canada Inc. &bull; Toronto OpCo<br/>21 Progress Ave, Scarborough, ON M1P 2Y7<br/>GST/HST: 104928172 RT0001",
        "#0f3d64",
        "SYS-9104822",
        "Oct 03, 2026",
        "Oct 04, 2026",
        "8472910",
        "<b>Route:</b> 14-DOWNTOWN<br/><b>Stop:</b> 09<br/><b>Driver:</b> M. Kowalski<br/><b>Cases:</b> 15",
        [
            ("1", "SYS-50220", "Canned San Marzano Whole Peeled D.O.P.", "6x3kg", "6", "15.60", "93.60"),
            ("2", "SYS-50215", "Extra Virgin Olive Oil 4x3L Tin", "4x3L", "2", "152.00", "304.00"),
            ("3", "SYS-50228", "Kosher Salt Coarse 12x1kg", "12x1kg", "3", "13.20", "39.60"),
            ("4", "SYS-50230", "Granulated White Sugar 20kg Bag", "20kg", "2", "28.00", "56.00"),
            ("5", "SYS-10475", "Yellow Onions Jumbo 50lb Sack", "50lb", "3", "33.00", "99.00"),
            ("6", "SYS-90001", "Broadline Delivery Fuel Surcharge", "EA", "1", "8.50", "8.50"),
        ],
        "592.20",
        "8.50",
        "600.70",
    )

    # Invoice 5: Gordon Food Service (GFS) Dairy & Poultry Staples
    make_invoice(
        "test_invoices/05_gfs_dairy_poultry_staples.pdf",
        "GORDON FOOD SERVICE",
        "Gordon Food Service Canada Ltd. &bull; Ontario DC<br/>5555 GFS Way, Milton, ON L9T 6Z5<br/>GST/HST: 123984719 RT0001",
        "#b81414",
        "GFS-6284019",
        "Oct 04, 2026",
        "Oct 05, 2026",
        "GFS-91824",
        "<b>Route:</b> GFS-TOR-4<br/><b>Stop:</b> 14<br/><b>Driver:</b> T. Henderson<br/><b>Cases:</b> 14",
        [
            ("1", "GFS-21045", "Mozzarella Shredded 28% MF 4x2.5kg", "4x2.5kg", "4", "118.00", "472.00"),
            ("2", "GFS-21062", "Butter Unsalted Solid 25kg CS", "25kg", "1", "218.75", "218.75"),
            ("3", "GFS-21070", "Eggs Large Grade A White 15 Dozen", "180ct", "2", "50.40", "100.80"),
            ("4", "GFS-21049", "Heavy Whipping Cream 35% 4x4L", "4x4L", "2", "67.20", "134.40"),
            ("5", "GFS-88130", "Chicken Breast Boneless Skinless 2x5kg", "2x5kg", "3", "104.00", "312.00"),
            ("6", "GFS-90002", "Regulatory Fuel and Environmental Surcharge", "EA", "1", "9.25", "9.25"),
        ],
        "1237.95",
        "9.25",
        "1247.20",
    )

    # Invoice 6: Flanagan Foodservice Produce & Baking Delivery
    make_invoice(
        "test_invoices/06_flanagan_produce_and_baking.pdf",
        "FLANAGAN FOODSERVICE",
        "Flanagan Foodservice Inc. &bull; Kitchener/GTA DC<br/>100 Lackner Place, Kitchener, ON N2E 4A8<br/>GST/HST: 101893714 RT0001",
        "#1e4c27",
        "FLA-8491023",
        "Oct 05, 2026",
        "Oct 06, 2026",
        "FLA-38192",
        "<b>Route:</b> FL-WEST-07<br/><b>Stop:</b> 06<br/><b>Driver:</b> D. Campbell<br/><b>Cases:</b> 18",
        [
            ("1", "FLA-10492", "Roma Tomatoes 25lb CS", "25lb", "4", "49.50", "198.00"),
            ("2", "FLA-10495", "Yukon Gold Potatoes 50lb Bag", "50lb", "3", "37.50", "112.50"),
            ("3", "FLA-10498", "Romaine Lettuce Hearts 12x3ct CS", "36ct", "3", "32.00", "96.00"),
            ("4", "FLA-10502", "Garlic Peeled 5lb Tub", "5lb", "2", "22.00", "44.00"),
            ("5", "FLA-33015", "Flour All-Purpose High Gluten 20kg", "20kg", "5", "23.00", "115.00"),
            ("6", "FLA-90003", "Broadline Split Case & Fuel Fee", "EA", "1", "7.50", "7.50"),
        ],
        "565.50",
        "7.50",
        "573.00",
    )

    # Invoice 7: Sysco GTA Meats, Deli & Burger Bar Staples (Recent: Nov 08, 2026)
    make_invoice(
        "test_invoices/07_sysco_meats_and_deli.pdf",
        "SYSCO TORONTO",
        "Sysco Canada Inc. &bull; Toronto OpCo<br/>21 Progress Ave, Scarborough, ON M1P 2Y7<br/>GST/HST: 104928172 RT0001",
        "#0f3d64",
        "SYS-9841022",
        "Nov 08, 2026",
        "Nov 09, 2026",
        "8472910",
        "<b>Route:</b> 14-DOWNTOWN<br/><b>Stop:</b> 08<br/><b>Driver:</b> M. Kowalski<br/><b>Cases:</b> 14",
        [
            ("1", "SYS-88110", "Ground Beef 80/20 Chuck Blend", "10kg", "3", "98.00", "294.00"),
            ("2", "SYS-88125", "Bacon Smoked Regular Slices", "5kg", "4", "52.50", "210.00"),
            ("3", "SYS-21048", "Cheddar Cheese Mild Slices", "4x2.5kg", "2", "125.00", "250.00"),
            ("4", "SYS-33040", "Brioche Burger Buns 4-inch", "48ct", "3", "31.20", "93.60"),
            ("5", "SYS-50240", "Mayonnaise Heavy Duty Bulk", "16L", "1", "60.80", "60.80"),
            ("6", "SYS-90001", "Broadline Delivery Fuel Surcharge", "EA", "1", "8.50", "8.50"),
        ],
        "908.40",
        "8.50",
        "916.90",
    )

    # Invoice 8: Gordon Food Service (GFS) Produce, Peppers & Condiments (Recent: Nov 09, 2026)
    make_invoice(
        "test_invoices/08_gfs_fresh_produce_and_sauces.pdf",
        "GORDON FOOD SERVICE",
        "Gordon Food Service Canada Ltd. &bull; Ontario DC<br/>5555 GFS Way, Milton, ON L9T 6Z5<br/>GST/HST: 123984719 RT0001",
        "#b81414",
        "GFS-8492015",
        "Nov 09, 2026",
        "Nov 10, 2026",
        "GFS-91824",
        "<b>Route:</b> GFS-TOR-4<br/><b>Stop:</b> 11<br/><b>Driver:</b> T. Henderson<br/><b>Cases:</b> 15",
        [
            ("1", "GFS-10493", "Beefsteak Tomatoes 20lb CS", "20lb", "3", "31.00", "93.00"),
            ("2", "GFS-10510", "Red Bell Peppers 11lb CS", "11lb", "2", "22.50", "45.00"),
            ("3", "GFS-10520", "White Button Mushrooms 10lb CS", "10lb", "3", "25.50", "76.50"),
            ("4", "GFS-50222", "Canned Crushed Tomatoes #10", "6x3kg", "5", "43.20", "216.00"),
            ("5", "GFS-50250", "Dill Pickle Crinkle Slices 4x4L", "4x4L", "2", "43.20", "86.40"),
            ("6", "GFS-90002", "Fuel and Environmental Surcharge", "EA", "1", "8.75", "8.75"),
        ],
        "516.90",
        "8.75",
        "525.65",
    )

    # Invoice 9: Flanagan Foodservice Specialty Cheeses, Fresh Greens & Herbs (Recent: Nov 10, 2026)
    make_invoice(
        "test_invoices/09_flanagan_artisan_dairy_and_bakery.pdf",
        "FLANAGAN FOODSERVICE",
        "Flanagan Foodservice Inc. &bull; Kitchener/GTA DC<br/>100 Lackner Place, Kitchener, ON N2E 4A8<br/>GST/HST: 101893714 RT0001",
        "#1e4c27",
        "FLA-9831044",
        "Nov 10, 2026",
        "Nov 11, 2026",
        "FLA-38192",
        "<b>Route:</b> FL-WEST-07<br/><b>Stop:</b> 05<br/><b>Driver:</b> D. Campbell<br/><b>Cases:</b> 13",
        [
            ("1", "FLA-21046", "Mozzarella Ball Fresh (Fior di Latte)", "6x1kg", "3", "85.20", "255.60"),
            ("2", "FLA-21059", "Ricotta Cheese Traditional 4x2kg", "4x2kg", "2", "62.40", "124.80"),
            ("3", "FLA-10485", "Baby Spinach 4x2.5lb CS", "10lb", "2", "29.50", "59.00"),
            ("4", "FLA-10487", "Arugula (Rocket) 4x2lb CS", "8lb", "2", "28.30", "56.60"),
            ("5", "FLA-10490", "Fresh Parsley Italian Flat 30ct", "30ct", "1", "26.00", "26.00"),
            ("6", "FLA-90003", "Broadline Split Case & Fuel Fee", "EA", "1", "7.75", "7.75"),
        ],
        "522.00",
        "7.75",
        "529.75",
    )


if __name__ == "__main__":
    generate_all()

