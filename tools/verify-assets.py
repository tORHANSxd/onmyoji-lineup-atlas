"""Verify every published image from local bytes; does not make requests."""
import json, hashlib
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
bundle=json.loads((root/'data/bundle.json').read_text(encoding='utf-8'))
checked=[]; errors=[]
variants=[v for r in bundle['roster']+bundle.get('actors',[]) for v in (r.get('assets') or {}).get('variants',[]) if v.get('status')=='downloaded_valid_image' and v.get('applicability')!='not_applicable']
variants+=bundle['gameAssets']['items']
variants+=list(bundle.get('gameConfig',{}).get('icons',{}).values())
for v in variants:
        if v['localPath'] in checked:continue
        p=(root/v['localPath']).resolve()
        try:
            if not p.is_relative_to((root/'data/images').resolve()):raise ValueError('path outside image directory')
            raw=p.read_bytes()
            if hashlib.sha256(raw).hexdigest()!=v.get('fileSHA256',v['sha256']):raise ValueError('hash mismatch')
            with Image.open(p) as im:
                im.verify()
            with Image.open(p) as im:
                im.load()
                if [im.width,im.height]!=[v['width'],v['height']]:raise ValueError('dimensions mismatch')
            checked.append(v['localPath'])
        except Exception as e:errors.append({'path':v['localPath'],'error':str(e)})
report={'checked':len(checked),'errors':errors,'skillIcons':len(bundle.get('gameConfig',{}).get('icons',{})),'method':'SHA-256, Pillow verify and full decode, dimensions, local path containment; not individual visual identity review'}
(root/'verification/image-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
if errors:raise SystemExit(1)
