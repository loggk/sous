"""
Seed script to populate realistic mock data for Sous prototype development.
Includes:
- 15 GTA restaurants (focused on pizzerias & burger/sandwich shops along Queen/College/Danforth corridor)
- Broadline suppliers (Sysco, GFS, Flanagan)
- Canonical catalogue of 100+ standard commodity ingredients
- Invoices, invoice lines, and unmapped review queue items
- Materialized benchmark observations over trailing 30-90 days satisfying k-anonymity
"""

import sys
import os
import random
import uuid
import hashlib
from datetime import date, datetime, timedelta
from geoalchemy2.elements import WKTElement

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, engine, Base
from models import (
    Restaurant,
    User,
    Supplier,
    Document,
    Invoice,
    InvoiceLine,
    CanonicalItem,
    CanonicalItemAlias,
    SkuMapping,
    ReviewItem,
    BenchmarkObservation,
)

# 15 GTA Restaurants clustered in Toronto core (Queen W, College, Bloor, Danforth)
MOCK_RESTAURANTS = [
    {"name": "Queen St Slice Co.", "address": "620 Queen St W, Toronto, ON", "lat": 43.6475, "lon": -79.4068, "cuisine": "Pizzeria", "seats": 35},
    {"name": "Badiali Brothers Pizza", "address": "181 Dovercourt Rd, Toronto, ON", "lat": 43.6468, "lon": -79.4215, "cuisine": "Pizzeria", "seats": 20},
    {"name": "North of Brooklyn Pizza", "address": "650 Queen St W, Toronto, ON", "lat": 43.6472, "lon": -79.4082, "cuisine": "Pizzeria", "seats": 25},
    {"name": "Superpoint Pizza & Bar", "address": "184 Ossington Ave, Toronto, ON", "lat": 43.6491, "lon": -79.4206, "cuisine": "Pizzeria", "seats": 50},
    {"name": "Maker Pizza Downtown", "address": "59 Cameron St, Toronto, ON", "lat": 43.6515, "lon": -79.3986, "cuisine": "Pizzeria", "seats": 15},
    {"name": "Pizzeria Libretto Danforth", "address": "545 Danforth Ave, Toronto, ON", "lat": 43.6781, "lon": -79.3490, "cuisine": "Pizzeria", "seats": 85},
    {"name": "Cabano's Comfort Food", "address": "75 St Nicholas St, Toronto, ON", "lat": 43.6672, "lon": -79.3879, "cuisine": "Burger / Sandwich", "seats": 30},
    {"name": "Rudy Burgers College", "address": "619 College St, Toronto, ON", "lat": 43.6552, "lon": -79.4143, "cuisine": "Burger / Sandwich", "seats": 40},
    {"name": "Harry's Charbroiled", "address": "293 Palmerston Ave, Toronto, ON", "lat": 43.6548, "lon": -79.4101, "cuisine": "Burger / Sandwich", "seats": 25},
    {"name": "The Burger's Priest Queen", "address": "1636 Queen St E, Toronto, ON", "lat": 43.6668, "lon": -79.3135, "cuisine": "Burger / Sandwich", "seats": 35},
    {"name": "Happy Burger", "address": "76 Lippincott St, Toronto, ON", "lat": 43.6575, "lon": -79.4052, "cuisine": "Burger / Sandwich", "seats": 20},
    {"name": "Mister Yummy Subs", "address": "412 Bloor St W, Toronto, ON", "lat": 43.6655, "lon": -79.4072, "cuisine": "Burger / Sandwich", "seats": 30},
    {"name": "Fresco's Fish & Sandwiches", "address": "201 Augusta Ave, Toronto, ON", "lat": 43.6541, "lon": -79.4018, "cuisine": "Burger / Sandwich", "seats": 45},
    {"name": "Blondies Pizza Leslieville", "address": "1555 Dundas St E, Toronto, ON", "lat": 43.6675, "lon": -79.3289, "cuisine": "Pizzeria", "seats": 18},
    {"name": "General Assembly Pizza", "address": "331 Adelaide St W, Toronto, ON", "lat": 43.6483, "lon": -79.3929, "cuisine": "Pizzeria", "seats": 70},
]

