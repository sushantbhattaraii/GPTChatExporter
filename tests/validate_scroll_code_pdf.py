"""Check the actual selectable PDF characters and page bounds in both export scopes."""
from pathlib import Path
import json
import re
import subprocess
import fitz

root = Path(__file__).resolve().parents[1]
source = json.loads(subprocess.check_output([
    "node", "--input-type=module", "-e",
    'import {scrollSources} from "./tests/scroll-code-fixture.mjs"; console.log(JSON.stringify(scrollSources));',
], cwd=root, text=True))
squash = lambda s: re.sub(r"\s+", "", s)
expected = squash("".join(source.values()))

for mode in ("pair", "chat"):
    with fitz.open(root / "test-results" / f"scroll-code-{mode}.pdf") as doc:
        assert len(doc) >= 3
        code = []
        for page in doc:
            for block in page.get_text("dict", flags=fitz.TEXTFLAGS_TEXT)["blocks"]:
                for line in block["lines"]:
                    for span in line["spans"]:
                        if "Mono" in span["font"]:
                            code.append(span["text"])
                            x0, y0, x1, y1 = span["bbox"]
                            assert 45 <= x0 and x1 <= page.rect.width-44, span
                            assert 30 <= y0 and y1 <= page.rect.height-30, span
        assert squash("".join(code)) == expected, mode
        print(f"scroll-code-{mode}.pdf: all five snippets match the source in order across {len(doc)} pages, including both wide-line endings")

from zipfile import ZipFile
from xml.etree import ElementTree as ET

ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
for mode in ("pair", "chat"):
    with ZipFile(root / "test-results" / f"scroll-code-{mode}.docx") as z:
        doc = ET.fromstring(z.read("word/document.xml"))
        lines = []
        for run in doc.findall(".//w:r", ns):
            font = run.find("w:rPr/w:rFonts", ns)
            if font is not None and font.get("{%s}ascii" % ns["w"]) == "Courier New":
                lines.append("".join(n.text or "" for n in run.findall("w:t", ns)))
        expected_lines = [line or " " for code in source.values() for line in code.split("\n")]
        assert lines == expected_lines, mode
        print(f"scroll-code-{mode}.docx: all source lines match, including empty lines")
