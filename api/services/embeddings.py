"""
Embedding Service for Sous Cost Intelligence.
Generates 768-dimensional normalized vector embeddings for food catalogue items,
line-item descriptions, and search queries.

Preserves compatibility with PostgreSQL pgvector (Vector(768)).
Features:
- Sub-millisecond deterministic semantic feature projection
- Comprehensive broadline food-service acronym dictionary (NAMP meat cuts, seafood, produce sizing, dairy specs)
- Multi-channel embedding space (concept category, word tokens, character n-grams, bigrams)
- L2-normalized float arrays (cosine distance <=> equals 1 - dot product)
- LRU caching for high-throughput invoice batch ingestion
"""

import re
import math
import hashlib
from functools import lru_cache
from typing import List, Optional

DIMENSIONS = 768

# Multi-word regex replacements applied before tokenization
COMPOUND_PHRASES = [
    # Seafood specs & counts
    (r"\bp\s*&\s*d\b", "peeled deveined shrimp"),
    (r"\bez\s*-\s*peel\b", "easy peel shrimp"),
    (r"\btl\s*-\s*on\b", "tail on shrimp"),
    (r"\btl\s*-\s*off\b", "tail off shrimp"),
    (r"\bhead\s*-\s*on\b", "head on shrimp"),
    (r"\bhead\s*-\s*off\b", "headless shrimp"),

    # Butchery & Poultry cuts
    (r"\bbl\s*/\s*sl\b", "boneless skinless"),
    (r"\bbnls\s*/\s*sknls\b", "boneless skinless"),
    (r"\bny\s+strip\b", "new york strip loin steak"),
    (r"\bt\s*-\s*bone\b", "t bone steak"),
    (r"\bbone\s*-\s*in\b", "bone in"),
    (r"\bfior\s+di\s+latte\b", "fior di latte fresh mozzarella"),

    # Processing & state
    (r"\bready\s*-\s*to\s*-\s*eat\b", "ready to eat"),
    (r"\bready\s*-\s*to\s*-\s*use\b", "ready to use"),
    (r"\bready\s*-\s*to\s*-\s*ripen\b", "ready to ripen"),
    (r"\bfryer\s+shortening\b", "frying shortening oil"),
    (r"\be\.?v\.?o\.?o\.?\b", "extra virgin olive oil"),
]

