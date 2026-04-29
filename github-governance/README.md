# GitHub Governance — OMA3

Pragmatic branch protection and CI policy for a two-person pre-launch team.

## Philosophy

- Every change to `main` goes through a pull request. No exceptions.
- CI is the third reviewer. If the `ci` check fails, the PR doesn't merge.
- One human approval is required — we don't have the headcount for two.
- Emergency self-merge exists because the team spans time zones, but it has clear boundaries.
- Two categories. That's it. If you're debating which one a repo belongs in, it's probably `critical`.

## How It Works

**Two ruleset JSON files.** Import one per repo. Never edit them per-repo.

- [`critical.json`](critical.json) — requires the `ci` status check to pass before merge.
- [`standard.json`](standard.json) — no required status checks.

Both share the same baseline rules (PR required, 1 approval, squash only, etc.).

**One required check name: `ci`.** Every repo has its own `.github/workflows/ci.yml` with a single job named `ci`. What steps run inside that job depends on the repo — lint, typecheck, build, compile, whatever is real for that project. No no-op scripts.

**Tests run separately.** Repos with tests have a second job named `test` in the same `ci.yml`. It runs in parallel with `ci` for visibility but is not required by the ruleset. This allows test-only PRs and test fixes to be merged without blocking on pre-existing test failures.

**PR template.** Every repo has `.github/PULL_REQUEST_TEMPLATE.md` with risk level, summary, testing, CI status, and self-merge sections. The canonical copy lives in this folder as [`PULL_REQUEST_TEMPLATE.md`](PULL_REQUEST_TEMPLATE.md).

## Files in This Folder

| File                                 | Purpose                                                    |
| ------------------------------------ | ---------------------------------------------------------- |
| `README.md`                          | This document                                              |
| `critical.json`                      | GitHub ruleset for critical repos — import via GitHub UI   |
| `standard.json`                      | GitHub ruleset for standard repos — import via GitHub UI   |
| `PULL_REQUEST_TEMPLATE.md`           | Canonical PR template — copied to each repo's `.github/`   |

## Repository Categories

### `critical`

Repos where a mistake can break production, deployment, SDK consumers, trust logic, or onchain behavior.

| Repository                           | CI Steps (required)          | Test Job |
| ------------------------------------ | ---------------------------- | -------- |
| `rep-attestation-frontend`           | lint, typecheck, build       | yes      |
| `app-registry-frontend`              | lint, typecheck, build       | yes      |
| `omatrust-backend`                   | lint, typecheck, build       | yes      |
| `omatrust-api-gateway`               | typecheck                    | no       |
| `omatrust-widgets`                   | typecheck, build             | no       |
| `omatrust-sdk`                       | typecheck, build             | yes      |
| `oma3-ops`                           | typecheck, build             | yes      |
| `app-registry-evm-solidity`          | compile                      | yes      |
| `rep-attestation-tools-evm-solidity` | compile                      | yes      |

### `standard`

Repos where mistakes are usually recoverable and lower-risk.

| Repository                           | CI Steps (required)          | Test Job |
| ------------------------------------ | ---------------------------- | -------- |
| `developer-docs`                     | build                        | no       |
| `omatrust-landing`                   | typecheck, build             | no       |

### Exceptions

| Repository                           | Notes                                                           |
| ------------------------------------ | --------------------------------------------------------------- |
| `omatrust-docs`                      | Pure markdown, no `package.json`. No CI workflow. Ruleset only. |

## What the Rulesets Enforce

Both `standard` and `critical` share a common baseline:

- Target: `refs/heads/main`
- No direct commits to `main`
- Pull request required
- 1 approving review required
- Dismiss stale approvals on push
- Require review thread resolution
- Squash merge only
- Require linear history
- Block force pushes
- Block branch deletion

`critical` adds:

- **Required status check: `ci`** — the branch must be up-to-date with `main` before merge.
- **`require_last_push_approval: true`** — if the author pushes new commits after approval, the approval is dismissed and a fresh review is needed.

## Bypass

The `maintainers` team (org-level, ID `17327411`) is configured as a bypass actor with `"bypass_mode": "pull_request"` in both rulesets. This means:

- Members **cannot** push directly to `main`.
- Members **can** merge their own PR without a second reviewer (emergency self-merge).
- CI must still pass.

## CI Architecture

