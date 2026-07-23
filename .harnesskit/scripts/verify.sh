#!/usr/bin/env bash
set -euo pipefail

echo "== HarnessKit verify =="

./.harnesskit/scripts/verify-fast.sh

if [[ "${HARNESS_VERIFY_TARGETED:-1}" == "1" ]]; then
  ./.harnesskit/scripts/verify-targeted.sh
else
  echo "Skipping targeted verification: HARNESS_VERIFY_TARGETED=0"
fi

if [[ "${HARNESS_VERIFY_FULL:-0}" == "1" ]]; then
  ./.harnesskit/scripts/verify-full.sh
else
  echo "Skipping full verification: set HARNESS_VERIFY_FULL=1 to run slow tests, builds, and E2E."
fi

echo "HarnessKit verify complete."
