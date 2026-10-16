"""Package a candid discovery-only M8 continuation; never issue M8 acceptance."""
from pathlib import Path
from datetime import datetime, timezone
from importlib.util import spec_from_file_location, module_from_spec
import hashlib
import json
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parent
HANDOFF = PROJECT / 'HANDOFF_TO_CHATGPT'
ARCHIVE = PROJECT / 'ARCHIVE'
NAME = 'NTK_AI_Income_Opportunity_Hunter_M8_PARTIAL_2026-10-16.zip'
BASELINE = '4c94a5212195e9f170f3787c185227ad75da2ce3'
M7_NAME = 'NTK_AI_Income_Opportunity_Hunter_M7_FINAL_2026-10-16.zip'
M7_HASH = 'a5045a20ee2a8d3eab130467bc4be42808fb2b89314e57c3e59b000d1e2c454d'
VERDICT = 'M8_PARTIAL_ENGINE_TARGET_NOT_ESTABLISHED'


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT).decode('utf-8').strip()


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    if git('status', '--porcelain'):
        raise RuntimeError('Commit reviewed discovery documents and receipts first')
    head = git('rev-parse', 'HEAD')
    remote = git('ls-remote', 'origin', 'refs/heads/main').split()[0]
    if remote != head:
        raise RuntimeError('Canonical main does not match reviewed source')
    # This tool is intentionally incapable of packaging an unreviewed runtime change.
    changed = git('diff', '--name-only', BASELINE, 'HEAD', '--', 'apps', 'packages', 'services', 'workers',
                  'firestore.rules', 'firestore.indexes.json', 'firebase.json', 'package.json', 'package-lock.json')
    if changed:
        raise RuntimeError('Discovery-only package cannot contain runtime changes')
    receipt = json.loads((ROOT / 'docs/verification/m8-discovery.json').read_text(encoding='utf-8'))
    checks = json.loads((ROOT / 'docs/verification/m8-discovery-checks.json').read_text(encoding='utf-8'))
    if receipt['verdict'] != VERDICT or receipt['engineTarget'] is not None or receipt['realAiCalls'] != 0 or checks['status'] != 'PASS':
        raise RuntimeError('Partial discovery or regression gate failed')
    old = list(HANDOFF.iterdir())
    if not old or any(not p.is_file() or p.resolve().parent != HANDOFF.resolve() for p in old):
        raise RuntimeError('Inspect unexpected current handoff contents before moving anything')
    m7 = HANDOFF / M7_NAME
    if not m7.is_file() or digest(m7) != M7_HASH or m7.stat().st_size != 38747364:
        raise RuntimeError('Accepted M7 baseline missing or changed')
    with zipfile.ZipFile(m7) as archive:
        if len(archive.infolist()) != 294 or archive.testzip():
            raise RuntimeError('Accepted M7 archive integrity failed')
    spec = spec_from_file_location('scanner', ROOT / 'tools/secret-scan.py')
    scanner = module_from_spec(spec)
    spec.loader.exec_module(scanner)
    scan = scanner.source_scan()
    if scan['findings']:
        raise RuntimeError('Source/history credential scan failed')
    tracked = git('ls-files', '-z').split('\0')
    tracked = [n for n in tracked if n]
    refs = sorted(p for p in (PROJECT / 'DESIGN_REFERENCES').rglob('*') if p.is_file())
    stage = HANDOFF / (NAME + '.building')
    if stage.exists():
        raise RuntimeError('Inspect unfinished stage before retrying')
    root_receipt = {
        'verdict': VERDICT, 'm8Accepted': False, 'runtimeVersion': '0.6.0', 'acceptedRuntimeMilestone': 'M7',
        'baselineCommit': BASELINE, 'sourceCommit': head, 'engineTarget': None, 'realAiCalls': 0,
        'realAiCapabilitiesPassed': 0, 'realAiCapabilitiesRequired': 4,
        'note': 'Source includes discovery/verification tools only. No real Engine integration or new runtime release.'
    }
    with zipfile.ZipFile(stage, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in sorted(tracked):
            path = ROOT / name
            if not path.is_file() or not path.resolve().is_relative_to(ROOT.resolve()):
                raise RuntimeError('Unsafe tracked path')
            archive.write(path, 'WORKING/' + name)
        for path in refs:
            if not path.resolve().is_relative_to((PROJECT / 'DESIGN_REFERENCES').resolve()):
                raise RuntimeError('Unsafe reference path')
            archive.write(path, 'DESIGN_REFERENCES/' + path.relative_to(PROJECT / 'DESIGN_REFERENCES').as_posix())
        archive.writestr('M8_PARTIAL_STATUS.json', json.dumps(root_receipt, indent=2) + '\n')
    with zipfile.ZipFile(stage) as archive:
        entries = archive.infolist()
        if archive.testzip() or len(entries) != len(tracked) + len(refs) + 1:
            raise RuntimeError('Completed archive integrity/count failure')
    if scanner.zip_scan(stage):
        raise RuntimeError('Archive credential scan failed')
    measured = {
        **root_receipt, 'generatedAt': datetime.now(timezone.utc).isoformat(),
        'archive': NAME, 'bytes': stage.stat().st_size, 'sha256': digest(stage),
        'entries': len(entries), 'files': sum(not e.is_dir() for e in entries),
        'directories': sum(e.is_dir() for e in entries), 'trackedSourceFiles': len(tracked),
        'referenceFiles': len(refs), 'crc': 'PASS', 'secretScan': scan,
        'regressionReceipt': checks, 'runtimeDiffFromM7': [],
        'm7': {'archive': M7_NAME, 'bytes': m7.stat().st_size, 'sha256': M7_HASH, 'entries': 294}
    }
    # Resolve every recursive/move boundary before changing current handoff state.
    target = ARCHIVE / ('M7-accepted-before-M8-partial-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
    if not target.resolve().is_relative_to(ARCHIVE.resolve()) or target.exists():
        raise RuntimeError('Unsafe preservation path')
    manifest = {p.name: digest(p) for p in old}
    target.mkdir(parents=True)
    for path in old:
        shutil.move(str(path), str(target / path.name))
    for name, checksum in manifest.items():
        if digest(target / name) != checksum:
            raise RuntimeError('Preserved handoff changed')
    measured['preservedM7Folder'] = str(target.relative_to(PROJECT)).replace('\\', '/')
    stage.rename(HANDOFF / NAME)
    (HANDOFF / (NAME + '.sha256')).write_text(f"{measured['sha256']}  {NAME}\n", encoding='utf-8', newline='\n')
    (HANDOFF / 'package-verification.json').write_text(json.dumps(measured, indent=2) + '\n', encoding='utf-8', newline='\n')
    (HANDOFF / 'workspace-state.json').write_text(json.dumps(root_receipt, indent=2) + '\n', encoding='utf-8', newline='\n')
    shutil.copyfile(ROOT / 'docs/M8_HANDOFF_STATE.md', HANDOFF / 'M8_HANDOFF_STATE.md')
    print(json.dumps({k: measured[k] for k in ['verdict', 'sourceCommit', 'archive', 'bytes', 'files', 'entries', 'sha256', 'preservedM7Folder']}, indent=2))


if __name__ == '__main__':
    main()
