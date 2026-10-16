"""Credential-pattern scan. Reports locations and categories, never matched values."""
from pathlib import Path
import json, re, subprocess, sys, zipfile

ROOT = Path(__file__).resolve().parents[1]
PATTERNS = {
    'service-account-private-key': re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[A-Za-z0-9+/\s\\n]{60,}'),
    'github-private-token': re.compile(rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})'),
    'telegram-bot-token': re.compile(rb'\b[0-9]{6,12}:[A-Za-z0-9_-]{30,}\b'),
    'google-oauth-token': re.compile(rb'\b(?:ya29\.[A-Za-z0-9_-]{30,}|1//[A-Za-z0-9_-]{40,})'),
    'render-private-key': re.compile(rb'\brnd_[A-Za-z0-9]{25,}'),
    'literal-bearer-token': re.compile(rb'\bBearer [A-Za-z0-9_.-]{32,}'),
    'scheduler-rotated-value-shape': re.compile(rb'\b[a-f0-9]{96}\b'),
    'literal-private-config': re.compile(rb'(?:CLOUDFLARE_API_TOKEN|RENDER_API_KEY|HUNTER_SHARED_SECRET|TELEGRAM_BOT_TOKEN|FLAGSHIP_ROUTER_API_KEY)\s*[:=]\s*[\x22\x27]([A-Za-z0-9:_-]{20,})[\x22\x27]')
}

def scan_bytes(label, data):
    findings = []
    for category, pattern in PATTERNS.items():
        for match in pattern.finditer(data):
            # Only explicitly synthetic test credentials are exempt, and only
            # in test sources. Real credential shapes are never exempted.
            if category == 'literal-private-config' and ('.test.' in label or '/test/' in label) and match.group(1).startswith(b'test-only-'):
                continue
            findings.append({'location': label, 'category': category})
            break
    return findings

def source_scan(include_history=True):
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z'], cwd=ROOT).decode().split('\0')
    files = {ROOT / f for f in tracked + untracked if f}
    files.update((ROOT / 'apps/web/dist').rglob('*'))
    findings = []
    scanned = 0
    for file in sorted(files):
        if file.is_file():
            findings.extend(scan_bytes(str(file.relative_to(ROOT)).replace('\\', '/'), file.read_bytes()))
            scanned += 1
    blobs = 0
    if include_history:
        objects = subprocess.check_output(['git', 'rev-list', '--objects', '--all'], cwd=ROOT).splitlines()
        for line in objects:
            oid = line.split(b' ', 1)[0].decode('ascii')
            kind = subprocess.check_output(['git', 'cat-file', '-t', oid], cwd=ROOT).strip()
            if kind != b'blob':
                continue
            data = subprocess.check_output(['git', 'cat-file', 'blob', oid], cwd=ROOT)
            name = line.split(b' ', 1)[1].decode(errors='replace') if b' ' in line else ''
            findings.extend(scan_bytes('git-blob:' + oid + '/' + name, data))
            blobs += 1
    return {'scannedCurrentFilesAndBundles': scanned, 'scannedHistoryBlobs': blobs, 'findings': findings, 'privateCredentialPatternFindingCount': len(findings), 'publicFirebaseWebConfiguration': 'permitted; not a server credential', 'scope': 'tracked and new source, documentation, production frontend bundle, all reachable Git history'}

def zip_scan(path):
    findings = []
    with zipfile.ZipFile(path) as archive:
        for item in archive.infolist():
            if not item.is_dir():
                findings.extend(scan_bytes(item.filename, archive.read(item)))
    return findings

if __name__ == '__main__':
    report = source_scan()
    if len(sys.argv) > 1:
        report['zipFindings'] = zip_scan(Path(sys.argv[1]))
    print(json.dumps(report, indent=2))
    sys.exit(bool(report['findings'] or report.get('zipFindings')))
