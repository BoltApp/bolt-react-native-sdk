#!/usr/bin/env python3
"""
Analyse a PR diff against current bolt-docs content using GitHub Models (gpt-4o-mini).

Two-pass approach to stay within the 8k token hard limit on GitHub Models:

  Pass 1 — send only the diff; determine whether docs need updating, which
            files to change, and a detailed description of the changes needed.

  Pass 2 — for each file identified in pass 1, send its full current content
            plus the change description and get back the complete updated file.
            Each pass-2 call is independent so the full file is always in context.

Reads:
  bolt-docs-current/*.md  — current documentation files (from fetch-docs.sh)
  pr.diff                 — PR diff (from `gh pr diff`)

Writes:
  ai_response.txt         — raw model response (pass 1)
  ai_rationale.txt        — human-readable rationale
  ai_pr_title.txt         — suggested bolt-docs PR title
  ai_pr_body.txt          — suggested bolt-docs PR body
  bolt-docs-patch/*.md    — updated doc files (only when needs_docs_update=true)

Sets GITHUB_OUTPUT:
  needs_update=true|false
  parse_error=true|false

Required env: DOCS_SUBPATH, PR_NUMBER, GITHUB_OUTPUT
"""

import json
import os
import sys
import urllib.error
import urllib.request

docs_subpath = os.environ["DOCS_SUBPATH"]
pr_number = os.environ["PR_NUMBER"]

DIFF_LIMIT = 6000  # chars — keeps pass-1 prompt well under 8k tokens

DOC_FILES = ["_index.md", "api-reference.md", "apple-pay.md", "credit-card.md", "google-pay.md", "styling.md"]


def write_gho(key, value):
    gho_path = os.environ["GITHUB_OUTPUT"]
    with open(gho_path, "a") as f:
        sv = str(value)
        if "\n" in sv:
            f.write(f"{key}<<__GHO_EOF__\n{sv}\n__GHO_EOF__\n")
        else:
            f.write(f"{key}={sv}\n")


def write_file(name, content):
    with open(name, "w") as f:
        f.write(content)


def fail_parse(reason):
    write_gho("needs_update", "false")
    write_gho("parse_error", "true")
    write_file("ai_rationale.txt", reason)
    write_file("ai_pr_title.txt", "")
    write_file("ai_pr_body.txt", "")
    sys.exit(0)


