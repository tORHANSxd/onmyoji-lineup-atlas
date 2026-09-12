"""Retain licenses for the frozen Python runtime and its included libraries."""
import hashlib
import importlib.metadata as metadata
import json
import shutil
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
target = root / 'release/ta-runtime/atlas-ta-helper'
licenses = target / 'licenses'
licenses.mkdir(parents=True, exist_ok=True)
rows = []
for name in ('msgpack', 'protobuf', 'pycryptodome', 'cffi', 'pycparser', 'setuptools', 'packaging', 'pyinstaller'):
    try:
        distribution = metadata.distribution(name)
    except metadata.PackageNotFoundError:
        continue
    saved = []
    for relative in distribution.files or []:
        if not any(word in relative.name.lower() for word in ('license', 'copying')):
            continue
        source = Path(distribution.locate_file(relative))
        if not source.is_file() or source.suffix in ('.py', '.pyc'):
            continue
        destination = licenses / name / str(relative).replace('/', '__').replace('\\', '__')
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
        saved.append(destination.relative_to(target).as_posix())
    if not saved:
        raise RuntimeError('Missing license: ' + name)
    rows.append({'package': name, 'version': distribution.version, 'licenses': saved})
python_license = Path(sys.base_prefix) / 'LICENSE.txt'
shutil.copyfile(python_license, licenses / 'PYTHON-LICENSE.txt')
rows.append({'package': 'Python', 'version': sys.version.split()[0], 'licenses': ['licenses/PYTHON-LICENSE.txt']})
sources = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
           for p in sorted((root / 'desktop/ta-python').iterdir()) if p.suffix in ('.py', '.json', '.txt')}
(target / 'runtime-manifest.json').write_text(json.dumps({'sources': sources, 'libraries': rows}, indent=2), encoding='utf-8')
print(json.dumps({'libraries': len(rows), 'licenseFiles': sum(len(r['licenses']) for r in rows)}))
