"""Independent checks that the synthetic pixels are inside the exported files."""
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile
import json
import fitz
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[1]/"test-results"
def check_pixels(image):
    image=image.convert("RGB")
    assert image.size==(240,120)
    assert image.getpixel((40,40))==(19,106,201)
    assert image.getpixel((180,40))==(237,139,36)
for filename in ["image-pair.pdf","renderer-14.pdf"]:
    with fitz.open(root/filename) as d:
        img=d[0].get_images()[0]
        check_pixels(Image.open(BytesIO(d.extract_image(img[0])["image"])))
for filename in ["image-pair.docx","renderer-15.docx"]:
    with ZipFile(root/filename) as z:
        media=next(n for n in z.namelist() if n.startswith("word/media/") and n.endswith(".png"))
        check_pixels(Image.open(BytesIO(z.read(media))))
        assert b":blip " in z.read("word/document.xml")
with fitz.open(root/"as-shown.pdf") as d:
    assert len(d)>=2
    counts={}
    for page in d:
        pix=page.get_pixmap()
        ar=np.asarray(Image.frombytes("RGB",(pix.width,pix.height),pix.samples)).astype(int)
        for color in [(187,41,165),(19,106,201),(237,139,36),(221,51,68),(0,169,143),(0,255,0)]:
            counts[str(color)]=counts.get(str(color),0)+int(np.all(abs(ar-np.array(color))<12,axis=-1).sum())
    assert counts.pop(str((0,255,0)))==0, "An unrelated fixed overlay leaked into the visual PDF."
    assert min(counts.values())>100,counts
    result={"embedded_source_pixels":"pass","word_inline_image":"pass","visual_pdf_pages":len(d),"visible_color_pixel_counts":counts,"unrelated_overlay_pixels":0}
with fitz.open(root/"nested-appearance.pdf") as d:
    colors=[(244,158,17),(19,106,201),(237,139,36)]
    count={str(k):0 for k in colors}
    for pg in d:
        pix=pg.get_pixmap()
        ar=np.asarray(Image.frombytes("RGB",(pix.width,pix.height),pix.samples)).astype(int)
        for k in colors:count[str(k)]+=int(np.all(abs(ar-np.array(k))<15,axis=-1).sum())
    assert min(count.values())>100,count
    result["clipped_prompt_and_image_pixels"]=count
(root/"image-validation.json").write_text(json.dumps(result,indent=2))
print(json.dumps(result))
