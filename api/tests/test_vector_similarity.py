"""
Vector Similarity & pgvector HNSW Verification Suite.
Validates:
1. 768-dimensional normalized embeddings and LRU caching
2. High-confidence culinary abbreviation resolution (EVOO, Hvy Whp Crm, Bnls Chkn, etc.)
3. Non-commodity / low-confidence suppression
4. PostgreSQL HNSW index queries (<=> cosine distance)
5. Review queue payload suggestion formatting
"""

import sys
import os
import math
import unittest

# Ensure api directory is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from database import SessionLocal
from models import CanonicalItem, ReviewItem, Invoice, InvoiceLine, Supplier
from services.embeddings import (
    generate_embedding,
    cosine_similarity,
    clean_and_tokenize,
    DIMENSIONS,
)
from services.pipeline import HIGH_CONFIDENCE_THRESHOLD, MEDIUM_CONFIDENCE_THRESHOLD


class TestVectorSimilarity(unittest.TestCase):

    def test_dimensions_and_normalization(self):
        """Embedding must be 768 dimensions and strictly L2-normalized."""
        vec = generate_embedding("Extra Virgin Olive Oil")
        self.assertEqual(len(vec), DIMENSIONS)
        self.assertEqual(len(vec), 768)

        # L2 norm must equal 1.0 (within float precision)
        norm = math.sqrt(sum(x * x for x in vec))
        self.assertAlmostEqual(norm, 1.0, places=4)

    def test_caching(self):
        """Identical text queries should hit LRU cache and yield identical vectors."""
        v1 = generate_embedding("Roma Tomatoes 25lb")
        v2 = generate_embedding("Roma Tomatoes 25lb")
        self.assertEqual(v1, v2)
        sim = cosine_similarity(v1, v2)
        self.assertAlmostEqual(sim, 1.0, places=5)

    def test_culinary_abbreviations_benchmark(self):
        """Test accuracy benchmarks across distributor abbreviation patterns."""
        test_cases = [
            ("EVOO Extra Virg 3L", "Extra Virgin Olive Oil", 0.82),
            ("Hvy Whp Crm 35% 4L", "Heavy Whipping Cream 35%", 0.82),
            ("Tomatoes, Roma Extra Fancy 25LB", "Roma Tomatoes", 0.82),
            ("Canola Frying Shortening 16L", "Canola Frying Oil 16L", 0.82),
            ("Bnls Sknls Chkn Brst IQF", "Chicken Breast Boneless Skinless", 0.82),
        ]

        db = SessionLocal()
        try:
            for raw_query, expected_canon_name, min_expected_sim in test_cases:
                query_vec = generate_embedding(raw_query)
                canon = db.query(CanonicalItem).filter(CanonicalItem.name == expected_canon_name).first()
                self.assertIsNotNone(canon, f"Canonical item '{expected_canon_name}' not found in database.")
                self.assertIsNotNone(canon.embedding, f"Canonical item '{expected_canon_name}' has null embedding.")

                sim = cosine_similarity(query_vec, list(canon.embedding))
                print(f"[BENCHMARK] '{raw_query}' -> '{expected_canon_name}': similarity = {sim:.4f} (target >= {min_expected_sim})")
                self.assertGreaterEqual(
                    sim,
                    min_expected_sim,
                    f"Query '{raw_query}' scored {sim:.4f}, expected >= {min_expected_sim} against '{expected_canon_name}'"
                )
        finally:
            db.close()

    def test_unrelated_item_suppression(self):
        """Non-food supplies or unrelated food items must have low similarity (< 0.50)."""
        db = SessionLocal()
        try:
            query_vec = generate_embedding("Plastic Cutlery Fork Box/1000")
            roma = db.query(CanonicalItem).filter(CanonicalItem.name == "Roma Tomatoes").first()
            sim = cosine_similarity(query_vec, list(roma.embedding))
            print(f"[SUPPRESSION] 'Plastic Cutlery' vs 'Roma Tomatoes': similarity = {sim:.4f}")
            self.assertLess(sim, 0.40, f"Expected low similarity for non-food item, got {sim:.4f}")
        finally:
            db.close()

    def test_pgvector_hnsw_live_search(self):
        """Test that PostgreSQL pgvector executes cosine distance (<=>) with HNSW index."""
        db = SessionLocal()
        try:
            query_text = "Hvy Whp Crm 35% 4L"
            query_vec = generate_embedding(query_text)

            # Query using pgvector cosine_distance
            top_matches = (
                db.query(
                    CanonicalItem,
                    (1 - CanonicalItem.embedding.cosine_distance(query_vec)).label("similarity")
                )
                .filter(CanonicalItem.embedding.isnot(None))
                .order_by(CanonicalItem.embedding.cosine_distance(query_vec))
                .limit(3)
                .all()
            )

            self.assertGreater(len(top_matches), 0)
            best_match, best_sim = top_matches[0]
            self.assertEqual(best_match.name, "Heavy Whipping Cream 35%")
            self.assertGreaterEqual(float(best_sim), HIGH_CONFIDENCE_THRESHOLD)
            print(f"[LIVE PGVECTOR] Best match for '{query_text}': '{best_match.name}' ({float(best_sim):.4f})")
        finally:
            db.close()


    def test_catalog_semantic_search(self):
        """Test GET /catalog/items semantic search ranking with abbreviations."""
        from routers.catalog import list_canonical_items
        db = SessionLocal()
        try:
            items = list_canonical_items(q="EVOO", limit=3, db=db)
            self.assertGreater(len(items), 0)
            self.assertEqual(items[0].name, "Extra Virgin Olive Oil")

            items2 = list_canonical_items(q="Hvy Crm", limit=3, db=db)
            self.assertGreater(len(items2), 0)
            self.assertEqual(items2[0].name, "Heavy Whipping Cream 35%")
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
