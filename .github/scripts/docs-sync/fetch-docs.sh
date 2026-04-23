#!/usr/bin/env bash
# Fetches the current React Native SDK documentation files from bolt-docs.
# Required env: BOLT_DOCS_REPO, DOCS_SUBPATH, GH_TOKEN (consumed by gh CLI)
set -euo pipefail

readonly FILES=(_index.md api-reference.md apple-pay.md credit-card.md google-pay.md styling.md)

mkdir -p bolt-docs-current

for FILE in "${FILES[@]}"; do
  if ! gh api "repos/${BOLT_DOCS_REPO}/contents/${DOCS_SUBPATH}/${FILE}" \
      --jq '.content' | base64 --decode > "bolt-docs-current/${FILE}"; then
    echo "ERROR: Could not fetch ${FILE} from ${BOLT_DOCS_REPO}/${DOCS_SUBPATH}" >&2
    echo "       Ensure DOCS_WRITE_TOKEN has read access to ${BOLT_DOCS_REPO}" >&2
    exit 1
  fi
  echo "Fetched ${FILE} ($(wc -c < "bolt-docs-current/${FILE}") bytes)"
done