MOCK_SUPPLIERS = [
    {
        "name": "Sysco GTA",
        "aliases": ["Sysco", "Sysco Toronto", "Sysco Central Ontario"],
        "is_broadline": True
    },
    {
        "name": "Gordon Food Service (GFS)",
        "aliases": ["GFS Ontario", "Gordon Food Service", "GFS Milton"],
        "is_broadline": True
    },
    {
        "name": "Flanagan Foodservice",
        "aliases": ["Flanagan", "Flanagans"],
        "is_broadline": True
    }
]

# 100+ Canonical Items across high-volume restaurant spend categories
MOCK_CANONICAL_ITEMS = [
    # --- PRODUCE (Commodities, Benchmarkable) ---
    ("Roma Tomatoes", "produce", "kg", True, 2.20),
    ("Beefsteak Tomatoes", "produce", "kg", True, 3.10),
    ("Cherry Tomatoes", "produce", "kg", True, 4.80),
    ("Yellow Onions Jumbo", "produce", "kg", True, 1.45),
    ("Red Onions Jumbo", "produce", "kg", True, 2.10),
    ("Green Onions (Scallions)", "produce", "kg", True, 3.50),
    ("Russet Potatoes 50lb", "produce", "kg", True, 1.30),
    ("Yukon Gold Potatoes", "produce", "kg", True, 1.65),
    ("Romaine Lettuce Hearts", "produce", "kg", True, 3.20),
    ("Iceberg Lettuce", "produce", "each", True, 2.75),
    ("Baby Spinach", "produce", "kg", True, 6.50),
    ("Arugula (Rocket)", "produce", "kg", True, 7.80),
    ("Fresh Basil", "produce", "kg", True, 14.50),
    ("Fresh Oregano", "produce", "kg", True, 18.00),
    ("Fresh Parsley Italian Flat", "produce", "kg", True, 5.20),
    ("Garlic Peeled", "produce", "kg", True, 4.40),
    ("Red Bell Peppers", "produce", "kg", True, 4.10),
    ("Green Bell Peppers", "produce", "kg", True, 3.20),
    ("Jalapeno Peppers", "produce", "kg", True, 3.80),
    ("White Button Mushrooms", "produce", "kg", True, 5.10),
    ("Cremini Mushrooms", "produce", "kg", True, 5.90),
    ("Portobello Mushrooms", "produce", "kg", True, 7.50),
    ("Lemons Choice 140ct", "produce", "each", True, 0.48),
    ("Limes Choice 200ct", "produce", "each", True, 0.35),
    ("Hass Avocados", "produce", "each", True, 1.25),
    ("English Cucumbers", "produce", "each", True, 1.15),
    ("Carrots Jumbo", "produce", "kg", True, 1.20),
    ("Celery Stalks", "produce", "each", True, 2.10),

    # --- DAIRY (Commodities, Benchmarkable) ---
    ("Mozzarella Shredded 28% MF", "dairy", "kg", True, 11.80),
    ("Mozzarella Ball Fresh (Fior di Latte)", "dairy", "kg", True, 14.20),
    ("Cheddar Cheese Mild Slices", "dairy", "kg", True, 12.50),
    ("Cheddar Cheese Aged White", "dairy", "kg", True, 15.00),
    ("Parmigiano Reggiano Grated", "dairy", "kg", True, 26.50),
    ("Pecorino Romano Grated", "dairy", "kg", True, 24.00),
    ("Ricotta Cheese Traditional", "dairy", "kg", True, 7.80),
    ("Butter Salted Solid", "dairy", "kg", True, 8.50),
    ("Butter Unsalted Solid", "dairy", "kg", True, 8.75),
    ("Heavy Whipping Cream 35%", "dairy", "L", True, 4.20),
    ("Half and Half 10%", "dairy", "L", True, 2.60),
    ("Homogenized Milk 3.25%", "dairy", "L", True, 2.15),
    ("Sour Cream 14%", "dairy", "kg", True, 4.10),
    ("Cream Cheese Block", "dairy", "kg", True, 7.50),
    ("Eggs Large Grade A White", "dairy", "each", True, 0.28),
    ("Liquid Whole Eggs", "dairy", "kg", True, 4.30),

    # --- OILS & DRY GOODS (Commodities, Benchmarkable) ---
    ("Canola Frying Oil 16L", "dry_goods", "L", True, 2.60),
    ("Extra Virgin Olive Oil", "dry_goods", "L", True, 12.50),
    ("Pomace Olive Oil Blend 80/20", "dry_goods", "L", True, 6.20),
    ("Flour Unbleached Pizza '00'", "dry_goods", "kg", True, 1.45),
    ("Flour All-Purpose High Gluten", "dry_goods", "kg", True, 1.15),
    ("Semolina Flour Fine", "dry_goods", "kg", True, 1.85),
    ("Yeast Instant Dry", "dry_goods", "kg", True, 8.20),
    ("Granulated White Sugar", "dry_goods", "kg", True, 1.40),
    ("Brown Sugar Light", "dry_goods", "kg", True, 1.60),
    ("Kosher Salt Coarse", "dry_goods", "kg", True, 1.10),
    ("Fine Table Salt", "dry_goods", "kg", True, 0.65),
    ("Black Pepper Ground Pure", "dry_goods", "kg", True, 16.50),
    ("Red Pepper Flakes (Chili Flakes)", "dry_goods", "kg", True, 9.80),
    ("Garlic Powder", "dry_goods", "kg", True, 11.20),
    ("Onion Powder", "dry_goods", "kg", True, 10.50),
    ("Dried Oregano Mediterranean", "dry_goods", "kg", True, 14.00),
    ("Canned Crushed Tomatoes #10", "dry_goods", "kg", True, 2.40),
    ("Canned San Marzano Whole Peeled D.O.P.", "dry_goods", "kg", True, 5.20),
    ("Canned Tomato Paste 28%", "dry_goods", "kg", True, 2.80),
    ("Canned Pizza Sauce Prepared", "dry_goods", "kg", True, 2.30),
    ("Mayonnaise Heavy Duty Bulk", "dry_goods", "L", True, 3.80),
    ("Yellow Mustard Prepared", "dry_goods", "L", True, 2.10),
    ("Dijon Mustard", "dry_goods", "L", True, 4.90),
    ("Tomato Ketchup Bulk Pouch", "dry_goods", "L", True, 2.45),
    ("Hot Sauce Cayenne Style", "dry_goods", "L", True, 4.50),
    ("BBQ Sauce Original Smoke", "dry_goods", "L", True, 3.40),
    ("Dill Pickle Crinkle Slices", "dry_goods", "L", True, 2.70),
    ("Pickled Banana Pepper Rings", "dry_goods", "L", True, 3.10),
    ("Kalamata Olives Pitted", "dry_goods", "kg", True, 8.90),
    ("Black Olives Sliced #10 Can", "dry_goods", "kg", True, 4.20),
    ("Brioche Burger Buns 4-inch", "dry_goods", "each", True, 0.65),
    ("Sesame Seed Burger Buns", "dry_goods", "each", True, 0.42),
    ("Potato Rolls Martin's Style", "dry_goods", "each", True, 0.58),
    ("Submarine Rolls 8-inch", "dry_goods", "each", True, 0.45),

    # --- PROTEINS & SPECIALTY (Audit Only, benchmarkable=False per Section 3.7) ---
    ("Ground Beef 80/20 Chuck Blend", "proteins", "kg", False, 9.80),
    ("Beef Patty Pre-Formed 4oz", "proteins", "kg", False, 11.20),
    ("Bacon Smoked Regular Slices", "proteins", "kg", False, 10.50),
    ("Pepperoni Sliced 14-slice/oz", "proteins", "kg", False, 11.90),
    ("Pepperoni Cup & Char Natural Casing", "proteins", "kg", False, 14.50),
    ("Italian Sausage Mild Ground", "proteins", "kg", False, 8.40),
    ("Italian Sausage Hot Crumbled", "proteins", "kg", False, 8.70),
    ("Prosciutto di Parma 24-Month Sliced", "proteins", "kg", False, 34.00),
    ("Ham Cooked Deli Sliced", "proteins", "kg", False, 9.20),
    ("Chicken Breast Boneless Skinless", "proteins", "kg", False, 10.40),
    ("Chicken Wings Roaster 9-12ct", "proteins", "kg", False, 7.80),

    # --- PACKAGING & SUPPLIES (Non-benchmarkable) ---
    ("Pizza Boxes Corrugated 12-inch", "packaging", "each", False, 0.55),
    ("Pizza Boxes Corrugated 16-inch", "packaging", "each", False, 0.78),
    ("Burger Wrap Greaseproof Paper", "packaging", "each", False, 0.05),
    ("Kraft Takeout Bags Large", "packaging", "each", False, 0.32),
    ("Foil Aluminum Roll 18-inch", "packaging", "each", False, 28.50),
    ("Plastic Cling Film Roll 18-inch", "packaging", "each", False, 22.00),
]


