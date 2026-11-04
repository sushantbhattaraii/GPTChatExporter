"""Validate generated artifacts independently. Requires pypdf; optional PyMuPDF for clipping."""
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET
import json
from pypdf import PdfReader
ROOT=Path(__file__).resolve().parents[1]/'test-results'
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
results=[]
for path in sorted(ROOT.glob('*.pdf')):
    reader=PdfReader(path)
    text='\n'.join(p.extract_text() or '' for p in reader.pages)
    assert len(reader.pages)>0 and text.strip(),path
    if path.name in ['pair.pdf','renderer-1.pdf']:
        assert 'Question TWO' in text and 'Question ONE' not in text and 'Question THREE' not in text,path
        assert 'def greet' in text and 'OPArrow' in text and 'x²+y²' in text and '\\frac' not in text,path
        assert any(p.get('/Annots') for p in reader.pages), 'missing PDF links'
    if path.name=='conversation.pdf':
        assert text.index('Question ONE')<text.index('Question TWO')<text.index('Question THREE')
    if path.name=='long.pdf':assert len(reader.pages)>=5
    if path.name=='settings.pdf':
        assert float(reader.pages[0].mediabox.width)>float(reader.pages[0].mediabox.height)
        assert 'Question ONE' not in text and 'def greet' not in text
    results.append({'file':path.name,'pages':len(reader.pages),'bytes':path.stat().st_size,'valid':True})
for path in sorted(ROOT.glob('*.docx')):
    with ZipFile(path) as z:
        assert z.testzip() is None,path
        for name in z.namelist():
            if name.endswith(('.xml','.rels')):ET.fromstring(z.read(name))
        doc=ET.fromstring(z.read('word/document.xml'))
        text='\n'.join(n.text or '' for n in doc.findall('.//w:t',NS))
        assert doc.findall('.//w:p',NS) and 'word/styles.xml' in z.namelist()
        if path.name in ['pair.docx','renderer-2.docx']:
            assert 'Question TWO' in text and 'Question ONE' not in text and 'Question THREE' not in text
            assert 'def greet' in text and '    return' in text and '\\frac' not in text
            mathns={'m':'http://schemas.openxmlformats.org/officeDocument/2006/math'}
            assert doc.findall('.//m:f',mathns) and doc.findall('.//m:sSup',mathns)
            assert doc.findall('.//w:tbl',NS) and doc.findall('.//w:hyperlink',NS)
            assert doc.findall('.//w:numPr',NS)
        if path.name=='settings.docx':
            size=doc.find('.//w:pgSz',NS);w=NS['w'];assert size.attrib['{'+w+'}orient']=='landscape'
            assert int(size.attrib['{'+w+'}w'])>int(size.attrib['{'+w+'}h'])
            assert 'Question ONE' not in text and 'def greet' not in text
        footers=[n for n in z.namelist() if n.startswith('word/footer') and n.endswith('.xml')]
        assert footers and b'PAGE' in z.read(footers[0])
        results.append({'file':path.name,'bytes':path.stat().st_size,'valid':True})
try:
    import fitz
    for name in ['pair.pdf','conversation.pdf','long.pdf','settings.pdf']:
        with fitz.open(ROOT/name) as doc:
            outside=[]
            for i,page in enumerate(doc):
                for block in page.get_text('dict')['blocks']:
                    for line in block.get('lines',[]):
                        for span in line.get('spans',[]):
                            x0,y0,x1,y1=span['bbox']
                            if span['text'].strip() and (x0<0 or y0<0 or x1>page.rect.width+1 or y1>page.rect.height+1):outside.append((i,span['text'][:40]))
            assert not outside,(name,outside[:10])
    results.append({'check':'PDF text fits page bounds','valid':True})
except ImportError:pass
(ROOT/'document-validation.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