Each repo owns its own `.github/workflows/ci.yml`. The one rule: **the job must be named `ci`**.

The `ci` job contains only steps that are real for that repo — lint, typecheck, build, compile. No placeholder or no-op steps.

Repos with tests have a separate `test` job in the same workflow file. It runs in parallel for visibility but is **not required** by the ruleset. This avoids blocking PRs when:
- The test engineer submits tests that expose implementation bugs
- Pre-existing test failures haven't been fixed yet
- A developer needs to merge partial work before all tests pass

## Setup Order

For a new repository:

1. Add `.github/workflows/ci.yml` with a job named `ci`. Include only steps that are real for the repo — lint if it has a linter, typecheck if it's TypeScript, build if it produces output, compile if it's Solidity. No no-op steps. If the repo has tests, add a separate `test` job in the same file (not required by the ruleset).
2. Add `.github/PULL_REQUEST_TEMPLATE.md` (copy from this folder).
3. Push the branch and open a PR so the `ci` check runs once.
4. Confirm the PR shows a check named exactly `ci`.
5. Go to the repo → **Settings** → **Rules** → **Rulesets** → **New ruleset** → **Import a ruleset**.
6. Upload `critical.json` or `standard.json`.
7. Set enforcement to **Active**.
8. Update the repository tables in this README.

## Emergency Self-Merge Policy

**Who:** Members of the `maintainers` team.

**When:** The other reviewer is unavailable and the change cannot wait.

**How:** Open a normal PR. CI must pass. Fill out the self-merge section in the PR template. Tag a post-merge reviewer. Apply the `self-merged` and `post-merge-review-needed` labels.

### Allowed self-merge examples

- Production outage fix
- Broken deploy pipeline
- Launch-blocking bug
- Failed build blocking work
- Low-risk typo / config fix
- Dependency / security patch
- Docs correction blocking external users
- Test-only changes
- CI / workflow fixes

### Never self-merge (red-zone)

These changes require a second pair of eyes regardless of urgency:

- Smart contract logic
- Contract deployment
- Auth / signature verification
- Permission model changes
- Database migrations
- Production secrets
- GitHub Actions permission changes
- Deployment credentials
- Irreversible onchain changes
- Registry identity / trust logic
- Attestation validity logic

If a red-zone change is truly urgent and no reviewer is available, escalate — don't self-merge.

## Updating Rulesets

Edit the JSON file in this folder, then re-import or update via the [GitHub Rulesets API](https://docs.github.com/en/rest/repos/rules). This repo (`oma3-ops`) is the central source of truth. Do not hand-edit imported rulesets in individual repos unless the change should also be reflected here.

## Moving a Repo Between Categories

1. Update the tables in this README.
2. Delete the old ruleset from the repo's Settings → Rules → Rulesets.
3. Import the new category's JSON file.

## Updating a Repo's CI

1. Edit `.github/workflows/ci.yml` in the target repo.
2. The job must still be named `ci`. The ruleset doesn't need to change.

## Suggested PR Labels

Create these labels in each repository:

| Label                      | Color suggestion     | Purpose                                 |
| -------------------------- | -------------------- | --------------------------------------- |
| `self-merged`              | `#d93f0b` (red)      | PR was merged without a second reviewer |
| `emergency`                | `#e11d48` (red)      | Urgent fix                              |
| `post-merge-review-needed` | `#fbca04` (yellow)   | Needs review after merge                |
| `launch-blocker`           | `#b60205` (dark red) | Blocking launch                         |
| `low-risk`                 | `#0e8a16` (green)    | Low-risk change                         |
| `security`                 | `#d93f0b` (red)      | Security-related                        |
| `red-zone`                 | `#b60205` (dark red) | Touches red-zone code                   |
| `contract-change`          | `#5319e7` (purple)   | Smart contract change                   |

## Notes

- **`omatrust-api-gateway`** has a minimal `package.json` with only `typescript` as a devDep. Its CI runs `npm run typecheck` (`tsc --noEmit`).
- **`omatrust-widgets`** and **`omatrust-landing`** use pnpm, not npm. Their CI workflows use `pnpm install --frozen-lockfile`.
- **`strict_required_status_checks_policy`** in `critical.json` requires the branch to be up-to-date with `main` before merging. If this causes too much friction, set it to `false`.
