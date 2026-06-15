#!/usr/bin/env bash
# YHF 一键门禁 — Oracle 模式，默认 G0 红线
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
node yhf/gate.js "$@"
echo ""
echo "报告: yhf/results/gate_latest.md"
