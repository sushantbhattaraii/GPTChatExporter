"""Check actual PDF paths, text, crop bounds and zoomed output for both menus."""
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1] / "test-results"
LABELS = ("Primary route", "CSS route", "Card route", "Remote route",
          "Blob route", "Inline route", "Nested", "Inset", "Port 7")
INK = [(28, 102, 139), (150, 60, 97), (64, 118, 68), (153, 73, 35), (118, 82, 135)]


def strokes(drawings, rgb):
    return [d for d in drawings if d.get("color") and
            tuple(round(c * 255) for c in d["color"]) == rgb]


def check(scope):
    with fitz.open(ROOT / f"svg-{scope}.pdf") as doc:
        assert len(doc) == 1
        page = doc[0]
        # Image-info entries with xref=0 can be native PDF gradient shadings.
        # Inspect the actual embedded raster objects separately.
        assert sorted((im[2], im[3]) for im in page.get_images()) == [(4, 4), (384, 168)]
        assert sum("/ShadingType" in doc.xref_object(x) for x in range(1, doc.xref_length())) >= 5
        for label in LABELS:
            assert len(page.search_for(label)) == 1, label
        assert "Image unavailable" not in page.get_text()

        css, card = (page.search_for(name)[0] for name in ("CSS route", "Card route"))
        assert css.x1 < card.x0 and abs(css.y0 - card.y0) < 2
        link = next(l["from"] for l in page.get_links() if l.get("uri") == "https://example.org/route")
        assert abs(link.width - 270) < .05 and abs(link.height - 108) < .05

        paths = page.get_drawings()
        for rgb in INK:
            painted = strokes(paths, rgb)
            assert any(any(item[0] == "c" for item in s["items"]) for s in painted), rgb
            assert any(len(s["items"]) == 24 for s in painted), rgb
            assert sum(len(s["items"]) >= 4 and s["rect"].width < 18 for s in painted) >= 2, rgb

        ticks = next(s for s in strokes(paths, INK[0]) if len(s["items"]) == 24)
        assert abs(ticks["width"] - .6075) < .01
        r = ticks["rect"]
        strip = fitz.Rect(r.x0 - 2, r.y0 + 1.3, r.x1 + 2, r.y0 + 2.5)
        zoom = page.get_pixmap(matrix=fitz.Matrix(8, 8), clip=strip, alpha=False)
        marks = [max(zoom.pixel(x, zoom.height // 2)) < 185 for x in range(zoom.width)]
        assert sum(v and (i == 0 or not marks[i - 1]) for i, v in enumerate(marks)) == 24
    print(f"svg-{scope}.pdf passed native paths, symbols, gradients, text, display bounds, "
          "bitmap/filter resolution and 24 distinct fine strokes at 800% zoom")


if __name__ == "__main__":
    for mode in ("pair", "chat"):
        check(mode)
