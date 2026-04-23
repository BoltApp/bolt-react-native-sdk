#!/usr/bin/env python3
"""
Posts or updates the bolt-docs-sync status comment on the SDK pull request.

Reads:
  ai_rationale.txt  — analysis rationale (may be absent if analysis did not run)

Required env: PR_NUMBER, COMMIT_SHA, GH_TOKEN (consumed by gh CLI)
Optional env: NEEDS_UPDATE, PARSE_ERROR, DOCS_PR_URL
"""

import json
import os
import subprocess

pr_number = os.environ["PR_NUMBER"]
commit_sha = os.environ["COMMIT_SHA"][:7]
needs_update = os.environ.get("NEEDS_UPDATE", "false")
parse_error = os.environ.get("PARSE_ERROR", "false")
docs_pr_url = os.environ.get("DOCS_PR_URL", "")

try:
    with open("ai_rationale.txt") as f:
        rationale = f.read().strip()
except FileNotFoundError:
    rationale = "Analysis did not complete — check the workflow logs for details."

# ── Build status line ─────────────────────────────────────────────────────────
if parse_error == "true":
    status = "⚠️ Could not parse the AI response — manual review may be needed."
elif needs_update == "true" and docs_pr_url:
    pr_num = docs_pr_url.rstrip("/").split("/")[-1]
    status = (
        "Changes in this PR affect the React Native SDK docs. "
        "A documentation update PR has been opened:\n"
        f"**➔ [BoltApp/bolt-docs#{pr_num}]({docs_pr_url})**"
    )
elif needs_update == "true":
    status = (
        "✅ The AI detected possible doc changes but no file "
        "differences were produced after applying the patch."
    )
else:
    status = "✅ No documentation update required."

# ── Assemble comment body ─────────────────────────────────────────────────────
body = (
    "<!-- bolt-docs-sync -->\n"
    "## 📝 Documentation Sync\n\n"
    + status + "\n\n"
    + "<details><summary>Rationale</summary>\n\n"
    + rationale + "\n\n"
    + "</details>\n\n"
    + f"_Last updated: commit `{commit_sha}`_"
)

# ── Find existing bot comment ─────────────────────────────────────────────────
result = subprocess.run(
    [
        "gh", "api",
        f"repos/BoltApp/bolt-react-native-sdk/issues/{pr_number}/comments",
        "--jq",
        '.[] | select(.body | contains("<!-- bolt-docs-sync -->")) | .id',
    ],
    capture_output=True,
    text=True,
)
comment_id = result.stdout.strip().split("\n")[0].strip()

# ── Update existing or post new ───────────────────────────────────────────────
if comment_id:
    with open("/tmp/comment_payload.json", "w") as f:
        json.dump({"body": body}, f)
    subprocess.run(
        [
            "gh", "api",
            f"repos/BoltApp/bolt-react-native-sdk/issues/comments/{comment_id}",
            "-X", "PATCH",
            "--input", "/tmp/comment_payload.json",
        ],
        check=True,
    )
    print(f"Updated existing comment #{comment_id}")
else:
    with open("/tmp/comment_body.txt", "w") as f:
        f.write(body)
    subprocess.run(
        [
            "gh", "pr", "comment", pr_number,
            "--repo", "BoltApp/bolt-react-native-sdk",
            "--body-file", "/tmp/comment_body.txt",
        ],
        check=True,
    )
    print("Posted new comment")
