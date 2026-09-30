#!/usr/bin/env sh
#
# Runs the quality gates against the committed HEAD and records that it passed.
#
# GitHub Actions stays configured (.github/workflows/ci.yml), but it cannot run while the
# account is billing-locked, and paid CI is not worth it for this personal app. So the
# constitution's rule that every gate passes before a change merges is enforced locally:
# `pnpm verify` runs the gates, and the pre-push hook (.githooks/pre-push) refuses to push
# any commit this script has not passed.
#
# The gates are not run inside the hook itself. Git opens the connection to GitHub before
# running pre-push, and a run of several minutes lets the remote drop it, so the push fails
# with SIGPIPE after every gate has passed.
#
#   lint → unit tests with coverage thresholds → build → contract check → audit
#
# The e2e suite takes several minutes on /mnt/c, so it runs only on request:
#   VERIFY_E2E=1 pnpm verify
# The PR description must still state the e2e result.

set -eu

if [ -n "$(git status --porcelain)" ]; then
  echo "verify: commit or stash your changes first, so the verified commit is what was tested." >&2
  exit 1
fi

head=$(git rev-parse HEAD)

run() {
  echo "verify: $*"
  "$@"
}

run pnpm lint:ci
run pnpm test --coverage
run pnpm build
run pnpm docs:check
run pnpm audit --audit-level high

if [ "${VERIFY_E2E:-0}" = "1" ]; then
  run pnpm test:e2e
else
  echo "verify: e2e skipped (run with VERIFY_E2E=1 to include it)."
fi

# Gates can take minutes. If HEAD moved meanwhile, what passed is not HEAD.
if [ "$(git rev-parse HEAD)" != "$head" ] || [ -n "$(git status --porcelain)" ]; then
  echo "verify: the working tree changed while the gates ran; run it again." >&2
  exit 1
fi

echo "$head" > "$(git rev-parse --git-dir)/verified-sha"
echo "verify: all gates passed for $head. It can now be pushed."
