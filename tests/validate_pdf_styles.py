"""Check native PDF text, color, alignment, indentation and transcript geometry."""
from pathlib import Path
import fitz

root = Path(__file__).resolve().parents[1] / "test-results"
for path in [root / "formatted-pair.pdf", root / "formatted-chat.pdf"]:
    with fitz.open(path) as doc:
        page = doc[0]
        assert not page.get_images(), "the text-only example must contain zero raster images"
        spans = [s for b in page.get_text("dict")["blocks"] for l in b.get("lines", []) for s in l["spans"]]
        def span(text):
            return next(s for s in spans if s["text"].startswith(text))
        fills = [(tuple(round(v*255) for v in d["fill"]),d["rect"])
                 for pg in doc for d in pg.get_drawings() if d.get("fill")]
        assert not any(color in ((247,248,250),(232,245,236),(245,245,245)) for color,_ in fills)
        code = next(rect for color,rect in fills if color == (23,34,51))
        left, right = 51, page.rect.width - 51
        prompt=span("Show a Python greeting")
        assert abs(prompt["bbox"][2] - (right-9)) < 1 and prompt["bbox"][0] > left
        assert abs(span("Left aligned")["bbox"][0]-left) < 1
        center = span("Centered caption")["bbox"]
        assert abs(sum(center[::2])/2-(left+right)/2)<1
        assert abs(span("Right aligned")["bbox"][2]-right)<1
        justified = span("The paragraph below")
        assert abs(justified["bbox"][0]-left)<1 and abs(justified["bbox"][2]-right)<4
        assert not any(s["text"] in ("USER","CHATGPT","Code and paragraph alignment","1 / 1") for s in spans)
        assert "LiberationSans" in prompt["font"]
        keyword, ret, string = span("def"), span("return"), span('f"Hello')
        assert keyword["color"]==0xff77aa and "Bold" in keyword["font"]
        assert ret["color"]==0x80dbc4
        assert string["color"]==0xffcb86 and "Oblique" in string["font"]
        assert code.contains(fitz.Rect(keyword["bbox"]))
        advance = (keyword["bbox"][2]-keyword["bbox"][0])/3
        assert abs(ret["bbox"][0]-keyword["bbox"][0]-4*advance)<0.2
        dy = ret["origin"][1]-keyword["origin"][1]
        assert abs(span("print(")["origin"][1]-ret["origin"][1]-2*dy)<0.2
        assert "Bold" in span("Bold text")["font"]
        assert "Italic" in span("Italic text")["font"]
        assert span("Bold + Italic")["flags"] & 18 == 18  # bold and italic
        assert any("LiberationSans-BoldItalic" in f[3] for f in page.get_fonts())
        assert span("This text is green.")["color"]==0x178146
        def find_ink(phrase, color, y_offset):
            box=page.search_for(phrase)[0]
            target=box.y0+box.height*y_offset
            return any(d["fill"] and tuple(round(v*255) for v in d["fill"])==color
                       and d["rect"].y0-1 <= target <= d["rect"].y1+1
                       and d["rect"].x0 <= box.x0+1 and d["rect"].x1 >= box.x1-1
                       for d in page.get_drawings())
        assert find_ink("This text has been deleted.", (17,17,17), 0.6)
        assert find_ink("This text is underlined.", (17,17,17), 0.96)
        box=page.search_for("This text is highlighted.")[0]
        highlights=[d["rect"] for d in page.get_drawings() if d["fill"]
                    and tuple(round(v*255) for v in d["fill"])==(255,241,157)]
        assert highlights and all(any(r.contains(point) for r in highlights)
                        for point in [box.tl+(1,1), box.br-(1,1)])
        assert "Bold" not in next(s for s in spans if "This is an important message." in s["text"])["font"]
    print(path.name, "passed color, placement, alignment, whitespace and selectable text checks")

with fitz.open(root / "long.pdf") as doc:
    text="\n".join(page.get_text() for page in doc)
    assert all(text.count(f"code_line_{i:03}") == 1 for i in range(180))


# Check the rendered result of both menus independently of the serialized style model.
for path in [root / "layout-pair.pdf", root / "layout-chat.pdf"]:
    with fitz.open(path) as doc:
        assert len(doc) == 1
        page = doc[0]
        spans = [s for b in page.get_text("dict")["blocks"] if b["type"] == 0
                 for line in b["lines"] for s in line["spans"]]
        def exact(text):
            return next(s for s in spans if s["text"] == text)
        title = exact("Mobile agents on a graph")
        assert title["color"] == 0x1f3864 and title["size"] == 20 and "Bold" in title["font"]
        assert abs(title["bbox"][0] - 51) < 0.1
        assert exact("Comparison")["size"] == 16
        figures = [exact(text)["bbox"] for text in ("Dispersed","Rooted","General")]
        assert figures[0][0] < figures[1][0] < figures[2][0]
        assert max(b[1] for b in figures)-min(b[1] for b in figures) < 0.1
        assert len([d for d in page.get_drawings() if d.get("fill") and
                    tuple(round(v*255) for v in d["fill"]) == (40,100,237)]) == 3
        assert exact("Configuration")["size"] == 10
        assert abs(exact("3")["bbox"][0] - (51+.65*(page.rect.width-102))) < 5
        assert exact("Graph reference")["color"] == 0x0000ee
        assert any(l.get("uri") == "https://example.org/graph" for l in page.get_links())
        assert "Exported from the active branch" not in page.get_text()
        assert ("Exported from the active branch" in (doc.metadata["subject"] or "")) == ("chat" in path.stem)
    print(path.name, "passed heading, table, figure, hyperlink, and transcript checks")
