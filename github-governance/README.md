# GitHub Governance — OMA3

Pragmatic branch protection and CI policy for a two-person pre-launch team.

## Philosophy

- Every change to `main` goes through a pull request. No exceptions.
- CI is the third reviewer. If the `ci` check fails, the PR doesn't merge.
- One human approval is required — we don't have the headcount for two.
- Emergency self-merge exists because the team spans time zones, but it has clear boundaries.
- Two categories. That's it. If you're debating which one a repo belongs in, it's probably `critical`.

> **For contributors:** The day-to-day branching and merge process is documented in [`branching-workflow.md`](branching-workflow.md). Start there if you're looking for how to create branches, open PRs, and keep staging in sync.

## How It Works

**Two ruleset JSON files.** Import one per repo. Never edit them per-repo.

- [`critical.json`](critical.json) — requires the `ci` status check to pass before merge.
- [`standard.json`](standard.json) — no required status checks.

Both share the same baseline rules (PR required, 1 approval, squash only, etc.).

**One required check name: `ci`.** Every repo has its own `.github/workflows/ci.yml` with a single job named `ci`. What steps run inside that job depends on the repo — lint, typecheck, build, compile, whatever is real for that project. No no-op scripts.

**Tests run separately.** Repos with tests have a second job named `test` in the same `ci.yml`. It runs in parallel with `ci` for visibility but is not required by the ruleset. This allows test-only PRs and test fixes to be merged without blocking on pre-existing test failures.

**PR template.** Every repo has `.github/PULL_REQUEST_TEMPLATE.md` with risk level, summary, testing, CI status, and self-merge sections. The canonical copy lives in this folder as [`PULL_REQUEST_TEMPLATE.md`](PULL_REQUEST_TEMPLATE.md).

## Files in This Folder

| File                                 | Purpose                                                        |
| ------------------------------------ | -------------------------------------------------------------- |
| `README.md`                          | This document                                                  |
| `critical.json`                      | GitHub ruleset for critical repos — import via GitHub UI       |
| `standard.json`                      | GitHub ruleset for standard repos — import via GitHub UI       |
| `PULL_REQUEST_TEMPLATE.md`           | Canonical PR template — copied to each repo's `.github/`       |
| `enforce-branch-source.yml`          | Branch enforcement workflow — copied to repos that need it     |
| `branching-workflow.md`              | Contributor guide — branching, merging, and sync process       |

## Repository Categories

### `critical`

Repos where a mistake can break production, deployment, SDK consumers, trust logic, or onchain behavior.

| Repository                           | CI Steps (required)          | Test Job | Branch Enforcement |
| ------------------------------------ | ---------------------------- | -------- | ------------------ |
| `rep-attestation-frontend`           | lint, typecheck, build       | yes      | ✅                 |
| `app-registry-frontend`              | lint, typecheck, build       | yes      | ✅                 |
| `omatrust-backend`                   | lint, typecheck, build       | yes      | ✅                 |
| `omatrust-api-gateway`               | typecheck                    | no       | ✅                 |
| `omatrust-widgets`                   | typecheck, build             | no       | ✅                 |
| `omatrust-sdk`                       | typecheck, build             | yes      | ❌                 |
| `oma3-ops`                           | typecheck, build             | yes      | ❌                 |
| `app-registry-evm-solidity`          | compile                      | yes      | ❌                 |
| `rep-attestation-tools-evm-solidity` | compile                      | yes      | ❌                 |

### `standard`

Repos where mistakes are usually recoverable and lower-risk.

| Repository                           | CI Steps (required)          | Test Job | Branch Enforcement |
| ------------------------------------ | ---------------------------- | -------- | ------------------ |
| `developer-docs`                     | build                        | no       | ❌                 |
| `omatrust-landing`                   | typecheck, build             | no       | ❌                 |

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

## Branch Enforcement

Some repos restrict which branches can open PRs to `main`. This is enforced by a workflow file (`.github/workflows/enforce-branch-source.yml`) that fails if the source branch is not `staging` or `hotfix/*`.

**Criteria for enforcement:** A repo should have branch enforcement when merging to `main` triggers an automatic deployment to a production environment that serves end users or handles trust-sensitive data.

**Enforce when:**
- The repo auto-deploys from `main` (Vercel, AWS, etc.) — a bad merge goes live immediately
- The repo serves end users directly (frontends, APIs, embeddable widgets)
- Multiple contributors or automated agents open PRs — more surface area for accidental merges

**Skip when:**
- The repo is a library/SDK consumed via versioned releases — `main` isn't live until you publish
- The repo is documentation-only or internal tooling — mistakes are easily reverted
- Deployments are manual (contract deploys, script-based releases)

**Canonical workflow file:** [`enforce-branch-source.yml`](enforce-branch-source.yml) in this folder. Copy to `.github/workflows/` in repos that need it.

The `check-source` job is **not** added to the required status checks in `critical.json`. It runs as a separate workflow and is informational by default. To make it blocking, add `"check-source"` to `required_status_checks` in the repo's imported ruleset.

## Main → Staging Auto-Sync

Every repo has a workflow (`.github/workflows/sync-main-to-staging.yml`) that automatically merges `main` back into `staging` after any push to `main`. This prevents branch divergence.

For details on why this matters, the manual fallback, and the full branching process, see [`branching-workflow.md`](branching-workflow.md).

## Setup Order

