"""Measure the visible thumbnail footprints, links and text in both final PDFs."""
from itertools import combinations
from pathlib import Path
import re

import fitz

ROOT = Path(__file__).resolve().parents[1] / "test-results"


def check_size(rect, width, height):
    assert abs(rect.width - width) < 0.1 and abs(rect.height - height) < 0.1, rect


def check(scope):
    with fitz.open(ROOT / f"thumbnails-{scope}.pdf") as doc:
        assert len(doc) == 1
        page = doc[0]
        text = page.get_text()
        assert not re.search(r"\b(?:Open|Image)\b", text)
        spans = [(s["text"], fitz.Rect(s["bbox"])) for b in page.get_text("dict")["blocks"]
                 for line in b.get("lines", []) for s in line["spans"] if s["text"].strip()]
        links = {l["uri"]: l["from"] for l in page.get_links()}
        images = page.get_image_info(xrefs=True)
        assert len(images) == 6 and all((i["width"], i["height"]) == (1200, 750) for i in images)
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)

        def color(x, y):
            return pix.pixel(round(x * 2), round(y * 2))

        def clean_crop(rect):
            y = rect.y0 + 5
            # The bitmap can extend outside the crop in the PDF content stream.
            # Measure visible ink on *both* sides of the border on the rendered page.
            assert color(rect.x0 - 1.5, y) == color(rect.x1 + 1.5, y) == (255, 255, 255), rect
            assert color(rect.x0 + 2, y) != (255, 255, 255)
            assert color(rect.x1 - 2, y) != (255, 255, 255)

        for i, (name, source) in enumerate([
            ("University of California, Irvine", "UCI Recruit"),
            ("Rutgers University", "Rutgers Job Opportunities"),
            ("Reed College", "Reed College"),
        ]):
            thumb = links[f"https://example.org/preview/{i}"]
            check_size(thumb, 108 * .75, 82 * .75)
            clean_crop(thumb)
            title = links[f"https://example.org/university/{i}"]
            faculty = links[f"https://example.org/search/{i}"]
            row = [(t, r) for t, r in spans if thumb.y0 - 1 <= r.y0 <= faculty.y1 + 1]
            assert [t for t, r in row].count(name) == (2 if name == source else 1)
            assert any(t == source for t, r in row)
            assert title.intersects(row[0][1]) and faculty.intersects(next(r for t, r in row if "Faculty search" in t))
            assert all(r.x0 >= thumb.x1 + 5 for t, r in row)
            for (a, r), (b, s) in combinations(row, 2):
                intersection = r & s
                assert intersection.width < 0.5 or intersection.height < 0.5, (a, b, intersection)
            if i:
                assert thumb.y0 > links[f"https://example.org/search/{i-1}"].y1 + 2

        # Exactly the same source pixels placed at two different sizes.
        assert images[3]["xref"] and images[3]["digest"] == images[4]["digest"]
        check_size(fitz.Rect(images[3]["bbox"]), 96 * .75, 60 * .75)
        check_size(fitz.Rect(images[4]["bbox"]), 144 * .75, 90 * .75)
        check_size(links["https://example.org/standalone"], 96 * .75, 60 * .75)

        # An oversized image positioned inside an overflow-hidden square frame.
        last = fitz.Rect(images[5]["bbox"])
        square = fitz.Rect(last.x1 - 66, last.y0, last.x1, last.y0 + 66)
        clean_crop(square)
        assert color(square.x1 - 3, square.y1 + 2) == (255, 255, 255)


if __name__ == "__main__":
    for mode in ("pair", "chat"):
        check(mode)
        print(f"thumbnails-{mode}.pdf passed visible dimensions, crops, row spacing, text and link checks")
