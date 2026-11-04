"""Check native PDF text, color, alignment, indentation and role panel geometry."""
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
        def panel(rgb):
            return next(d["rect"] for d in page.get_drawings()
                        if d["fill"] and tuple(round(v * 255) for v in d["fill"]) == rgb)
        user, reply, code = panel((247,248,250)), panel((232,245,236)), panel((23,34,51))
        assert user.x0 < reply.x0 and user.x1 < reply.x1 and user.y1 < reply.y0
        left, right = reply.x0 + 12, reply.x1 - 12
        assert abs(span("Left aligned")["bbox"][0]-left) < 1
        center = span("Centered caption")["bbox"]
        assert abs(sum(center[::2])/2-(left+right)/2)<1
        assert abs(span("Right aligned")["bbox"][2]-right)<1
        for part in ["The paragraph below", "across the available"]:
            s=span(part)
            assert abs(s["bbox"][0]-left)<1 and abs(s["bbox"][2]-right)<5
        assert span("reply.")["bbox"][2]<right-30
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
        assert "Oblique" in span("Italic text")["font"]
        assert "BoldOblique" in span("Bold + Italic")["font"]
        assert span("This text is green.")["color"]==0x178146
        def find_ink(phrase, color, y_offset):
            box=page.search_for(phrase)[0]
            target=box.y0+box.height*y_offset
            return any(d["fill"] and tuple(round(v*255) for v in d["fill"])==color
                       and d["rect"].y0-1 <= target <= d["rect"].y1+1
                       and d["rect"].x0 <= box.x0+1 and d["rect"].x1 >= box.x1-1
                       for d in page.get_drawings())
        assert find_ink("This text has been deleted.", (0,0,0), 0.6)
        assert find_ink("This text is underlined.", (0,0,0), 0.96)
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
