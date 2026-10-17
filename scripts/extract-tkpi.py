"""Read the official TKPI 2017 PDF; emit factual table data, never guessed values.

Dependency: PyMuPDF. Usage: python scripts/extract-tkpi.py /path/to/tkpi.pdf
Stdout is JSON; diagnostics go to stderr. No files or database are written.
The source PDF is linked by https://repository.kemkes.go.id/book/777.
"""

import collections
import hashlib
import json
import re
import sys

import pymupdf

FIELDS = [
    "waterGrams", "caloriesKcal", "proteinGrams", "fatGrams",
    "carbohydrateGrams", "fiberGrams", "ashGrams", "calciumMg",
    "phosphorusMg", "ironMg", "sodiumMg", "potassiumMg", "copperMg",
    "zincMg", "retinolMcg", "betaCaroteneMcg", "totalCaroteneMcg",
    "thiaminMg", "riboflavinMg", "niacinMg", "vitaminCMg",
]
GROUPS = dict(zip("ABCDEFGHJKMNQ", [
    "cereals", "tubers", "legumes", "vegetables", "fruits", "meat_poultry",
    "fish_seafood", "eggs", "dairy", "fats_oils", "sugars_confectionery",
    "condiments", "beverages",
]))
CODE = re.compile(r"[A-Z]{2}[0-9]{3}")


def clean(value):
    return " ".join(value.split())


def number(value, context):
    value = re.sub(r"\s+", "", value)
    if value in ("", "-", "–"):
        return None
    if not re.fullmatch(r"\d+(?:\.\d+)?", value):
        raise ValueError(f"Unrecognized numeric cell {context}: {value!r}")
    return float(value) if "." in value else int(value)


def main():
    path = sys.argv[1]
    with open(path, "rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    if digest != "12433fb4803c47ecbc89dc5981e3ee80717313ccf1b756b8189ebffca4e1d382":
        raise ValueError("Source checksum differs: review the edition before replacing a reference snapshot")
    document = pymupdf.open(path)
    if len(document) != 135 or "TABEL KOMPOSISI" not in document[0].get_text():
        raise ValueError("Not the expected official 135-page TKPI 2017 edition")
    foods = []
    for page_index in range(15, 70):
        page = document[page_index]
        words = page.get_text("words")
        expected = {w[4] for w in words if CODE.fullmatch(w[4])}
        extracted = set()
        blue = [d["rect"] for d in page.get_drawings()
                if d["fill"] and d["fill"][2] - d["fill"][0] > 0.1]
        # Ignore filled background rectangles: blue shading is provenance, not
        # an additional column boundary (the ordinary lines strategy splits it).
        for table in page.find_tables(strategy="lines_strict").tables:
            rows = table.extract()
            units_index = next((i for i, row in enumerate(rows) if "(Kal)" in row), None)
            if units_index is None:
                continue
            nutrient_indices = [i for i, value in enumerate(rows[units_index])
                                if value in ("(g)", "(Kal)", "(mg)", "(mcg)")]
            unit_cells = [table.rows[units_index].cells[i] for i in nutrient_indices]
            if len(unit_cells) != 21:
                raise ValueError(f"Expected 21 nutrient columns on PDF page {page_index + 1}")
            header = rows[0]
            name_index = header.index("NAMA BAHAN")
            source_index = header.index("SUMBER")
            bdd_index = next(i for i, value in enumerate(header) if value and value.startswith("BDD"))
            bdd_cell = table.rows[0].cells[bdd_index]
            boundaries = [cell[0] for cell in unit_cells] + [bdd_cell[0]]
            for row_index, row in enumerate(rows):
                codes = [value for value in row if value and CODE.fullmatch(value)]
                if not codes:
                    continue
                if len(codes) != 1:
                    raise ValueError("Ambiguous food code row")
                code = codes[0]
                code_cell = table.rows[row_index].cells[row.index(code)]
                y0, y1 = code_cell[1], code_cell[3]

                nutrients = {}
                imputed = []
                for i, field in enumerate(FIELDS):
                    value = number(row[nutrient_indices[i]] or "", f"{code}/{field}")
                    nutrients[field] = value
                    center = pymupdf.Point((boundaries[i] + boundaries[i + 1]) / 2, (y0 + y1) / 2)
                    if value is not None and any(rect.contains(center) for rect in blue):
                        imputed.append(field)
                foods.append({
                    "code": code,
                    "name": clean(row[name_index] or ""),
                    "enLabel": None,
                    "foodGroup": GROUPS[code[0]],
                    "foodKind": "single" if code[1] == "R" else "processed_or_composite",
                    "pdfPage": page_index + 1,
                    "printedPage": page_index - 6,
                    "originalReference": clean(row[source_index] or ""),
                    "ediblePercent": number(row[bdd_index] or "", f"{code}/BDD"),
                    "nutrients": nutrients,
                    "imputedOrBorrowedFields": imputed,
                })
                extracted.add(code)
        if extracted != expected:
            raise ValueError(f"PDF page {page_index + 1}: lost/extra codes {extracted ^ expected}")
        print(f"Checked PDF page {page_index + 1}: {len(extracted)} foods", file=sys.stderr)

    # Use only the English names actually present in the book's index.
    # Most processed/composite foods have no English index entry: keep null.
    english = {}
    for page in document[70:99]:
        for table in page.find_tables(strategy="lines_strict").tables:
            rows = table.extract()
            if not rows or not any(value and "NAMA INGGRIS" in value for value in rows[0]):
                continue
            header_index = next(i for i, value in enumerate(rows[0]) if value and "NAMA INGGRIS" in value)
            for i, row in enumerate(rows):
                codes = [v for v in row if v and CODE.fullmatch(v)]
                if len(codes) != 1:
                    continue
                code = codes[0]
                value = clean(row[header_index] or "")
                if value and value != "-":
                    english[code] = value
    for food in foods:
        food["enLabel"] = english.get(food["code"])
    codes = [food["code"] for food in foods]
    if len(codes) != len(set(codes)):
        raise ValueError("Duplicate TKPI codes")
    snapshot = {
        "dataset": "TKPI 2017 (Kementerian Kesehatan RI, published 2018)",
        "sourceUrl": "https://repository.kemkes.go.id/book/777",
        "sourcePdfUrl": "https://drive.google.com/file/d/1SC04gfuVmT--4-JegrOBM36mw_vwssvM/view",
        "sourceSha256": digest,
        "checkedAt": "2026-10-17",
        "nutrientBasisGrams": 100,
        "foods": sorted(foods, key=lambda food: food["code"]),
    }
    if "--compact" in sys.argv:
        snapshot["foodFields"] = list(snapshot["foods"][0])
        snapshot["nutrientFields"] = FIELDS
        compact_foods = []
        for food in snapshot["foods"]:
            compact = dict(food)
            compact["nutrients"] = [food["nutrients"][field] for field in FIELDS]
            compact["imputedOrBorrowedFields"] = [FIELDS.index(field) for field in food["imputedOrBorrowedFields"]]
            compact_foods.append(list(compact.values()))
        snapshot["foods"] = compact_foods
    print(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")))
    print(f"Extracted {len(foods)} unique foods; {collections.Counter(f['foodGroup'] for f in foods)}", file=sys.stderr)


if __name__ == "__main__":
    # PyMuPDF's advisory text must not pollute machine-readable stdout.
    pymupdf.TOOLS.mupdf_display_warnings(False)
    main()
