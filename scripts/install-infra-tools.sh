#!/usr/bin/env bash
# Downloads pinned official tools into ignored workspace-local storage only.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v uv >/dev/null || { echo 'Install uv first: https://docs.astral.sh/uv/' >&2; exit 2; }
mkdir -p .tools/infra/bin .tools/infra/download
export UV_CACHE_DIR="$PWD/.tools/infra/cache"
uv venv --clear .tools/infra/venv
uv pip install --python .tools/infra/venv/bin/python cfn-lint==1.48.0
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) asset=cfn-guard-v3-aarch64-macos-latest; digest=6eb1d1693471499d47e453567a7d46f17171468ec31ff2aa98b91116b316b5c4 ;;
  Darwin-x86_64) asset=cfn-guard-v3-macos-latest; digest=4f92405e8ff12b120f8695bc0e0f1f0ed6320e09d35b359e9513ce5a074a4a52 ;;
  Linux-aarch64) asset=cfn-guard-v3-aarch64-linux-latest; digest=d562e14831794a4859782f5609186970373e8e0a049fbded2c01612d2dcdb087 ;;
  Linux-x86_64) asset=cfn-guard-v3-x86_64-linux-latest; digest=c78f7a1a6c2674f7edbf0ebdc0590126487a14b103e434aea31205a4d1034d21 ;;
  *) echo 'Unsupported platform; provide CFN_GUARD, CFN_LINT, and SYAS_PYTHON manually.' >&2; exit 2 ;;
esac
archive="$PWD/.tools/infra/download/$asset.tar.gz"
curl --fail --location --proto '=https' --tlsv1.2 "https://github.com/aws-cloudformation/cloudformation-guard/releases/download/3.2.0/$asset.tar.gz" -o "$archive"
.tools/infra/venv/bin/python - "$archive" "$digest" <<'PY'
from pathlib import Path
import hashlib, sys
actual = hashlib.sha256(Path(sys.argv[1]).read_bytes()).hexdigest()
if actual != sys.argv[2]:
    raise SystemExit('Guard archive checksum mismatch; do not execute it')
PY
tar -xzf "$archive" -C .tools/infra/download
cp ".tools/infra/download/$asset/cfn-guard" .tools/infra/bin/cfn-guard
.tools/infra/bin/cfn-guard --version
