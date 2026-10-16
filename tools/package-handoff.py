"""Build a source-only handoff and measure the completed archive, never staging counts."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, shutil, subprocess, sys, zipfile
from importlib.util import spec_from_file_location, module_from_spec

WORKING = Path(__file__).resolve().parents[1]
PROJECT = WORKING.parent
HANDOFF = PROJECT / 'HANDOFF_TO_CHATGPT'
ARCHIVE = PROJECT / 'ARCHIVE'
FILENAME = 'NTK_AI_Income_Opportunity_Hunter_M6_FINAL_2026-10-16.zip'
spec = spec_from_file_location('secret_scan', WORKING / 'tools/secret-scan.py')
scanner = module_from_spec(spec); spec.loader.exec_module(scanner)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    dirty = subprocess.check_output(['git', 'status', '--porcelain'], cwd=WORKING).decode().strip()
    if dirty:
        raise RuntimeError('Commit reviewed source and receipts before packaging the canonical tree')
    scan = scanner.source_scan()
    if scan['findings']:
        raise RuntimeError('Private credential pattern scan failed; no package created')
    live = json.loads((WORKING / 'docs/verification/m6-live.json').read_text())
    automated = json.loads((WORKING / 'docs/verification/automated.json').read_text())
    if automated['status'] != 'PASS' or live.get('verdict') != 'M6_PERSONALIZED_INTELLIGENCE_AND_EARNING_OPTIMIZATION_VERIFIED' or not all(live.get('mandatoryGates', {}).values()) or not live.get('mandatoryGates'):
        raise RuntimeError('Mandatory M6 gates have not passed; accepted M5b handoff stays canonical')
    HANDOFF.mkdir(exist_ok=True)
    old_files = list(HANDOFF.iterdir())
    if any(not file.is_file() or file.resolve().parent != HANDOFF.resolve() for file in old_files):
        raise RuntimeError('Unexpected handoff layout; preservation needs review')
    tracked = [f for f in subprocess.check_output(['git', 'ls-files', '-z'], cwd=WORKING).decode().split('\0') if f]
    # Preserve the existing canonical handoff until the replacement is verified.
    path = HANDOFF / (FILENAME + '.building')
    if path.exists():
        raise RuntimeError('Unexpected unfinished package; inspect it before packaging')
    with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in sorted(tracked):
            file = WORKING / name
            if not file.resolve().is_relative_to(WORKING.resolve()) or not file.is_file():
                raise RuntimeError('Unsafe or missing tracked file')
            archive.write(file, 'WORKING/' + name)
        for file in sorted((PROJECT / 'DESIGN_REFERENCES').rglob('*')):
            if file.is_file() and file.resolve().is_relative_to((PROJECT / 'DESIGN_REFERENCES').resolve()):
                archive.write(file, 'DESIGN_REFERENCES/' + file.relative_to(PROJECT / 'DESIGN_REFERENCES').as_posix())
    with zipfile.ZipFile(path) as archive:
        damaged = archive.testzip()
        if damaged:
            raise RuntimeError('Archive integrity failure')
        entries = archive.infolist()
        entry_count = len(entries)
        file_count = sum(not entry.is_dir() for entry in entries)
    zip_findings = scanner.zip_scan(path)
    if zip_findings:
        raise RuntimeError('Final ZIP secret scan failed')
    checksum = digest(path)
    if old_files:
        destination = ARCHIVE / ('M5b-accepted-before-M6-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
        destination.mkdir(parents=True)
        for file in old_files:
            # Move individual files only, with both resolved boundaries checked.
            if file.resolve().parent != HANDOFF.resolve() or destination.resolve().parent != ARCHIVE.resolve():
                raise RuntimeError('Unsafe preservation boundary')
            shutil.move(str(file), str(destination / file.name))
    final_path = HANDOFF / FILENAME
    path.replace(final_path)
    path = final_path
    sidecar = HANDOFF / (FILENAME + '.sha256')
    sidecar.write_text(checksum + '  ' + FILENAME + '\n', encoding='ascii')
    recomputed = digest(path)
    record = {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'filename': FILENAME, 'sizeBytes': path.stat().st_size,
        'archiveEntryCount': entry_count, 'archiveFileCount': file_count,
        'archiveDirectoryCount': entry_count - file_count,
        'sha256': checksum, 'recomputedSha256': recomputed,
        'recomputedChecksumMatch': recomputed == sidecar.read_text().split()[0],
        'gitCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=WORKING).decode().strip(),
        'testSummary': automated, 'liveDeploymentState': live,
        'secretScan': {**scan, 'zipPrivateCredentialPatternFindings': zip_findings},
        'archiveIntegrity': 'PASS', 'gitHistoryIncluded': False,
        'measurementMethod': 'Final ZIP reopened, entries enumerated, full CRC checked and SHA-256 recomputed after sidecar write'
    }
    (HANDOFF / 'package-verification.json').write_text(json.dumps(record, indent=2) + '\n')
    (HANDOFF / 'workspace-state.json').write_text(json.dumps({'version':'0.5.0','gitCommit':record['gitCommit'],'verdict':live['verdict'],'canonicalPackage':FILENAME,'M6':'VERIFIED','rollbackSourceBranch':'m6-baseline-0.4.1'},indent=2)+'\n')
    facts = f"\n\n## Final archive measurements\n\nFilename: `{FILENAME}`  \nSource commit: `{record['gitCommit']}`  \nBytes: {record['sizeBytes']}  \nEntries: {entry_count}; files: {file_count}; directory entries: {entry_count - file_count}  \nSHA-256: `{checksum}`  \nIndependent recomputation matches sidecar: {record['recomputedChecksumMatch']}.\n"
    handoff = (WORKING / 'docs/M6_HANDOFF_STATE.md').read_text(encoding='utf-8')
    (HANDOFF / 'M6_HANDOFF_STATE.md').write_text(handoff + facts, encoding='utf-8')
    print(json.dumps({k: record[k] for k in ['filename','sizeBytes','archiveEntryCount','archiveFileCount','sha256','recomputedChecksumMatch','archiveIntegrity']},indent=2))

if __name__ == '__main__':
    main()
