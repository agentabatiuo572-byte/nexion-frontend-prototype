# Project Instructions

## UniApp GitHub Sync Rules

- After each completed task, sync (commit + push) to GitHub automatically without asking; state the pushed range in the wrap-up report. (Owner decision 2026-08-15 — supersedes the old ask-first rule.) **Pushing to the mainline `UniApp` is additionally gated by the full-verify rule below.**
- Before pushing, check local vs remote differences (`git fetch` + compare).
- Only stop to ask when the push would overwrite remote-only commits (non-fast-forward); fast-forward pushes need no confirmation. Never force-push without explicit user confirmation.
- Do not create a new branch unless the user asks for one — except the `codex/<topic>` escape branch described below.

## Mainline full-verify gate (owner decision 2026-08-19)

- 🔴 A push to `UniApp` is accepted only if the **exact commit being pushed** has a green **full** verify: after your last commit, with a clean tree, run `npm run verify` (≈16 min; writes `.verify-cache/last-run.json`), then push. scoped / static greens do not count.
  why: on 2026-08-18/19 six commits reached `UniApp` without a full run and turned the mainline red in 4 steps (unregistered contract tests, a login-order contract, order-readback contracts, store sentinels).
  check: the git pre-push hook `.githooks/pre-push` → `.githooks/verify-before-push.mjs` (auto-installed by `npm install` via the `prepare` script; manual: `git config core.hooksPath .githooks`) rejects the push and prints why. Red test: `npm run test:githooks`.
- If this environment cannot run the full verify (no browser / no deps), do NOT push to `UniApp`: push to a `codex/<topic>` branch instead (not gated) and say so in the wrap-up; a machine that can run full will merge it into `UniApp`.
- `git push --no-verify` and `ALLOW_UNVERIFIED_PUSH="<reason>"` both bypass the gate — only with an explicit owner order in the current task; the env-var form leaves a trace in `.verify-cache/push-valve.log`, `--no-verify` leaves none, so prefer the env-var form when ordered.
