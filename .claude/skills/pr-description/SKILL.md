---
name: pr-description
description: Generate a formatted PR description in Markdown using the repository's standard template, populated by reading the actual PR diff and metadata via the `gh` CLI. Use this skill whenever the user asks to write, generate, draft, or create a PR description, pull request description, or PR summary — whether they give a PR number, a URL, or just ask while sitting in the repo directory. Also trigger when the user says things like "fill out the PR template", "write up this PR", or "describe my PR".
---

# PR Description Generator

Generate a polished, copyable Markdown PR description by reading the PR's diff and metadata via the `gh` CLI, then filling in the standard template.

---

## Step 1: Identify the PR

**If the user provides a PR number or URL** — use it directly.

**If no PR is specified** — auto-detect from the current directory:
```bash
gh pr view --json number,title,body,url
```
If that fails (no PR for current branch), tell the user and ask them to provide a PR number.

---

## Step 2: Fetch PR data

Run these commands to gather everything needed:

```bash
# Basic PR metadata
gh pr view <PR_NUMBER_OR_URL> --json number,title,body,headRefName,baseRefName,author,additions,deletions,changedFiles

# Full diff to understand what changed
gh pr diff <PR_NUMBER_OR_URL>

# List of changed files
gh pr view <PR_NUMBER_OR_URL> --json files --jq '.files[].path'
```

If auto-detecting, omit `<PR_NUMBER_OR_URL>` from each command (gh will use the current branch).

---

## Step 3: Analyze the changes

Read the diff carefully and extract:
- **What changed**: The functional changes made (not just file names)
- **Why it likely changed**: Infer motivation from code context, naming, and PR title
- **Testing implications**: What kinds of tests would validate this — unit tests, integration tests, manual flows, edge cases. Look for existing test files in the diff for clues.
- **Security implications**: Identify any changes touching auth, data handling, input validation, secrets, permissions, PCI-relevant flows, or external integrations.

---

## Step 4: Fill in the template

Produce the following exact Markdown, with your inferred content substituted in:

````markdown
### Description

<clear prose summary of what this PR does and why — 2 to 5 sentences>

### Testing

<inferred testing notes — what was or should be tested, based on the diff. Be specific: mention affected components, flows, or edge cases. If test files are present in the diff, reference them.>

### Security Review

> [!IMPORTANT]
> A security review is required for every PR in this repository to comply with PCI requirements.

- [ ] I have considered and reviewed security implications of this PR and included the summary below.

#### Security Impact Summary

<inferred security impact — if no security implications are apparent, write "No security-sensitive changes. This PR does not touch authentication, authorization, payment flows, user data handling, or external integrations." If there ARE security implications, describe them clearly.>
````

---

## Step 5: Present the output

- Output the filled template inside a **copyable Markdown code block** so the user can paste it directly into GitHub.
- After the block, add a brief one-line note about anything uncertain (e.g., "You may want to expand the testing section if there are manual steps not reflected in the diff.").
- Do **not** add extra commentary or explanation beyond that — keep it clean and ready to paste.

---

## Tips & edge cases

- If `gh` is not authenticated, tell the user to run `gh auth login` first.
- If the diff is very large (>1000 lines), focus on the most structurally significant changes rather than enumerating every file.
- If the PR already has a body, use it as a hint but don't copy it verbatim — the goal is a well-structured description in the standard template.
- Always use the **exact template structure** above — do not add or remove sections.
