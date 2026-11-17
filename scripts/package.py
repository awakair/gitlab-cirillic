"""Create reproducible extension and source archives. Does not upload anything."""
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / 'package.json').read_text())['version']
ARTIFACTS = ROOT / 'artifacts'
ARTIFACTS.mkdir(exist_ok=True)


def archive(destination, files, base):
    with ZipFile(destination, 'w', compression=ZIP_DEFLATED, compresslevel=9) as output:
        for file in sorted(files):
            entry = ZipInfo(file.relative_to(base).as_posix(), (2026, 1, 1, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            output.writestr(entry, file.read_bytes())
    print(destination.name)


archive(ARTIFACTS / f'gitlab-cirillic-{VERSION}.zip',
        (p for p in (ROOT / 'dist').rglob('*') if p.is_file()), ROOT / 'dist')
sources = [p for p in ROOT.iterdir() if p.is_file() and p.suffix != '.log']
for directory in ['src', 'extension', 'scripts', 'test', 'docs', '.github', 'third_party']:
    sources.extend(p for p in (ROOT / directory).rglob('*') if p.is_file())
archive(ARTIFACTS / f'gitlab-cirillic-{VERSION}-source.zip', sources, ROOT)