# Canonical broadline culinary terms & abbreviation normalization
CANONICAL_TERMS = {
    # === Butchery, Poultry & Meat Primal Cuts (NAMP/IMPS) ===
    "psmo": "peeled side muscle on beef tenderloin",
    "tndrln": "beef tenderloin",
    "tndr": "tenderloin",
    "sir": "sirloin steak",
    "sirlo": "sirloin steak",
    "strp": "strip loin steak",
    "strip": "strip loin steak",
    "rbe": "ribeye steak",
    "ribeye": "ribeye steak",
    "flk": "flank steak",
    "skrt": "skirt steak",
    "shnk": "shank",
    "stk": "steak",
    "chp": "chop",
    "wog": "without giblets whole chicken",
    "bnls": "boneless",
    "sknls": "skinless",
    "chkn": "chicken",
    "chk": "chicken",
    "brst": "breast",
    "thgh": "thigh",
    "wng": "wing",
    "dr": "dressed",
    "drsd": "dressed",
    "hl": "headless",
    "pat": "patty beef burger",
    "pats": "patty beef burger",
    "pty": "patty beef burger",
    "chuck": "chuck ground beef",
    "prk": "pork",
    "blly": "pork belly",
    "bcn": "bacon",
    "smkd": "smoked",
    "smoked": "smoked",
    "grnd": "ground",
    "gnd": "ground",
    "bf": "beef",
    "ssg": "sausage",
    "saus": "sausage",
    "pep": "pepperoni",
    "pepp": "pepperoni",
    "prosc": "prosciutto",
    "salam": "salami",
    "pastr": "pastrami",
    "tky": "turkey",
    "veal": "veal",

    # === Seafood & Shellfish ===
    "pnd": "peeled deveined shrimp",
    "ezpeel": "easy peel shrimp",
    "tlon": "tail on shrimp",
    "tloff": "tail off shrimp",
    "shrm": "shrimp",
    "shrp": "shrimp",
    "salm": "salmon",
    "tun": "tuna",
    "cod": "cod fish",
    "hadd": "haddock",
    "clm": "clam",
    "clms": "clams",
    "muss": "mussels",
    "calam": "calamari squid",
    "sqd": "calamari squid",
    "oct": "octopus",
    "lob": "lobster",
    "crb": "crab",

    # === Produce, Herbs & Greens ===
    "jbo": "jumbo",
    "jmbo": "jumbo",
    "xl": "extra large",
    "lg": "large",
    "med": "medium",
    "sm": "small",
    "bu": "bushel",
    "flt": "flat",
    "cello": "cello pack",
    "hd": "head",
    "hds": "heads",
    "slv": "sleeve",
    "rtr": "ready to ripen",
    "mesc": "mesclun spring mix lettuce greens",
    "rmn": "romaine lettuce",
    "romaine": "romaine lettuce",
    "lett": "lettuce",
    "hrts": "hearts",
    "ice": "iceberg lettuce",
    "icbrg": "iceberg lettuce",
    "spin": "baby spinach",
    "arug": "arugula rocket",
    "plm": "plum",
    "tom": "tomato",
    "toms": "tomato",
    "tomatoes": "tomato",
    "roma": "roma plum tomato",
    "bfstk": "beefsteak tomato",
    "chry": "cherry tomato",
    "san": "san",
    "marz": "san marzano tomato plum",
    "marzano": "san marzano tomato plum",
    "on": "onion",
    "onns": "onion",
    "onions": "onion",
    "yel": "yellow",
    "pot": "potato",
    "pots": "potato",
    "potatoes": "potato",
    "rus": "russet potato",
    "russet": "russet potato",
    "yuk": "yukon gold potato",
    "yukon": "yukon gold potato",
    "gar": "fresh garlic peeled",
    "scall": "green onion scallion",
    "scallion": "green onion scallion",
    "mush": "mushroom",
    "mshrm": "mushroom",
    "mushrooms": "mushroom",
    "avoc": "avocado",
    "avo": "avocado",
    "cuc": "cucumber",
    "cuke": "cucumber",
    "peppr": "bell pepper",
    "bell": "bell pepper",
    "jal": "jalapeno pepper",
    "cil": "fresh cilantro",
    "pars": "fresh parsley",
    "bas": "fresh basil",
    "oreg": "fresh oregano",
    "rosem": "fresh rosemary",
    "thym": "fresh thyme",
    "lem": "fresh lemon",
    "lim": "fresh lime",
    "org": "organic",

    # === Dairy, Cheese & Fats ===
    "mf": "milk fat",
    "past": "pasteurized",
    "uns": "unsalted butter",
    "sltd": "salted butter",
    "clar": "clarified butter ghee",
    "blk": "block cheese",
    "feathr": "feather shredded cheese",
    "hvy": "heavy",
    "whp": "whipping",
    "whipped": "whipping",
    "crm": "cream",
    "fior": "fior di latte fresh mozzarella",
    "fdl": "fior di latte fresh mozzarella",
    "mozz": "mozzarella",
    "shrd": "shredded",
    "shred": "shredded",
    "parm": "parmigiano",
    "parmesan": "parmigiano",
    "reg": "reggiano",
    "peco": "pecorino",
    "rom": "romano",
    "grtd": "grated",
    "chedd": "cheddar",
    "chdr": "cheddar",
    "ric": "ricotta cheese",
    "ricot": "ricotta cheese",
    "provo": "provolone cheese",
    "gorg": "gorgonzola blue cheese",
    "brie": "brie cheese",
    "feta": "feta cheese",
    "canola": "canola oil",
    "fry": "frying",
    "fryer": "frying",
    "shrtng": "shortening frying oil",
    "shortening": "shortening frying oil",
    "evoo": "extra virgin olive oil",
    "voo": "virgin olive oil",
    "virg": "virgin",
    "pom": "pomace olive oil",
    "veg": "vegetable oil",
    "bttr": "butter",
    "marg": "margarine",
    "yog": "yogurt",
    "eggs": "egg",

    # === Processing, Preservation & State ===
    "frz": "frozen",
    "frzn": "frozen",
    "fsh": "fresh",
    "frsh": "fresh",
    "rte": "ready to eat",
    "rtu": "ready to use",
    "cnd": "canned",
    "asptc": "aseptic",
    "conc": "concentrate concentrated",
    "whl": "whole",
    "pld": "peeled",
    "dcd": "diced",
    "slcd": "slice",
    "sliced": "slice",
    "slices": "slice",
    "chpd": "chopped",
    "crshd": "crushed",
    "blchd": "bleached",
    "unblchd": "unbleached",
    "drd": "dried",

    # === Pantry, Bakery, Sauces & Dry Goods ===
    "flr": "flour",
    "ap": "all purpose flour",
    "sem": "semolina flour",
    "yeast": "yeast active dry",
    "yst": "yeast active dry",
    "sug": "sugar cane",
    "salt": "salt",
    "kosh": "kosher salt",
    "mayo": "mayonnaise",
    "must": "mustard",
    "vinaig": "vinaigrette vinegar",
    "worc": "worcestershire sauce",
    "wstr": "worcestershire sauce",
    "bals": "balsamic vinegar",
    "bbq": "barbecue sauce",
    "ktch": "tomato ketchup",
    "ketch": "tomato ketchup",
    "pste": "tomato paste",
    "sau": "sauce",
    "marin": "marinara sauce",
    "alf": "alfredo sauce",
    "psto": "pesto sauce",
}