For a new repository:

1. Add `.github/workflows/ci.yml` with a job named `ci`. Include only steps that are real for the repo — lint if it has a linter, typecheck if it's TypeScript, build if it produces output, compile if it's Solidity. No no-op steps. If the repo has tests, add a separate `test` job in the same file (not required by the ruleset).
2. If the new repository uses a staging branch, add `.github/workflows/sync-main-to-staging.yml` (copy from any repo that already has it). This auto-syncs `main` back into `staging` after every merge to `main`, preventing branch divergence.
3. Add `.github/PULL_REQUEST_TEMPLATE.md` (copy from this folder).
4. Push the branch and open a PR so the `ci` check runs once.
5. Confirm the PR shows a check named exactly `ci`.
6. Go to the repo → **Settings** → **Rules** → **Rulesets** → **New ruleset** → **Import a ruleset**.
7. Upload `critical.json` or `standard.json`.
8. Set enforcement to **Active**.
9. Update the repository tables in this README.

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

## Hardening Requirements

A repo is considered hardened when all of the following are in place:

| Requirement                         | Description                                                   |
| ----------------------------------- | ------------------------------------------------------------- |
| `.github/workflows/ci.yml`          | CI workflow with a job named `ci`                             |
| `.github/workflows/sync-main-to-staging.yml` | Auto-syncs main back into staging after merges       |
| `.github/PULL_REQUEST_TEMPLATE.md`  | Standardized PR template                                      |
| Ruleset imported                    | `critical.json` or `standard.json` imported via GitHub UI     |
| Ruleset enforcement active          | Enforcement set to Active in repo settings                    |
| Bypass configured                   | `maintainers` team set as bypass actor (pull request only)    |
| Branch enforcement (if applicable)  | `enforce-branch-source.yml` added for auto-deploying repos    |

### Hardening Status

| Repository                           | CI  | PR Template | Ruleset  | Enforcement | Bypass | Branch Enforce |
| ------------------------------------ | --- | ----------- | -------- | ----------- | ------ | -------------- |
| `rep-attestation-frontend`           | ✅  | ✅          | critical | ✅ active   | ✅     | ✅             |
| `app-registry-frontend`              | ✅  | ✅          | critical | ✅ active   | ✅     | ✅             |
| `omatrust-backend`                   | ✅  | ✅          | critical | ✅ active   | ✅     | ✅             |
| `omatrust-api-gateway`               | ✅  | ✅          | critical | ✅ active   | ✅     | ✅             |
| `omatrust-widgets`                   | ✅  | ✅          | critical | ✅ active   | ✅     | ✅             |
| `omatrust-sdk`                       | ✅  | ✅          | critical | ✅ active   | ✅     | n/a            |
| `oma3-ops`                           | ✅  | ✅          | critical | ✅ active   | ✅     | n/a            |
| `app-registry-evm-solidity`          | ✅  | ✅          | critical | ⬜ pending  | ⬜     | n/a            |
| `rep-attestation-tools-evm-solidity` | ✅  | ✅          | critical | ✅ active   | ✅     | n/a            |
| `developer-docs`                     | ✅  | ✅          | standard | ✅ active   | ✅     | n/a            |
| `omatrust-landing`                   | ✅  | ✅          | standard | ✅ active   | ✅     | n/a            |
| `omatrust-docs`                      | ❌  | ❌          | standard | ✅ active   | ✅     | n/a            |
| `mpas-docs`                          | ❌  | ❌          | —        | ❌          | ❌     | n/a            |
| `mpas-sdk`                           | ❌  | ❌          | —        | ❌          | ❌     | n/a            |

Update this table as rulesets are imported.

## Exceptions and Rationale

### Repos with no CI

| Repository         | Reason                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `omatrust-docs`    | Pure markdown documentation. No `package.json`, no build step, nothing to compile or lint. The `standard.json` ruleset still enforces PR-based workflow and review. |

### Repos with minimal CI

| Repository                           | CI Steps       | Reason                                                                                                                        |
| ------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------ |
| `omatrust-api-gateway`               | typecheck only | Vercel serverless functions — only 7 TypeScript files, no build output, no tests. Vercel handles compilation at deploy time. Typecheck catches type errors. |
| `developer-docs`                     | build only     | Docusaurus site. Build validates that docs compile. No linter or tests configured. |

### Why only two categories

Adding more categories means more rulesets to maintain and more decisions about which category a repo belongs in. With two people, the overhead isn't worth it. If a repo doesn't clearly fit `standard`, it's `critical`.

### Why only 1 required reviewer

We are a two-person team. Requiring two reviewers would mean every PR needs both people, which defeats the purpose of async work across time zones.

### Why tests are not required

Tests run in CI for visibility but don't block merges. This avoids a chicken-and-egg problem: the test engineer writes tests that expose implementation bugs, but can't merge the tests until the bugs are fixed. Separating the `test` job from the required `ci` job lets both roles work independently.

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

- **`omatrust-widgets`** and **`omatrust-landing`** use pnpm, not npm. Their CI workflows use `pnpm install --frozen-lockfile`.
- **`strict_required_status_checks_policy`** in `critical.json` requires the branch to be up-to-date with `main` before merging. If this causes too much friction, set it to `false`.
- The full repository catalog (what each repo does, deprecated repos) lives in [`omatrust-docs/README.md`](https://github.com/oma3dao/omatrust-docs).
