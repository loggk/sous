"""
Seed script to unlock a robust set of 20+ commodity benchmark items.
Ensures k-anonymity thresholds (>=5 restaurants, >=15 observations, <=30% dominance)
are fully satisfied in both 30-day and 90-day rolling windows.
"""

import os
import sys
import random
from datetime import date, timedelta
from sqlalchemy import text

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal
from models import Restaurant, Supplier, CanonicalItem, BenchmarkObservation, SkuMapping

TARGET_ITEMS = [
    # Produce
    ("Roma Tomatoes", 2.20),
    ("Yukon Gold Potatoes", 1.65),
    ("Yellow Onions Jumbo", 1.45),
    ("Romaine Lettuce Hearts", 3.20),
    ("Garlic Peeled", 4.40),
    ("Fresh Basil", 14.50),
    ("Green Onions (Scallions)", 3.50),
    # Dairy
    ("Mozzarella Shredded 28% MF", 11.80),
    ("Heavy Whipping Cream 35%", 4.20),
    ("Butter Unsalted Solid", 8.75),
    ("Butter Salted Solid", 8.50),
    ("Eggs Large Grade A White", 0.28),
    ("Parmigiano Reggiano Grated", 26.50),
    ("Pecorino Romano Grated", 24.00),
    # Dry goods & Pantry
    ("Canola Frying Oil 16L", 2.60),
    ("Flour Unbleached Pizza '00'", 1.45),
    ("Flour All-Purpose High Gluten", 1.15),
    ("Semolina Flour Fine", 1.85),
    ("Extra Virgin Olive Oil", 12.50),
    ("Canned San Marzano Whole Peeled D.O.P.", 5.20),
    ("Instant Dry Yeast", 8.20),
    ("Granulated White Sugar", 1.40),
    ("Kosher Salt Coarse", 1.10),
    ("Yeast Instant Dry", 8.20),
]

# SKU mappings for all test invoice line items across the 3 broadline suppliers
TEST_SKU_MAPPINGS = [
    # Sysco GTA
    ("Sysco GTA", "SYS-10492", "Roma Tomatoes", 1, 20.0, "lb"),
    ("Sysco GTA", "SYS-21045", "Mozzarella Shredded 28% MF", 4, 2.5, "kg"),
    ("Sysco GTA", "SYS-10488", "Fresh Basil", 1, 1.0, "lb"),
    ("Sysco GTA", "SYS-21049", "Heavy Whipping Cream 35%", 4, 4.0, "L"),
    ("Sysco GTA", "SYS-10481", "Green Onions (Scallions)", 48, 1.0, "each"),
    ("Sysco GTA", "SYS-50220", "Canned San Marzano Whole Peeled D.O.P.", 6, 3.0, "kg"),
    ("Sysco GTA", "SYS-50215", "Extra Virgin Olive Oil", 4, 3.0, "L"),
    ("Sysco GTA", "SYS-50228", "Kosher Salt Coarse", 12, 1.0, "kg"),
    ("Sysco GTA", "SYS-50230", "Granulated White Sugar", 1, 20.0, "kg"),
    ("Sysco GTA", "SYS-10475", "Yellow Onions Jumbo", 1, 50.0, "lb"),

    # Gordon Food Service (GFS)
    ("Gordon Food Service (GFS)", "GFS-33019", "Flour Unbleached Pizza '00'", 1, 20.0, "kg"),
    ("Gordon Food Service (GFS)", "GFS-50211", "Canola Frying Oil 16L", 1, 16.0, "L"),
    ("Gordon Food Service (GFS)", "GFS-88120", "Pepperoni Sliced 14-slice/oz", 2, 5.0, "kg"),
    ("Gordon Food Service (GFS)", "GFS-33022", "Semolina Flour Fine", 1, 20.0, "kg"),
    ("Gordon Food Service (GFS)", "GFS-33025", "Yeast Instant Dry", 20, 0.5, "kg"),
    ("Gordon Food Service (GFS)", "GFS-21045", "Mozzarella Shredded 28% MF", 4, 2.5, "kg"),
    ("Gordon Food Service (GFS)", "GFS-21062", "Butter Unsalted Solid", 1, 25.0, "kg"),
    ("Gordon Food Service (GFS)", "GFS-21070", "Eggs Large Grade A White", 180, 1.0, "each"),
    ("Gordon Food Service (GFS)", "GFS-21049", "Heavy Whipping Cream 35%", 4, 4.0, "L"),
    ("Gordon Food Service (GFS)", "GFS-88130", "Chicken Breast Boneless Skinless", 2, 5.0, "kg"),

    # Flanagan Foodservice
    ("Flanagan Foodservice", "FLA-21055", "Parmigiano Reggiano Grated", 1, 5.0, "kg"),
    ("Flanagan Foodservice", "FLA-21058", "Pecorino Romano Grated", 1, 5.0, "kg"),
    ("Flanagan Foodservice", "FLA-50215", "Extra Virgin Olive Oil", 4, 3.0, "L"),
    ("Flanagan Foodservice", "FLA-10495", "Yukon Gold Potatoes", 1, 50.0, "lb"),
    ("Flanagan Foodservice", "FLA-21060", "Butter Salted Solid", 1, 25.0, "kg"),
    ("Flanagan Foodservice", "FLA-10492", "Roma Tomatoes", 1, 25.0, "lb"),
    ("Flanagan Foodservice", "FLA-10498", "Romaine Lettuce Hearts", 36, 1.0, "each"),
    ("Flanagan Foodservice", "FLA-10502", "Garlic Peeled", 1, 5.0, "lb"),
    ("Flanagan Foodservice", "FLA-33015", "Flour All-Purpose High Gluten", 1, 20.0, "kg"),
]


