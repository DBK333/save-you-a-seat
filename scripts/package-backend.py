#!/usr/bin/env python3
"""Package the future backend for Lambda arm64/Python 3.13; does not create a backend."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'api')
    parser.add_argument('--output', type=Path, default=ROOT / 'infra/.artifacts')
    args = parser.parse_args()
    source = args.source.resolve()
    for required in ['app.py', 'requirements.lock']:
        if not (source / required).is_file():
            parser.error(f'{source / required} is missing. Python backend implementation is a later stage; no placeholder artifact will be built.')
    args.output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='syas-package-') as directory:
        work = Path(directory)
        bundle = work / 'bundle'
        bundle.mkdir()
        subprocess.run(['python3', '-m', 'venv', str(work / 'venv')], check=True)
        subprocess.run([str(work / 'venv/bin/python'), '-m', 'pip', 'install', '--disable-pip-version-check',
                        '--no-cache-dir', '--require-hashes', '--only-binary=:all:', '--implementation', 'cp',
                        '--python-version', '3.13', '--abi', 'cp313', '--platform', 'manylinux2014_aarch64',
                        '--target', str(bundle), '-r', str(source / 'requirements.lock')], check=True)
        shutil.copytree(source, bundle / 'api', ignore=shutil.ignore_patterns('__pycache__', '.venv', '*.pyc', '.env', '.env.*', 'tests'))
        startup = bundle / 'run.sh'
        startup.write_text('#!/bin/sh\nset -eu\ncd /var/task\nexec python -m uvicorn api.app:app --host 0.0.0.0 --port 8080 --no-access-log\n')
        startup.chmod(0o755)
        (bundle / 'syas-build.json').write_text(json.dumps({'runtime': 'python3.13', 'architecture': 'arm64'}))
        packed = work / 'backend.zip'
        with zipfile.ZipFile(packed, 'w', zipfile.ZIP_DEFLATED) as archive:
            for file in sorted(bundle.rglob('*')):
                if file.is_file() and '__pycache__' not in file.parts and file.suffix != '.pyc':
                    info = zipfile.ZipInfo(str(file.relative_to(bundle)), (2020, 1, 1, 0, 0, 0))
                    info.external_attr = (0o100755 if file == startup else 0o100644) << 16
                    info.compress_type = zipfile.ZIP_DEFLATED
                    archive.writestr(info, file.read_bytes())
        digest = hashlib.sha256(packed.read_bytes()).hexdigest()
        target = args.output / f'{digest}.zip'
        shutil.copyfile(packed, target)
        print(json.dumps({'path': str(target.resolve()), 'key': f'backend/{digest}.zip', 'sha256': digest, 'runtime': 'python3.13', 'architecture': 'arm64'}, indent=2))


if __name__ == '__main__':
    main()
