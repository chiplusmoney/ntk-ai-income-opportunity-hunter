"""Separate archive readback implementation, not an independent code review."""
from pathlib import Path, PurePosixPath
from datetime import datetime, timezone
import hashlib
import json
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parent
HANDOFF = PROJECT / 'HANDOFF_TO_CHATGPT'


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    metadata = json.loads((HANDOFF / 'package-verification.json').read_text(encoding='utf-8'))
    candidates = list(HANDOFF.glob('*.zip'))
    assert len(candidates) == 1, 'Exactly one current package required'
    path = candidates[0]
    assert path.name == metadata['archive'] and 'M8_PARTIAL' in path.name
    assert metadata['verdict'] == 'M8_PARTIAL_ENGINE_TARGET_NOT_ESTABLISHED' and metadata['m8Accepted'] is False
    checksum = sha(path)
    assert checksum == metadata['sha256'] == (HANDOFF / (path.name + '.sha256')).read_text(encoding='utf-8').split()[0]
    assert path.stat().st_size == metadata['bytes']
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().strip('\0').split('\0')
    expected = {'WORKING/' + n: ROOT / n for n in tracked}
    for file in (PROJECT / 'DESIGN_REFERENCES').rglob('*'):
        if file.is_file():
            expected['DESIGN_REFERENCES/' + file.relative_to(PROJECT / 'DESIGN_REFERENCES').as_posix()] = file
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        assert archive.testzip() is None
        names = [e.filename for e in entries]
        assert len(set(names)) == len(names) == metadata['entries']
        assert set(names) == set(expected) | {'M8_PARTIAL_STATUS.json'}
        assert sum(not e.is_dir() for e in entries) == metadata['files']
        for entry in entries:
            name = PurePosixPath(entry.filename)
            assert not name.is_absolute() and '..' not in name.parts and '\\' not in entry.filename
            assert not any(p in {'node_modules', '.git', '.cache'} for p in name.parts)
        for name, file in expected.items():
            assert archive.read(name) == file.read_bytes(), name
        receipt = json.loads(archive.read('M8_PARTIAL_STATUS.json'))
        assert receipt['m8Accepted'] is False and receipt['engineTarget'] is None and receipt['realAiCalls'] == 0
    old_folder = (PROJECT / metadata['preservedM7Folder']).resolve()
    assert old_folder.is_relative_to((PROJECT / 'ARCHIVE').resolve())
    old = old_folder / metadata['m7']['archive']
    assert sha(old) == 'a5045a20ee2a8d3eab130467bc4be42808fb2b89314e57c3e59b000d1e2c454d'
    assert old.stat().st_size == 38747364
    with zipfile.ZipFile(old) as archive:
        assert len(archive.infolist()) == 294 and archive.testzip() is None
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT).decode().strip()
    remote = subprocess.check_output(['git', 'ls-remote', 'origin', 'refs/heads/main'], cwd=ROOT).decode().split()[0]
    assert head == remote == metadata['sourceCommit'] == receipt['sourceCommit']
    assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT).strip()
    result = {
        'status': 'PASS', 'milestoneStatus': 'PARTIAL', 'm8Accepted': False,
        'verifiedAt': datetime.now(timezone.utc).isoformat(), 'sourceCommit': head,
        'archive': path.name, 'bytes': path.stat().st_size, 'entries': len(entries),
        'files': sum(not e.is_dir() for e in entries), 'sha256': checksum,
        'allSourceAndReferenceBytes': 'PASS', 'crc': 'PASS', 'checksumSidecar': 'PASS',
        'remoteMainMatches': True, 'acceptedM7ArchiveUnchanged': True,
        'scope': 'Separate archive measurement; no independent code-review or real AI acceptance claim.'
    }
    (HANDOFF / 'independent-package-verification.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
