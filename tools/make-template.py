#!/usr/bin/env python3
"""Build src/assets/lotpack-template.pdf from the official lotpack (docs/forms/Lot_Package_PL.pdf).

The paper's page numbers ("Page 1 of 8", "Page 4 to 8"...) are inconsistent: they are really
removed from the template (redaction, not a white box), so the app can print a continuous
"Page X of Y". The wrong code on the extra Site Diagram page (MSF28-12 instead of MSF28-7) is
removed too. Lines, logo and every other text are kept.

Needs PyMuPDF (pip install pymupdf). Only run when the official PDF changes;
the output is committed, the app build does not need Python.

Usage: python3 tools/make-template.py
"""
import json
import pathlib
import pymupdf

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "forms" / "Lot_Package_PL.pdf"
OUT = ROOT / "src" / "assets" / "lotpack-template.pdf"

FOOTER = 45  # pt from the bottom of the page

# 0-based page -> footer words to remove besides "Page x of/to y"
EXTRA = {8: ["MSF28-12", "V3R4", "29/01/2025"]}


def footer_words(page):
    h = page.rect.height
    words = page.get_text("words")  # x0, y0, x1, y1, text, block, line, word
    return [w for w in words if w[1] > h - FOOTER]


def main():
    doc = pymupdf.open(SRC)
    report = []
    for i, page in enumerate(doc):
        words = footer_words(page)
        removed = []
        for k, w in enumerate(words):
            if w[4] == "Page" and k + 3 < len(words) and words[k + 2][4] in ("of", "to"):
                group = words[k:k + 4]
                rect = pymupdf.Rect(group[0][:4])
                for g in group[1:]:
                    rect |= pymupdf.Rect(g[:4])
                page.add_redact_annot(rect)
                removed.append({"text": " ".join(g[4] for g in group), "rect": [round(v, 1) for v in rect]})
        for target in EXTRA.get(i, []):
            for w in words:
                if w[4] == target:
                    page.add_redact_annot(pymupdf.Rect(w[:4]))
                    removed.append({"text": target, "rect": [round(v, 1) for v in w[:4]]})
        page.apply_redactions(
            images=pymupdf.PDF_REDACT_IMAGE_NONE,
            graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
            text=pymupdf.PDF_REDACT_TEXT_REMOVE,
        )
        report.append({"page": i + 1, "size": [round(page.rect.width, 2), round(page.rect.height, 2)], "removed": removed})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUT, garbage=4, deflate=True, deflate_images=True, deflate_fonts=True, use_objstms=1)
    print(json.dumps(report, indent=1))
    print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
