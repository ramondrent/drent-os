"""Build with public fonts and sign using this owner's Samsung SDK profile."""
import argparse
from pathlib import Path
import json
import subprocess
import tempfile
import xml.etree.ElementTree as XML
import zipfile
from font_assets import write_widget_archive

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--device', help='Optional device folder under .local/devices/<device>')
args = parser.parse_args()
SDK = ROOT / '.local/tizen-sdk'
CLI = SDK / 'tools/ide/bin/tizen'
record_path = (ROOT / '.local/devices' / args.device / 'setup-record.json') if args.device else (ROOT / '.local/setup-record.json')
if not record_path.is_file():
    record_path = ROOT / '.local/setup-record.json'
record = json.loads(record_path.read_text())
profile = ROOT / '.local/tizen-sdk-data/profile/profiles.xml'
profile_name = record['signing_profile']
profiles = XML.parse(profile).getroot()
selected = next((p for p in profiles.findall('profile') if p.get('name') == profile_name), None)
if selected is None:
    raise SystemExit('Samsung signing profile is missing.')
for number in ['0', '1']:
    item = next((i for i in selected.findall('profileitem') if i.get('distributor') == number), None)
    if item is None or not Path(item.get('key', '')).is_file():
        raise SystemExit('Author or distributor certificate is missing.')
subprocess.run([str(CLI), 'cli-config', 'default.profiles.path=' + str(profile)], check=True)
dist = ROOT / 'dist'
dist.mkdir(exist_ok=True)
unsigned = dist / 'CleanFrame-unsigned.wgt'
write_widget_archive(unsigned, device=args.device)
# A fresh output directory prevents a password prompt/failure reusing an old widget.
signed_dir = Path(tempfile.mkdtemp(prefix='signed-', dir=dist))
subprocess.run([str(CLI), 'package', '-t', 'wgt', '-s', profile_name, '-o', str(signed_dir), '--', str(unsigned)], check=True, timeout=90)
signed = signed_dir / unsigned.name
if not signed.is_file():
    raise SystemExit('Signing did not produce a widget. Run npm run package in an interactive terminal and enter certificate passwords when prompted.')
with zipfile.ZipFile(unsigned) as source, zipfile.ZipFile(signed) as package:
    for entry in source.namelist():
        if entry not in package.namelist() or source.read(entry) != package.read(entry):
            raise SystemExit('Signed widget does not match the current build: ' + entry)
    if not {'author-signature.xml', 'signature1.xml'}.issubset(package.namelist()):
        raise SystemExit('Package is missing signing files.')
    manifest = XML.fromstring(package.read('config.xml'))
    identity = manifest.find('{http://tizen.org/ns/widgets}application')
    if identity.get('id') != record['app_id']:
        raise SystemExit('Signed application identity differs from setup record.')
target = dist / 'CleanFrame.wgt'
target.write_bytes(signed.read_bytes())
print('Signed widget created: ' + str(target))
