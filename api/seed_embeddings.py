"""
Backfill script to populate vector embeddings for all canonical items.
Uses the 768-dimensional normalized embedding service to vectorize each
item's name, category, base unit, and known aliases into canonical_items.embedding.
"""

import sys
import os

# Add parent dir to path so imports work when executed directly
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

try:
    from database import SessionLocal
    from models import CanonicalItem
    from services.embeddings import generate_embedding
except ImportError:
    from .database import SessionLocal
    from .models import CanonicalItem
    from .services.embeddings import generate_embedding


def seed_canonical_embeddings():
    db = SessionLocal()
    try:
        items = db.query(CanonicalItem).all()
        total = len(items)
        print(f"Found {total} canonical items to backfill.")

        updated_count = 0
        for item in items:
            alias_list = [a.alias for a in item.aliases]
            aliases_str = ", ".join(alias_list) if alias_list else item.name
            
            # Construct rich semantic descriptor for indexing
            text_repr = f"{item.name} - {item.category} ({item.base_unit}). Aliases: {aliases_str}"
            
            embedding = generate_embedding(text_repr)
            item.embedding = embedding
            updated_count += 1

        db.commit()
        print(f"Successfully backfilled embeddings for {updated_count}/{total} canonical items.")
        return updated_count
    except Exception as e:
        db.rollback()
        print(f"Error during embedding backfill: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_canonical_embeddings()
