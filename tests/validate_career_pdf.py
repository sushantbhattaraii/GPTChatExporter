"""Inspect the actual PDF marks produced by both menus on the career fixture."""
from pathlib import Path
import fitz
from PIL import Image
from io import BytesIO

root=Path(__file__).resolve().parents[1]/"test-results"
for scope in ("pair", "chat"):
    with fitz.open(root/f"career-{scope}.pdf") as doc:
        pages=list(doc)
        all_text="\n".join(p.get_text() for p in pages)
        assert "Image unavailable" not in all_text
        for phrase in ("Microsoft", "Databricks", "Cockroach Labs", "PhD in Computer Science",
                       "Postdoctoral Researcher", "Direct faculty entry", "Tenure-track Assistant Professor",
                       "Tenured Associate Professor", "Professor", "Aalyria", "Apply on ZipRecruiter", "$120K - $145K/yr", "Full-time"):
            assert phrase in all_text, phrase
        def find(text):
            return next((p,r) for p in pages for r in p.search_for(text))
        def colored(d, field, rgb):
            return d.get(field) and tuple(round(255*c) for c in d[field])==rgb
        for phrase,url in (("Microsoft","https://www.microsoft.com/en-us/research/"),
                           ("Cockroach Labs","https://www.cockroachlabs.com/careers/"),
                           ("Apply on ZipRecruiter","https://www.ziprecruiter.com/")):
            p,r=find(phrase)
            assert any(l.get("uri")==url and l["from"].intersects(r) for l in p.get_links()), phrase
        p,db=find("Databricks")
        assert abs(db.y0-find("Data systems")[1].y0)<1
        assert not any(l["from"].intersects(db) for l in p.get_links())
        pic=next(img for p in pages for img in p.get_images())
        im=Image.open(BytesIO(doc.extract_image(pic[0])["image"])).convert("RGB")
        assert im.getpixel((40,40))==(19,106,201) and im.getpixel((180,40))==(237,139,36)
        p,left=find("Postdoctoral Researcher");_,right=find("Direct faculty entry")
        assert left.x1 < right.x0 and abs(left.y0-right.y0)<1
        nodes=[find(t)[1] for t in ("PhD in Computer Science","Postdoctoral Researcher","Tenure-track Assistant Professor","Tenured Associate Professor")]
        arrows=[d["rect"] for d in p.get_drawings() if colored(d,"color",(115,115,115))]
        assert len(arrows)==4 and all(nodes[i].y1<arrows[i].y0<nodes[i+1].y0 for i in range(3))
        assert any(d["rect"].contains(left) for d in p.get_drawings() if colored(d,"fill",(242,242,242)))
        p,cta=find("Apply on ZipRecruiter")
        _,job=find("Research Scientist, Optimization Systems")
        assert cta.x0>job.x1
        assert any(d["rect"].contains(cta) for d in p.get_drawings() if colored(d,"fill",(17,17,17)))
        salary=find("$120K - $145K/yr")[1]
        assert abs(salary.y0-find("Full-time")[1].y0)<1
        outer=next(d["rect"] for d in p.get_drawings() if colored(d,"color",(221,221,221)) and d["rect"].contains(cta))
        assert outer.contains(salary) and outer.contains(find("Aalyria")[1])
    print(f"career-{scope}.pdf passed image pixels, linked companies, arrow geometry, job frame and CTA checks")
with fitz.open(root/"chunked-chat.pdf") as doc:
    text="\n".join(p.get_text() for p in doc)
    assert "First large image" in text and "Final image caption" in text
    assert sum(len(p.get_image_info()) for p in doc)==3
    print("chunked-chat.pdf passed first/last text and three embedded image placements")
