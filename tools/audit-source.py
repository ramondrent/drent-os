"""Bounded source audit: print paths, never credential values."""
from pathlib import Path
import re
import subprocess

root = Path(__file__).resolve().parents[1]
names = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=root).decode().split('\0')
findings = []
for name in filter(None, names):
    p = root / name
    if p.is_symlink():
        findings.append((name, 'symlink'))
        continue
    if any(part in {'.local', 'node_modules', 'output', 'dist', 'private-fonts', '__pycache__'} for part in p.relative_to(root).parts):
        findings.append((name, 'private or generated path'))
    if p.suffix in {'.pem', '.key', '.p12', '.wgt', '.ipk', '.pyc'}:
        findings.append((name, 'private or generated file'))
    if not p.is_file():
        continue
    try:
        data = p.read_text()
    except UnicodeError:
        continue
    patterns = [r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', r'gh[pousr]_[A-Za-z0-9]{25,}', r'github_pat_[A-Za-z0-9_]{25,}', r'AKIA[A-Z0-9]{16}', r'/Users/[A-Za-z0-9_-]+/', r'192\.168\.\d{1,3}\.\d{1,3}']
    if any(re.search(pattern, data) for pattern in patterns):
        findings.append((name, 'credential or personal-machine pattern'))
if findings:
    for name, reason in findings:
        print(reason + ': ' + name)
    raise SystemExit(1)
print('Source audit passed. Review asset rights and retain private setup separately.')
