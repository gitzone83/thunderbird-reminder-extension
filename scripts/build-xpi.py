#!/usr/bin/env python3
"""Build an XPI from an explicit runtime allowlist; requires only Python 3."""
import argparse
import json
from pathlib import Path
import re
from zipfile import ZipFile, ZIP_DEFLATED, ZipInfo

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, help='Output XPI path')
parser.add_argument('--version', help='Optional version override for a standalone build')
args = parser.parse_args()
manifest = json.loads((ROOT / 'manifest.json').read_text())
if args.version:
    if not re.fullmatch(r'\d+(?:\.\d+){0,3}', args.version):
        parser.error('--version must contain one to four dot-separated integers')
    manifest['version'] = args.version
output = args.output or ROOT / 'dist' / f"email-reminders-{manifest['version']}.xpi"
output = output.resolve()
output.parent.mkdir(parents=True, exist_ok=True)
files = [ROOT / name for name in ('manifest.json', 'background.js', 'i18n.js', 'LICENSE')]
for directory in ('_locales', 'icons', 'popup', 'reminder-dialog', 'reminder-list', 'options'):
    files.extend(path for path in (ROOT / directory).rglob('*') if path.is_file())
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for path in sorted(files):
        relative = path.relative_to(ROOT).as_posix()
        data = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode() if relative == 'manifest.json' else path.read_bytes()
        info = ZipInfo(relative, date_time=(2020, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, data)
with ZipFile(output) as archive:
    assert archive.testzip() is None
    for locale in ('en', 'ru'):
        json.loads(archive.read(f'_locales/{locale}/messages.json'))
print(output)