STOP_WORDS = {
    "a", "an", "the", "and", "or", "in", "on", "at", "to", "for", "with",
    "by", "of", "from", "cs", "case", "bx", "box", "ea", "each", "pack",
    "pkg", "ct", "count", "lb", "lbs", "kg", "g", "l", "ml", "oz", "fl",
    "item", "brand", "grade", "fancy", "choice", "aliases", "alias",
    "dop", "cl", "iqf"
}

CATEGORY_KEYWORDS = {
    "produce": [
        "tomato", "onion", "potato", "lettuce", "spinach", "arugula", "basil",
        "oregano", "parsley", "garlic", "scallion", "mushroom", "produce", "fresh",
        "herb", "vegetable", "cucumber", "avocado", "pepper", "lemon", "lime"
    ],
    "dairy": [
        "cream", "milk", "cheese", "mozzarella", "cheddar", "parmigiano",
        "pecorino", "butter", "sour", "dairy", "yogurt", "whipping", "ricotta",
        "provolone", "feta", "brie", "gorgonzola"
    ],
    "proteins": [
        "beef", "chicken", "pork", "bacon", "pepperoni", "sausage", "patty",
        "meat", "poultry", "turkey", "egg", "protein", "veal", "steak",
        "tenderloin", "sirloin", "shrimp", "salmon", "fish", "seafood",
        "calamari", "squid", "clam", "mussel", "crab", "lobster"
    ],
    "dry_goods": [
        "oil", "flour", "sugar", "salt", "yeast", "paste", "canned", "pasta",
        "semolina", "dry", "goods", "sauce", "ketchup", "olive", "canola",
        "shortening", "vinegar", "mayonnaise", "mustard"
    ],
    "supplies": [
        "fork", "knife", "spoon", "cutlery", "box", "bag", "roll", "towel",
        "container", "cup", "lid", "plastic", "gloves", "bleach", "foil", "paper"
    ],
}


def clean_and_tokenize(text: str) -> List[str]:
    """
    Cleans, extracts, and normalizes food tokens, abbreviations, and units.
    """
    text = text.lower()

    # Pre-process multi-word and compound patterns (e.g. P&D, EZ-Peel, BL/SL, NY Strip)
    for pattern, replacement in COMPOUND_PHRASES:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)

    # Separate numbers from adjacent units, e.g. '4L' -> '4 L', '25lb' -> '25 lb'
    text = re.sub(r"(\d+)([a-zA-Z]+)", r"\1 \2", text)
    text = re.sub(r"([a-zA-Z]+)(\d+)", r"\1 \2", text)
    # Replace punctuation with whitespace, preserving '%'
    text = re.sub(r"[\(\)\[\],;:#*!\-\/\\&\"\'\.]", " ", text)
    raw_tokens = text.split()

    tokens = []
    for t in raw_tokens:
        t = re.sub(r"^[^\w%]+|[^\w%]+$", "", t)
        if not t:
            continue
        if t in CANONICAL_TERMS:
            tokens.extend(CANONICAL_TERMS[t].split())
        else:
            tokens.append(t)
    return tokens


