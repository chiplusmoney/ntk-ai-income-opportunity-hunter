"""Separate archive readback: enumerate and hash the finished ZIP, compare every source byte.

This is independent measurement of the package, not a claim of an independent code reviewer.
It never rewrites the source tree or the ZIP and prints no matched secret values.
"""
from pathlib import Path, PurePosixPath
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parent
HANDOFF = PROJECT / 'HANDOFF_TO_CHATGPT'
VERDICT = 'M7_OPPORTUNITY_COVERAGE_AND_SMART_ALERTS_VERIFIED'


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT).decode().strip()


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def main():
    require(not git('status', '--porcelain'), 'Source tree changed after packaging')
    head = git('rev-parse', 'HEAD')
    remote = git('-c', 'credential.helper=', 'ls-remote', 'origin', 'refs/heads/main').split()[0]
    require(head == remote, 'Canonical remote main does not match source')
    zips = list(HANDOFF.glob('*.zip'))
    require(len(zips) == 1, 'Canonical handoff must contain one ZIP')
    path = zips[0]
    meta = json.loads((HANDOFF / 'package-verification.json').read_text(encoding='utf-8'))
    checksum = sha(path)
    require(checksum == meta['sha256'] == (HANDOFF / (path.name + '.sha256')).read_text().split()[0], 'Checksum mismatch')
    require(path.stat().st_size == meta['sizeBytes'], 'Byte count mismatch')
    require(meta['gitCommit'] == head, 'Metadata source revision mismatch')
    tracked = [p for p in git('ls-files', '-z').split('\0') if p]
    references = [p for p in (PROJECT / 'DESIGN_REFERENCES').rglob('*') if p.is_file()]
    expected = {'WORKING/' + p for p in tracked}
    expected.update('DESIGN_REFERENCES/' + p.relative_to(PROJECT / 'DESIGN_REFERENCES').as_posix() for p in references)
    expected.add('M7_PACKAGE_ACCEPTANCE.json')
    with zipfile.ZipFile(path) as archive:
        require(archive.testzip() is None, 'ZIP CRC failure')
        names = archive.namelist()
        require(len(names) == len(set(names)), 'Duplicate archive entries')
        require(set(names) == expected, 'Unexpected or missing package entries')
        for name in names:
            parts = PurePosixPath(name).parts
            require(not PurePosixPath(name).is_absolute() and '..' not in parts, 'Unsafe archive path')
            require(not any(p in {'.git', 'node_modules', 'dist', '.firebase'} for p in parts), 'Runtime/dependency folder included')
        for name in tracked:
            require(archive.read('WORKING/' + name) == (ROOT / name).read_bytes(), 'Source-byte mismatch: ' + name)
        for ref in references:
            name = 'DESIGN_REFERENCES/' + ref.relative_to(PROJECT / 'DESIGN_REFERENCES').as_posix()
            require(archive.read(name) == ref.read_bytes(), 'Reference-byte mismatch')
        acceptance = json.loads(archive.read('M7_PACKAGE_ACCEPTANCE.json'))
        require(acceptance['verdict'] == VERDICT and acceptance['sourceCommit'] == head, 'Final acceptance revision/verdict mismatch')
        files = sum(not x.is_dir() for x in archive.infolist())
        require(files == meta['archiveFileCount'] == acceptance['finalArchiveFileCount'], 'File count mismatch')
        require(len(names) == meta['archiveEntryCount'], 'Entry count mismatch')
    spec = importlib.util.spec_from_file_location('scan', ROOT / 'tools/secret-scan.py')
    scanner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(scanner)
    require(not scanner.zip_scan(path), 'Finished ZIP private credential pattern finding')
    prior = list((PROJECT / 'ARCHIVE').rglob('NTK_AI_Income_Opportunity_Hunter_M6_FINAL_2026-10-16.zip'))
    require(len(prior) == 1, 'Accepted M6 package preservation is ambiguous')
    require(sha(prior[0]) == '7520c4fdf79e716f3d23c2d2004e2f7b3900b20a978dd612a44800ce70d0364d', 'Accepted M6 bytes changed')
    require(prior[0].stat().st_size == 38467738, 'M6 byte count changed')
    with zipfile.ZipFile(prior[0]) as archive:
        require(archive.testzip() is None and len(archive.namelist()) == 264, 'Preserved M6 integrity failure')
    report = {
        'generatedAt': datetime.now(timezone.utc).isoformat(), 'status': 'PASS', 'verdict': VERDICT,
        'filename': path.name, 'sha256': checksum, 'sizeBytes': path.stat().st_size,
        'archiveEntryCount': len(names), 'archiveFileCount': files, 'archiveDirectoryCount': len(names) - files,
        'gitCommit': head, 'remoteMain': remote, 'trackedSourceFilesCompared': len(tracked),
        'referenceFilesCompared': len(references), 'sourceBytesMatch': True, 'zipCrc': 'PASS',
        'zipCredentialPatternFindings': 0, 'm6PreservedUnchanged': True,
        'measurement': 'Separate implementation reopened finished archive and compared bytes; not an independent code-review claim'
    }
    (HANDOFF / 'independent-package-verification.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
