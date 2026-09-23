"""Validate guide text/fonts and generate contact sheets for visual review.

Render the PDF with pdftoppm -r 110 -png before running this script.
Contact sheets are QA outputs only; they are not delivered as tutorial figures.
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import pdfplumber
from pypdf import PdfReader

root = Path(__file__).resolve().parents[1]
pdf = root / "output/pdf/Yuqi-Guide-0.9.3.pdf"
folder = root / "tmp/pdfs/guide-v093"
report_path = root / "verification/guide-v093.json"
report = json.loads(report_path.read_text(encoding="utf-8"))
reader = PdfReader(pdf)
fonts = {}
for p in reader.pages:
    for ref in p["/Resources"]["/Font"].values():
        font = ref.get_object()
        name = str(font.get("/BaseFont", ""))
        descriptor = font.get("/FontDescriptor")
        fonts[name] = bool(descriptor and descriptor.get_object().get("/FontFile2"))
guide_fonts = {name: embedded for name, embedded in fonts.items() if "MicrosoftYaHei" in name}
assert len(guide_fonts) >= 2 and all(guide_fonts.values()), fonts
assert any("Bold" in name for name in guide_fonts)
page_ids = {p.indirect_reference.idnum for p in reader.pages}
internal_links = 0
external_links = 0
for page in reader.pages:
    for ref in page.get('/Annots', []):
        annotation = ref.get_object()
        if '/Dest' in annotation:
            assert annotation['/Dest'][0].idnum in page_ids
            internal_links += 1
        else:
            action = annotation.get('/A', {}).get_object()
            assert action.get('/S') == '/URI'
            assert str(action.get('/URI')).startswith('https://github.com/tORHANSxd/onmyoji-lineup-atlas/')
            external_links += 1
assert internal_links == 33 and external_links == 4
assert len(reader.outline) == 32
all_chars = 0
with pdfplumber.open(pdf) as doc:
    for num, page in enumerate(doc.pages, 1):
        chars = page.chars
        assert all("MicrosoftYaHei" in c["fontname"] for c in chars), num
        all_chars += len(chars)
        assert len(chars) >= 150, (num, len(chars))
        outside = [c for c in chars if c["x0"] < -0.5 or c["x1"] > page.width + 0.5
                   or c["top"] < -0.5 or c["bottom"] > page.height + 0.5]
        assert not outside, (num, outside[:3])
        text = page.extract_text()
        assert "御契 0.9.3" in text, num
        assert "\ufffd" not in text and "\u25a0" not in text, num
pngs = sorted(folder.glob("page-*.png"))
assert len(pngs) == len(reader.pages) == 32, len(pngs)
font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 17)
sheet_paths = []
for start in range(0, len(pngs), 8):
    sheet = Image.new("RGB", (4 * 320, 2 * 480), "#d8d3c8")
    draw = ImageDraw.Draw(sheet)
    for offset, file in enumerate(pngs[start:start + 8]):
        with Image.open(file) as image:
            image = image.convert("RGB")
            image.thumbnail((300, 434))
            x = (offset % 4) * 320 + (320 - image.width) // 2
            y = (offset // 4) * 480 + 29
            sheet.paste(image, (x, y))
        draw.text(((offset % 4) * 320 + 12, (offset // 4) * 480 + 6),
                  f"P{start + offset + 1:02d}", font=font, fill="#332f25")
    target = folder / f"contact-{start // 8 + 1:02d}.jpg"
    sheet.save(target, quality=94)
    sheet_paths.append(str(target.relative_to(root)))
report.update(textCharacters=all_chars, fonts=fonts, glyphBoundsPassed=True,
              renderedPages=len(pngs), contactSheets=sheet_paths, internalLinks=internal_links,
              externalLinks=external_links, bookmarks=len(reader.outline), linksPassed=True)
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(dict(pages=len(pngs), characters=all_chars, embeddedFonts=sum(fonts.values()),
                     bounds="passed", contactSheets=sheet_paths), ensure_ascii=False))
