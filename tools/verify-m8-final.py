"""Independent package verification for M8 Final package."""
from pathlib import Path, PurePosixPath
from datetime import datetime, timezone
import hashlib
import json
import subprocess
import zipfile
from importlib.util import spec_from_file_location, module_from_spec

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parent
HANDOFF = PROJECT / 'HANDOFF_TO_CHATGPT'
VERDICT = 'M8_LIVE_NTK_HUNTER_AI_CORE_INTEGRATION_VERIFIED'


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def require(cond, msg):
    if not cond:
        raise RuntimeError(msg)


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT).decode().strip()


def main():
    require(not git('status', '--porcelain'), 'Source tree changed after packaging')
    head = git('rev-parse', 'HEAD')
    remote = git('ls-remote', 'origin', 'refs/heads/main').split()[0]
    require(head == remote, 'Canonical remote main does not match source')

    zips = list(HANDOFF.glob('*.zip'))
    require(len(zips) == 1, f'Expected 1 zip in HANDOFF, found {len(zips)}')
    path = zips[0]
    require('M8_FINAL' in path.name, f'Expected M8_FINAL in filename, got {path.name}')

    meta = json.loads((HANDOFF / 'package-verification.json').read_text(encoding='utf-8'))
    checksum = sha(path)
    require(checksum == meta['sha256'] == (HANDOFF / (path.name + '.sha256')).read_text().split()[0], 'Checksum mismatch')
    require(path.stat().st_size == meta['sizeBytes'], 'Byte count mismatch')
    require(meta['gitCommit'] == head, 'Source revision mismatch')
    require(meta['verdict'] == VERDICT, 'Verdict mismatch')

    tracked = [p for p in git('ls-files', '-z').split('\0') if p]
    references = [p for p in (PROJECT / 'DESIGN_REFERENCES').rglob('*') if p.is_file()]

    expected = {'WORKING/' + p for p in tracked}
    expected.update('DESIGN_REFERENCES/' + p.relative_to(PROJECT / 'DESIGN_REFERENCES').as_posix() for p in references)
    expected.add('M8_PACKAGE_ACCEPTANCE.json')

    with zipfile.ZipFile(path) as archive:
        require(archive.testzip() is None, 'ZIP CRC failure')
        names = archive.namelist()
        require(len(names) == len(set(names)), 'Duplicate archive entries')
        require(set(names) == expected, 'Unexpected or missing package entries')

        for name in names:
            parts = PurePosixPath(name).parts
            require(not PurePosixPath(name).is_absolute() and '..' not in parts, 'Unsafe archive path')
            require(not any(p in {'.git', 'node_modules', 'dist', '.firebase', '.cache'} for p in parts), 'Build/dependency folder included')

        for name in tracked:
            require(archive.read('WORKING/' + name) == (ROOT / name).read_bytes(), f'Source byte mismatch in {name}')

        for ref in references:
            ref_name = 'DESIGN_REFERENCES/' + ref.relative_to(PROJECT / 'DESIGN_REFERENCES').as_posix()
            require(archive.read(ref_name) == ref.read_bytes(), f'Reference byte mismatch in {ref_name}')

        acceptance = json.loads(archive.read('M8_PACKAGE_ACCEPTANCE.json'))
        require(acceptance['verdict'] == VERDICT, 'Acceptance verdict mismatch')
        require(acceptance['sourceCommit'] == head, 'Acceptance commit mismatch')
        for cap, res in acceptance['capabilities'].items():
            require(res == 'PASS', f'Capability {cap} is {res}')

        files = sum(not x.is_dir() for x in archive.infolist())
        require(files == meta['archiveFileCount'] == acceptance['finalArchiveFileCount'], 'File count mismatch')
        require(len(names) == meta['archiveEntryCount'], 'Entry count mismatch')

    spec = spec_from_file_location('scanner', ROOT / 'tools/secret-scan.py')
    scanner = module_from_spec(spec)
    spec.loader.exec_module(scanner)
    zip_findings = scanner.zip_scan(path)
    require(not zip_findings, f'Zip secret findings: {zip_findings}')

    report = {
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'status': 'PASS',
        'verdict': VERDICT,
        'filename': path.name,
        'sha256': checksum,
        'sizeBytes': path.stat().st_size,
        'archiveEntryCount': len(names),
        'archiveFileCount': files,
        'archiveDirectoryCount': len(names) - files,
        'gitCommit': head,
        'remoteMain': remote,
        'trackedSourceFilesCompared': len(tracked),
        'referenceFilesCompared': len(references),
        'sourceBytesMatch': True,
        'zipCrc': 'PASS',
        'zipCredentialPatternFindings': 0,
        'capabilities': acceptance['capabilities'],
        'endpoints': acceptance['endpoints'],
        'measurement': 'Independent readback reopened finished archive, verified CRC, validated all source bytes, checked acceptance receipt'
    }

    (HANDOFF / 'independent-package-verification.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
