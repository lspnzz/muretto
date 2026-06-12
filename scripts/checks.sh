#!/usr/bin/env bash
# Mechanical repo-hygiene gates (legibility budgets — docs/design/core-beliefs.md).
# Run by the CI docs job and locally: ./scripts/checks.sh
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0

# Gate 1: AGENTS.md stays a table of contents, not an encyclopedia.
max_agents=120
agents_lines=$(wc -l < AGENTS.md | tr -d '[:space:]')
if [ "$agents_lines" -gt "$max_agents" ]; then
  echo "FAIL: AGENTS.md is $agents_lines lines (max $max_agents)."
  echo "      Move detail into docs/ and link it — see docs/README.md conventions."
  fail=1
fi

# Gate 2: source files stay readable in one pass. Generated bindings exempt.
max_file=600
while IFS= read -r f; do
  n=$(wc -l < "$f")
  if [ "$n" -gt "$max_file" ]; then
    echo "FAIL: $f is $n lines (max $max_file). Split it into modules —"
    echo "      small files keep the code legible (docs/design/core-beliefs.md)."
    fail=1
  fi
done < <(git ls-files '*.rs' '*.ts' '*.tsx' | grep -v '^dashboard/src/types/')

if [ "$fail" -eq 0 ]; then
  echo "checks.sh: all gates pass (AGENTS.md ${agents_lines}/${max_agents} lines)"
fi
exit "$fail"