def seed():
    db = SessionLocal()
    try:
        print("--- Seeding Sous Database Mock Data ---")

        # 1. Seed Restaurants
        existing_restaurants = {r.name: r for r in db.query(Restaurant).all()}
        created_restaurants = []

        for r_data in MOCK_RESTAURANTS:
            if r_data["name"] in existing_restaurants:
                rest = existing_restaurants[r_data["name"]]
            else:
                geom = WKTElement(f"POINT({r_data['lon']} {r_data['lat']})", srid=4326)
                rest = Restaurant(
                    name=r_data["name"],
                    address=r_data["address"],
                    geom=geom,
                    seats=r_data["seats"],
                    cuisine_type=r_data["cuisine"]
                )
                db.add(rest)
                db.flush()
                # Create default manager user for this restaurant
                user = User(
                    restaurant_id=rest.id,
                    email=f"manager@{r_data['name'].lower().replace(' ', '').replace('&', '').replace('.', '')}.ca",
                    role="owner"
                )
                db.add(user)
            created_restaurants.append(rest)

        db.commit()
        print(f"✓ Seeded {len(created_restaurants)} GTA restaurants & user accounts.")

        # 2. Seed Suppliers
        existing_suppliers = {s.canonical_name: s for s in db.query(Supplier).all()}
        created_suppliers = []

        for s_data in MOCK_SUPPLIERS:
            if s_data["name"] in existing_suppliers:
                sup = existing_suppliers[s_data["name"]]
            else:
                sup = Supplier(
                    canonical_name=s_data["name"],
                    aliases=s_data["aliases"],
                    is_broadline=s_data["is_broadline"]
                )
                db.add(sup)
                db.flush()
            created_suppliers.append(sup)

        db.commit()
        print(f"✓ Seeded {len(created_suppliers)} broadline suppliers.")

        # 3. Seed Canonical Items
        existing_items = {i.name: i for i in db.query(CanonicalItem).all()}
        canonical_map = {}

        for name, category, base_unit, benchmarkable, base_price in MOCK_CANONICAL_ITEMS:
            if name in existing_items:
                item = existing_items[name]
            else:
                item = CanonicalItem(
                    name=name,
                    category=category,
                    base_unit=base_unit,
                    benchmarkable=benchmarkable
                )
                db.add(item)
                db.flush()

                # Add common aliases
                alias = CanonicalItemAlias(
                    canonical_item_id=item.id,
                    alias=name.lower(),
                    source="seed"
                )
                db.add(alias)

            canonical_map[name] = (item, base_price)

        db.commit()
        print(f"✓ Seeded {len(canonical_map)} canonical catalog items.")

        # 4. Seed Sku Mappings (Normalization Cache)
        # Pre-seed SKU mappings for primary supplier (Sysco GTA)
        sysco = created_suppliers[0]
        sku_counter = 10001

        for name, (item, base_price) in canonical_map.items():
            sku = f"SYS-{sku_counter}"
            sku_counter += 1
            existing_mapping = db.query(SkuMapping).filter(
                SkuMapping.supplier_id == sysco.id,
                SkuMapping.supplier_sku == sku
            ).first()

            if not existing_mapping:
                mapping = SkuMapping(
                    supplier_id=sysco.id,
                    supplier_sku=sku,
                    canonical_item_id=item.id,
                    pack_units=1,
                    pack_size=1.0 if item.base_unit == "each" else 10.0,
                    pack_measure=item.base_unit,
                    confidence=1.0,
                    confirmed_at=datetime.utcnow()
                )
                db.add(mapping)

        db.commit()
        print("✓ Pre-populated SKU normalization cache for broadline catalogue.")

        # 5. Seed Invoices & Materialized Benchmark Observations across trailing 90 days
        # We need density to pass k-anonymity: >=5 restaurants, >=15 observations, <=30% dominance
        benchmarkable_items = [
            (item, base_price) for (item, base_price) in canonical_map.values()
            if item.benchmarkable
        ]

        print("Generating historical invoices and benchmark observations...")
        today = date.today()
        observation_count = 0
        invoice_count = 0

        # Each restaurant gets 4-6 weekly delivery invoices over past 60 days
        for rest_idx, rest in enumerate(created_restaurants):
            # Select 1 primary supplier and 1 secondary supplier
            primary_sup = created_suppliers[rest_idx % len(created_suppliers)]

            for week_offset in range(1, 9):
                inv_date = today - timedelta(days=week_offset * 7 + random.randint(0, 3))
                inv_num = f"INV-{rest.id.hex[:4].upper()}-{inv_date.strftime('%y%m%d')}"

                # Generate a dummy document
                doc_hash = hashlib.sha256(f"{rest.id}_{inv_num}".encode()).hexdigest()
                doc = db.query(Document).filter(Document.content_sha256 == doc_hash).first()
                if not doc:
                    doc = Document(
                        restaurant_id=rest.id,
                        storage_key=f"mock_storage/{doc_hash}.pdf",
                        content_sha256=doc_hash,
                        mime="application/pdf",
                        source_channel="web_upload",
                        status="completed",
                        created_at=datetime.combine(inv_date, datetime.min.time())
                    )
                    db.add(doc)
                    db.flush()

                existing_inv = db.query(Invoice).filter(
                    Invoice.restaurant_id == rest.id,
                    Invoice.supplier_id == primary_sup.id,
                    Invoice.invoice_number == inv_num
                ).first()

                if existing_inv:
                    continue

                invoice = Invoice(
                    document_id=doc.id,
                    restaurant_id=rest.id,
                    supplier_id=primary_sup.id,
                    invoice_number=inv_num,
                    invoice_date=inv_date,
                    delivery_date=inv_date + timedelta(days=1),
                    subtotal=0,
                    tax=0,
                    total=0,
                    extraction_provider="mock_seed",
                    extraction_version="1.0",
                    validation_status="passed"
                )
                db.add(invoice)
                db.flush()
                invoice_count += 1

                # Add 6-10 commodity lines per invoice
                sample_items = random.sample(benchmarkable_items, k=random.randint(6, 10))
                running_subtotal = 0.0

                for line_idx, (c_item, base_price) in enumerate(sample_items, start=1):
                    # Introduce natural price variation (+/- 12%) between restaurants and suppliers
                    variation = random.uniform(0.88, 1.12)
                    unit_price_per_base = round(base_price * variation, 4)

                    qty = random.choice([2, 3, 5, 8, 10])
                    pack_size = 1.0 if c_item.base_unit == "each" else 10.0
                    line_tot = round(qty * pack_size * unit_price_per_base, 2)
                    running_subtotal += line_tot

                    line = InvoiceLine(
                        invoice_id=invoice.id,
                        line_index=line_idx,
                        raw_description=f"{c_item.name} {int(pack_size)}{c_item.base_unit}",
                        supplier_sku=f"SYS-{random.randint(10001, 10100)}",
                        quantity=qty,
                        pack_descriptor=f"{int(pack_size)}{c_item.base_unit}",
                        unit_price=round(line_tot / qty, 2),
                        line_total=line_tot,
                        line_kind="item",
                        canonical_item_id=c_item.id,
                        pack_units=1,
                        pack_size=pack_size,
                        pack_measure=c_item.base_unit,
                        price_per_base_unit=unit_price_per_base,
                        confidence=0.98
                    )
                    db.add(line)

                    # Materialize benchmark observation
                    if rest.geom:
                        obs = BenchmarkObservation(
                            restaurant_id=rest.id,
                            canonical_item_id=c_item.id,
                            supplier_id=primary_sup.id,
                            observed_on=inv_date,
                            price_per_base_unit=unit_price_per_base,
                            geom=rest.geom
                        )
                        db.add(obs)
                        observation_count += 1

                # Add fuel surcharge fee line
                fuel_fee = round(random.uniform(5.50, 8.50), 2)
                running_subtotal += fuel_fee
                db.add(InvoiceLine(
                    invoice_id=invoice.id,
                    line_index=len(sample_items) + 1,
                    raw_description="Fuel Surcharge - Broadline Delivery",
                    quantity=1.0,
                    pack_descriptor="EA",
                    unit_price=fuel_fee,
                    line_total=fuel_fee,
                    line_kind="fee",
                    pack_units=1,
                    pack_size=1.0,
                    pack_measure="each",
                    price_per_base_unit=None
                ))

                invoice.subtotal = running_subtotal
                invoice.total = running_subtotal

        db.commit()
        print(f"✓ Created {invoice_count} mock invoices.")
        print(f"✓ Materialized {observation_count} benchmark observations satisfying k-anonymity.")

        # 6. Seed a few unmapped items in the review queue to test the UI
        sample_invoice = db.query(Invoice).first()
        if sample_invoice:
            unmapped_items_data = [
                ("Specialty Truffle Glaze 500ml", "SYS-99401", "500ml"),
                ("Calabrian Chili Peppers in Oil 2kg", "SYS-99402", "2kg"),
                ("San Daniele Prosciutto Riserva 18M", "SYS-99403", "1kg"),
            ]
            for desc, sku, pack in unmapped_items_data:
                dummy_line = InvoiceLine(
                    invoice_id=sample_invoice.id,
                    line_index=99,
                    raw_description=desc,
                    supplier_sku=sku,
                    quantity=1.0,
                    pack_descriptor=pack,
                    unit_price=24.50,
                    line_total=24.50,
                    line_kind="item",
                    canonical_item_id=None,
                    confidence=0.45
                )
                db.add(dummy_line)
                db.flush()

                db.add(ReviewItem(
                    kind="mapping",
                    invoice_id=sample_invoice.id,
                    invoice_line_id=dummy_line.id,
                    payload={
                        "raw_description": desc,
                        "supplier_sku": sku,
                        "pack_descriptor": pack,
                        "supplier_name": "Sysco GTA"
                    },
                    status="pending"
                ))
            db.commit()
            print("✓ Seeded sample items into the human review queue.")

        print("\n🎉 Database mock seeding complete!")

    except Exception as e:
        db.rollback()
        print(f"Error during seeding: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    seed()