@lru_cache(maxsize=8192)
def _generate_embedding_cached(text: str) -> tuple:
    """
    Internal cached helper returning an immutable tuple of 768 floats.
    """
    tokens = clean_and_tokenize(text)
    dim = DIMENSIONS
    vec = [0.0] * dim

    if not tokens:
        vec[0] = 1.0
        return tuple(vec)

    # Channel A: Category concept subspace (dims 0..95)
    cat_dim_start, cat_dim_end = 0, 96
    cat_span = cat_dim_end - cat_dim_start
    text_lower = " " + " ".join(tokens) + " "
    for cat_name, kw_list in CATEGORY_KEYWORDS.items():
        cat_matches = sum(1 for kw in kw_list if f" {kw} " in text_lower or kw in tokens)
        if cat_matches > 0:
            weight = min(4.0, 1.0 + 0.6 * cat_matches)
            digest = hashlib.sha256(cat_name.encode("utf-8")).digest()
            for h in range(4):
                idx = cat_dim_start + (int.from_bytes(digest[h * 4 : (h + 1) * 4], "big") % cat_span)
                vec[idx] += weight

    # Channel B: Semantic word tokens (dims 96..383)
    tok_dim_start, tok_dim_end = 96, 384
    tok_span = tok_dim_end - tok_dim_start
    for token in tokens:
        is_stop = token in STOP_WORDS
        weight = 0.2 if is_stop else 3.2
        if re.search(r"\d", token):
            weight = 1.5

        for h in range(3):
            seed = f"tok_{token}_{h}".encode("utf-8")
            digest = hashlib.sha256(seed).digest()
            idx = tok_dim_start + (int.from_bytes(digest[:4], "big") % tok_span)
            sign = 1.0 if (digest[4] % 2 == 0) else -1.0
            vec[idx] += sign * weight

    # Channel C: Character 3-grams and 4-grams (dims 384..575)
    char_dim_start, char_dim_end = 384, 576
    char_span = char_dim_end - char_dim_start
    for token in tokens:
        if token in STOP_WORDS:
            continue
        padded = f"^{token}$"
        ngrams = [padded[i : i + 3] for i in range(len(padded) - 2)]
        if len(padded) >= 4:
            ngrams.extend([padded[i : i + 4] for i in range(len(padded) - 3)])

        for ng in ngrams:
            seed = f"ng_{ng}".encode("utf-8")
            digest = hashlib.sha256(seed).digest()
            idx = char_dim_start + (int.from_bytes(digest[:4], "big") % char_span)
            sign = 1.0 if (digest[4] % 2 == 0) else -1.0
            vec[idx] += sign * 1.0

    # Channel D: Token Bigrams / Phrase Collocations (dims 576..767)
    bi_dim_start, bi_dim_end = 576, 768
    bi_span = bi_dim_end - bi_dim_start
    meaningful_tokens = [t for t in tokens if t not in STOP_WORDS]
    for i in range(len(meaningful_tokens) - 1):
        bigram = f"{meaningful_tokens[i]}_{meaningful_tokens[i + 1]}"
        for h in range(2):
            seed = f"bi_{bigram}_{h}".encode("utf-8")
            digest = hashlib.sha256(seed).digest()
            idx = bi_dim_start + (int.from_bytes(digest[:4], "big") % bi_span)
            sign = 1.0 if (digest[4] % 2 == 0) else -1.0
            vec[idx] += sign * 1.5

    # L2 Normalization
    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 1e-9:
        vec = [round(x / norm, 6) for x in vec]
    else:
        vec = [0.0] * dim
        vec[0] = 1.0
    return tuple(vec)


def generate_embedding(text: str) -> List[float]:
    """
    Generate an L2-normalized 768-dimensional float embedding for a given text.
    Cached for high throughput.
    """
    if not text:
        vec = [0.0] * DIMENSIONS
        vec[0] = 1.0
        return vec
    return list(_generate_embedding_cached(text.strip()))


def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """
    Calculates cosine similarity between two L2-normalized vectors (dot product).
    """
    if len(v1) != len(v2):
        raise ValueError(f"Vector dimensions do not match: {len(v1)} vs {len(v2)}")
    return float(sum(a * b for a, b in zip(v1, v2)))
