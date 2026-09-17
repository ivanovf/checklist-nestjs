---
name: git-commit-message
description: Stage and commit git changes with a clear, professional commit message (concise summary line + body explaining what changed and why, no type prefixes like feat/fix). Use this whenever the user asks to commit, "write a commit message," "commit this", "commit my changes", or wants help wrapping up a git commit — even if they just say "commit" with no other detail. Also use when the user asks to review staged/unstaged changes before committing.
---

# Git Commit Message

Writes professional commit messages and runs the commit for the user. The style is plain and professional: a short imperative summary line, then a blank line, then a body explaining what changed and why. No Conventional Commits type prefixes (no `feat:`, `fix:`, `chore:`, etc.).

## Workflow

0. **Check for tests before touching anything, if the repo has them.** Look for the obvious signals (`package.json` scripts, a `Makefile` target, `pytest`/`tox` config, a `test`/`spec` directory, CI config like `.github/workflows/*.yml`) to figure out how this repo runs its tests.
   - If there's a clear, fast test/lint command (unit tests, not a full CI matrix) and the changes are non-trivial, run it before staging/committing, e.g. `npm test`, `pytest`, `go test ./...`, `cargo test`.
   - If tests fail, stop and tell the user — don't commit broken code silently. Show the failure output and ask whether they want to fix it first or commit anyway (e.g. WIP commit).
   - If there's no discoverable test setup, or the change is trivial (docs, comments, formatting), skip this step — don't invent a test command or install a test runner.
   - Never run destructive or slow commands (full E2E suites, deploys) without asking first.

1. **Inspect the repo state.**
   ```bash
   git status
   git diff --staged
   git diff
   ```
   - If nothing is staged but there are unstaged changes, ask the user (or, if they already said "commit everything" / "commit my changes", just proceed) whether to stage all modified/tracked files with `git add -u`, or `git add -A` if there are new untracked files that are clearly meant to be included. Never guess on files that look like secrets, credentials, build artifacts, or `.env` files — leave those unstaged and flag them.
   - If nothing is staged AND nothing is unstaged, tell the user there's nothing to commit.

2. **Read the actual diff, don't guess.** Base the message only on what the diff shows — files touched, functions added/removed/changed, config or dependency updates. Check `git log -3 --oneline` to match the repo's existing tone/voice (some repos are terse, some are more descriptive) but always keep the format below.

3. **Write the commit message using the template.** See `assets/commit_template.txt` for the exact structure and worked examples (a simple one-liner, a body with prose, and a body with bullets). Read that file rather than reconstructing the format from memory.

   Guidelines:
   - Summary line: imperative mood ("Add", "Fix", "Update", not "Added"/"Fixes"), no period at the end, no type prefix.
   - Body explains *why* when it's not obvious from the diff alone (e.g. a bug being fixed, a tradeoff being made), and *what* at a level someone skimming `git log` would find useful.
   - Use bullet points in the body only when there are genuinely multiple distinct changes; otherwise prose is more professional than a forced list.
   - Don't editorialize ("this is a great improvement") — stay factual and neutral, like a senior engineer writing for teammates.
   - Don't mention Claude, AI, or tooling in the message.

4. **Show the drafted message to the user before committing**, unless they've clearly said to just go ahead (e.g. "commit this with a good message" is enough authorization to proceed without a preview; "draft me a commit message" is not authorization to run the commit).

5. **Commit.**
   ```bash
   git commit -m "<summary line>" -m "<body>"
   ```
   Use a separate `-m` flag for the summary and for the body so git handles the blank-line separation correctly. If the body has multiple paragraphs, pass each as its own `-m`, or write the message to a temp file and use `git commit -F <file>` for longer/multi-paragraph bodies.

6. **Confirm** by showing the result of `git log -1 --stat` or similar, so the user can see exactly what was committed.

## Notes

- If the user asks for a different style in the moment (e.g. "actually use Conventional Commits for this one"), follow their instruction for that commit rather than the default format above.
- If a `git commit` fails (e.g. pre-commit hook rejects it, nothing staged), surface the actual error rather than retrying blindly.
- Never use `git commit --no-verify` unless the user explicitly asks to skip hooks.
- Never force-push or amend history as part of this skill unless the user explicitly asks for that separately.
