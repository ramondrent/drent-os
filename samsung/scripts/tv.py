"""Connect, inspect, install or launch CleanFrame. These commands preserve Home/startup settings."""
import argparse
import hashlib
import ipaddress
import json
from pathlib import Path
import subprocess
import time
import xml.etree.ElementTree as XML

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('action', choices=['info', 'install', 'launch'])
parser.add_argument('--host')
parser.add_argument('--device', help='Optional device folder under .local/devices/<device>')
args = parser.parse_args()
config_file = (ROOT / '.local/devices' / args.device / 'device.json') if args.device else (ROOT / '.local/device.json')
config = json.loads(config_file.read_text()) if config_file.exists() else {}
host = args.host or config.get('host')
if not host:
    raise SystemExit('Add the TV address to .local/device.json or pass --host.')
ipaddress.ip_address(host)
sdb = ROOT / '.local/tizen-sdk/tools/sdb'
if not sdb.exists():
    raise SystemExit('Local SDB tool missing. See docs/development.md.')
manifest = XML.parse(ROOT / 'app/config.xml').getroot()
app_id = manifest.find('{http://tizen.org/ns/widgets}application').get('id')


def run(*command, quiet=False):
    result = subprocess.run([str(sdb), *command], text=True, capture_output=True, timeout=45)
    output = result.stdout + result.stderr
    if not quiet:
        print(output, end='' if output.endswith('\n') else '\n', flush=True)
    if result.returncode:
        raise SystemExit('SDB command failed.')
    return output


serial = host + ':26101'
connected = run('connect', serial)
if 'connected to ' not in connected.lower() and 'already connected' not in connected.lower():
    raise SystemExit('TV connection was not confirmed.')
if args.action == 'info':
    run('-s', serial, 'capability')
elif args.action == 'launch':
    output = run('-s', serial, 'shell', '0', 'execute', app_id)
    if 'successfully launched' not in output:
        raise SystemExit('App launch was not confirmed. Check the TV.')
else:
    widget = ROOT / 'dist/CleanFrame.wgt'
    if not widget.exists():
        raise SystemExit('Run npm run package first.')
    setup_file = (ROOT / '.local/devices' / args.device / 'setup-record.json') if args.device else (ROOT / '.local/setup-record.json')
    setup = json.loads(setup_file.read_text()) if setup_file.exists() else {}
    profile_name = setup.get('signing_profile', 'FreestyleHome')
    profiles_xml = ROOT / '.local/tizen-sdk-data/profile/profiles.xml'
    if profiles_xml.exists():
        for prof in XML.parse(profiles_xml).getroot().findall('profile'):
            if prof.get('name') == profile_name:
                for item in prof.findall('profileitem'):
                    key_path = item.get('key')
                    if key_path:
                        dev_profile = Path(key_path).parent / 'device-profile.xml'
                        if dev_profile.exists():
                            run('-s', serial, 'push', str(dev_profile), '/home/owner/share/tmp/sdk_tools/device-profile.xml', quiet=True)
                            break
    digest = hashlib.sha256(widget.read_bytes()).hexdigest()[:12]
    remote = '/home/owner/share/tmp/sdk_tools/CleanFrame-' + digest + '-' + str(time.time_ns()) + '.wgt'
    pushed = run('-s', serial, 'push', str(widget), remote)
    if '1 file(s) pushed' not in pushed or 'failed' in pushed.lower():
        raise SystemExit('Widget transfer was not confirmed.')
    output = run('-s', serial, 'shell', '0', 'vd_appinstall', app_id, remote)
    if 'install completed' not in output or 'install failed' in output:
        raise SystemExit('TV installation failed or was not confirmed.')
    installed = run('-s', serial, 'shell', '0', 'applist', quiet=True)
    if app_id not in installed:
        raise SystemExit('App was not found in the installed-app list.')
    print('CleanFrame installation confirmed. Startup defaults are unchanged.')