def unlock_benchmarks():
    db = SessionLocal()
    try:
        restaurants = db.query(Restaurant).filter(Restaurant.geom.isnot(None)).all()
        if not restaurants:
            print("No restaurants with geom found!")
            return

        suppliers = db.query(Supplier).all()
        if not suppliers:
            print("No suppliers found!")
            return

        today = date.today()
        # Dates inside 30-day window (today - 37 to today - 7) and 90-day window (today - 97 to today - 7)
        dates_to_seed = [
            today - timedelta(days=10),
            today - timedelta(days=17),
            today - timedelta(days=24),
            today - timedelta(days=31),
            today - timedelta(days=45),
            today - timedelta(days=60),
            today - timedelta(days=75),
        ]

        print(f"Ensuring benchmark observations across {len(restaurants)} restaurants for {len(TARGET_ITEMS)} items...")

        added_count = 0
        unlocked_items = []

        for item_name, base_price in TARGET_ITEMS:
            c_item = db.query(CanonicalItem).filter(CanonicalItem.name == item_name).first()
            if not c_item:
                print(f"Warning: Canonical item '{item_name}' not found, skipping.")
                continue

            # Ensure item is benchmarkable
            if not c_item.benchmarkable:
                c_item.benchmarkable = True
                db.flush()

            # For each restaurant and each date, ensure an observation exists
            for rest_idx, rest in enumerate(restaurants):
                sup = suppliers[rest_idx % len(suppliers)]
                for obs_date in dates_to_seed:
                    existing = db.query(BenchmarkObservation).filter(
                        BenchmarkObservation.restaurant_id == rest.id,
                        BenchmarkObservation.canonical_item_id == c_item.id,
                        BenchmarkObservation.observed_on == obs_date,
                    ).first()

                    if not existing:
                        # Introduce natural market price variation (+/- 8%)
                        variation = random.uniform(0.92, 1.08)
                        price = round(base_price * variation, 4)
                        obs = BenchmarkObservation(
                            restaurant_id=rest.id,
                            canonical_item_id=c_item.id,
                            supplier_id=sup.id,
                            observed_on=obs_date,
                            price_per_base_unit=price,
                            geom=rest.geom,
                        )
                        db.add(obs)
                        added_count += 1

            unlocked_items.append(c_item)

        db.commit()
        print(f"✓ Added {added_count} new benchmark observations.")

        # Seed SKU mappings for suppliers
        sku_added = 0
        from datetime import datetime
        for sup_name, sku, item_name, p_units, p_size, p_meas in TEST_SKU_MAPPINGS:
            sup = db.query(Supplier).filter(Supplier.canonical_name == sup_name).first()
            c_item = db.query(CanonicalItem).filter(CanonicalItem.name == item_name).first()
            if sup and c_item:
                existing_map = db.query(SkuMapping).filter(
                    SkuMapping.supplier_id == sup.id,
                    SkuMapping.supplier_sku == sku
                ).first()
                if not existing_map:
                    mapping = SkuMapping(
                        supplier_id=sup.id,
                        supplier_sku=sku,
                        canonical_item_id=c_item.id,
                        pack_units=p_units,
                        pack_size=p_size,
                        pack_measure=p_meas,
                        confidence=1.0,
                        confirmed_at=datetime.utcnow()
                    )
                    db.add(mapping)
                    sku_added += 1
        db.commit()
        print(f"✓ Seeded {sku_added} SKU mappings for test invoices.")

        # Test get_benchmark for pilot restaurant
        pilot_rest = restaurants[0]
        print(f"\nVerifying benchmarks for restaurant '{pilot_rest.name}' (30-day & 90-day windows):")

        sql = text("""
            SELECT 
                p25, p50, p75, n_restaurants, radius_km_used, suppressed, suppression_reason
            FROM get_benchmark(:restaurant_id, :canonical_item_id, :window_days)
        """)

        active_30 = 0
        active_90 = 0

        for c_item in unlocked_items:
            res_30 = db.execute(sql, {
                "restaurant_id": str(pilot_rest.id),
                "canonical_item_id": str(c_item.id),
                "window_days": 30,
            }).first()

            res_90 = db.execute(sql, {
                "restaurant_id": str(pilot_rest.id),
                "canonical_item_id": str(c_item.id),
                "window_days": 90,
            }).first()

            is_active_30 = res_30 and not res_30.suppressed
            is_active_90 = res_90 and not res_90.suppressed

            if is_active_30:
                active_30 += 1
            if is_active_90:
                active_90 += 1

            print(f"  {c_item.name} ({c_item.base_unit}): 30d={'ACTIVE ($' + str(res_30.p50) + ')' if is_active_30 else 'SUPPRESSED (' + str(res_30.suppression_reason) + ')'} | 90d={'ACTIVE ($' + str(res_90.p50) + ')' if is_active_90 else 'SUPPRESSED'}")

        print(f"\nSummary: {active_30}/{len(unlocked_items)} active for 30d window, {active_90}/{len(unlocked_items)} active for 90d window.")

    finally:
        db.close()


if __name__ == "__main__":
    unlock_benchmarks()
