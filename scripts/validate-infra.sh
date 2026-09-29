#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export CFN_GUARD="${CFN_GUARD:-$PWD/.tools/infra/bin/cfn-guard}"
CFN_LINT="${CFN_LINT:-$PWD/.tools/infra/venv/bin/cfn-lint}"
SYAS_PYTHON="${SYAS_PYTHON:-$PWD/.tools/infra/venv/bin/python}"
for executable in "$CFN_GUARD" "$CFN_LINT" "$SYAS_PYTHON"; do
  if ! command -v "$executable" >/dev/null 2>&1; then
    echo "Missing $executable. Run bash scripts/install-infra-tools.sh or set CFN_GUARD, CFN_LINT and SYAS_PYTHON." >&2
    exit 2
  fi
done
"$CFN_LINT" --version
"$CFN_GUARD" --version
"$CFN_LINT" -t infra/bootstrap.yaml infra/application.yaml -r ap-southeast-2
"$CFN_GUARD" test --rules-file infra/rules/common.guard --test-data infra/tests/policy-fixtures.yaml
for stack in bootstrap application; do
  "$CFN_GUARD" validate --rules infra/rules/common.guard --rules "infra/rules/$stack.guard" --data "infra/$stack.yaml" --show-summary all
done
"$SYAS_PYTHON" -m unittest discover -s infra/tests -v
"$SYAS_PYTHON" -m unittest discover -s scripts/tests -v