def call_model(prompt, label=""):
    github_token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not github_token:
        fail_parse("No GitHub token found (GH_TOKEN or GITHUB_TOKEN). Cannot call GitHub Models API.")

    payload = json.dumps({
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": prompt}],
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://models.inference.ai.azure.com/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {github_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"ERROR: GitHub Models API returned HTTP {e.code} ({label})", file=sys.stderr)
        print(f"body: {body}", file=sys.stderr)
        fail_parse(f"GitHub Models API error {e.code}: {body[:500]}. Manual review may be needed.")
    except urllib.error.URLError as e:
        print(f"ERROR: GitHub Models API request failed: {e.reason} ({label})", file=sys.stderr)
        fail_parse(f"GitHub Models API request failed: {e.reason}. Manual review may be needed.")

    api_data = json.loads(raw)
    return api_data["choices"][0]["message"]["content"]


# ── Read and truncate diff ───────────────────────────────────────────────────
with open("pr.diff") as f:
    diff_content = f.read(DIFF_LIMIT)
if len(diff_content) == DIFF_LIMIT:
    diff_content += f"\n...[diff truncated at {DIFF_LIMIT} chars]..."

# ── Pass 1: Analyse the diff, identify which files need updating ──────────────
schema_pass1 = (
    "{\n"
    '  "needs_docs_update": <true or false>,\n'
    '  "rationale": "<2-4 sentences explaining why an update is or is not needed>",\n'
    '  "pr_title": "<bolt-docs PR title — empty string if needs_docs_update is false>",\n'
    '  "pr_body": "<markdown bolt-docs PR body — empty string if needs_docs_update is false>",\n'
    f'  "files_to_update": ["<filename>.md", ...],\n'
    '  "changes_description": "<detailed per-file description of exactly what to add, change, or remove — empty string if needs_docs_update is false>"\n'
    "}\n"
    f'Valid filenames: {", ".join(DOC_FILES)}. '
    "If needs_docs_update is false, set files_to_update to []."
)

prompt_pass1 = "\n".join([
    "You are a documentation sync assistant for the Bolt React Native SDK.",
    "",
    "A pull request has been made to the bolt-react-native-sdk repository.",
    "Decide whether the public-facing React Native SDK documentation in bolt-docs needs updating.",
    "",
    "ANALYSE changes to (these require doc updates):",
    "- Public API types and interfaces exported from src/: BoltCheckout, BoltCheckoutProps,",
    "  BoltCheckoutRef, BoltLoginButton, BoltLoginButtonProps, useBolt, BoltProvider,",
    "  BoltProviderProps, payment method components (ApplePayButton, GooglePayButton,",
    "  CreditCardForm), configuration types, callback signatures, and return types",
    "- Changes to README.md that describe public usage",
    "- New features, removed features, or behaviour changes merchants need to know about",
    "- Changes to Apple Pay, Google Pay, or credit card integration",
    "- Changes to styling, theming, or customisation options",
    "",
    "IGNORE (do NOT flag these for doc updates):",
    "- Internal implementation details (non-exported functions/classes)",
    "- Test files (__tests__/, *.test.ts, *.spec.ts)",
    "- Build and CI configuration (.github/, build scripts, package.json devDependencies)",
    "- Pure refactors with no public API surface change",
    "- Android/iOS native code changes with no JS/TS API impact",
    "",
    "=== PR DIFF (bolt-react-native-sdk) ===",
    diff_content,
    "",
    "Respond with ONLY a valid JSON object — no markdown fences, no text before or after:",
    schema_pass1,
])

print(f"Pass 1 prompt length: {len(prompt_pass1)} chars")
print("Pass 1: Analysing diff with GitHub Models (gpt-4o-mini)...")

response_pass1 = call_model(prompt_pass1, label="pass1")
print(f"Pass 1 response length: {len(response_pass1)} chars")

write_file("ai_response.txt", response_pass1)

# ── Parse pass-1 JSON ─────────────────────────────────────────────────────────
start = response_pass1.find("{")
end = response_pass1.rfind("}") + 1

if start == -1 or end <= 0:
    print("WARNING: No JSON object found in AI response", file=sys.stderr)
    fail_parse("AI response could not be parsed as JSON. Manual review may be needed.")

try:
    data = json.loads(response_pass1[start:end])
except json.JSONDecodeError as exc:
    print(f"WARNING: JSON parse error: {exc}", file=sys.stderr)
    fail_parse(f"AI response JSON parse error: {exc}. Manual review may be needed.")

needs_update = str(data.get("needs_docs_update", False)).lower()
rationale = data.get("rationale", "No rationale provided.")
pr_title = data.get("pr_title") or f"docs(react-native): sync with bolt-react-native-sdk PR #{pr_number}"
pr_body = data.get("pr_body", "")
files_to_update = [f for f in data.get("files_to_update", []) if f in DOC_FILES]
changes_description = data.get("changes_description", "")

write_gho("needs_update", needs_update)
write_gho("parse_error", "false")
write_file("ai_rationale.txt", rationale)
write_file("ai_pr_title.txt", pr_title)
write_file("ai_pr_body.txt", pr_body)

print(f"needs_docs_update: {needs_update}")
print(f"files_to_update: {files_to_update}")

# ── Pass 2: Rewrite each identified file with full content in context ──────────
if needs_update == "true" and files_to_update and changes_description:
    os.makedirs("bolt-docs-patch", exist_ok=True)
    for filename in files_to_update:
        src = os.path.join("bolt-docs-current", filename)
        if not os.path.exists(src):
            print(f"Skipping {filename} — not found in bolt-docs-current")
            continue

        with open(src) as f:
            current_content = f.read()

        prompt_pass2 = "\n".join([
            f"You are updating the documentation file '{docs_subpath}/{filename}' for the Bolt React Native SDK.",
            "",
            "Apply the following changes to the file content below:",
            changes_description,
            "",
            f"=== CURRENT CONTENT OF {filename} ===",
            current_content,
            "",
            "Return ONLY the complete updated file content.",
            "Preserve the YAML frontmatter exactly. No markdown fences, no explanation.",
        ])

        print(f"Pass 2: Updating {filename} ({len(prompt_pass2)} chars prompt)...")
        updated_content = call_model(prompt_pass2, label=f"pass2:{filename}")

        dest = os.path.join("bolt-docs-patch", filename)
        write_file(dest, updated_content)
        print(f"Staged: {filename} ({len(updated_content)} chars)")
