# Branching & Merge Workflow

## Why This Matters

When a PR merges into `main`, GitHub creates a squash commit that only exists on `main` (our rulesets enforce squash-only merges with linear history). Because this squash commit has no parent relationship to `staging`, the two branches diverge if nobody merges `main` back into `staging` afterward — and every future PR from `staging → main` will be blocked or require manual conflict resolution.

**The sync step after every merge into main is what keeps this workflow working.** Skip it once and everyone downstream is building on diverged state.

---

## Starting New Work

```bash
git fetch origin
git checkout -b feat/your-branch-name origin/staging --no-track
```

Always branch from `origin/staging` — never from a stale local branch, never from `main`.

**Optional safety check** — verify staging isn't behind main before you start:

```bash
git log --oneline origin/staging..origin/main
```

If this returns nothing you can proceed.  If this shows any commits, staging is behind main and someone forgot to sync. Don't start work until it's resolved — either do the sync yourself or flag it to the team.

---

## Opening a PR

- Target: `staging`
- All feature work, bug fixes, and improvements go into `staging` first.
- Prefer that the reviewer approves and merges. Emergency self-merge is allowed for maintainers when the other reviewer is unavailable — follow the Self-Merge section in the PR template and the policy in [`README.md`](README.md).

**Multiple PRs targeting staging:** Just merge them one at a time. After PR #1 merges, GitHub may show PR #2 as "out of date" — click "Update branch" in the GitHub UI or have the author rebase. No manual sync step is needed between staging PRs. The sync step only applies after merges into `main`.

---

## Promoting Staging to Production

1. Open a PR: `staging → main`
2. Reviewer approves and merges it.
3. **Confirm that `main` is synced back into `staging`.** Repositories with `sync-main-to-staging.yml` do this automatically. If the workflow is not installed or fails, the person who merged runs the manual fallback immediately:

```bash
git fetch origin
git checkout staging
git pull origin staging
git merge origin/main --no-edit
git push origin staging
```

This gives `staging` the squash commit that GitHub created on `main`. Until this is done, `origin/staging` is diverged and everyone branching off it will have problems.

> **Note:** The canonical workflow lives in this folder — copy it into `.github/workflows/` for repos that use `staging`.

> **CI caveat:** Pushes made with `GITHUB_TOKEN` (including the auto-sync Action) don't trigger downstream workflows. CI won't run on `staging` after an auto-sync. This is fine since staging isn't gated by status checks — just don't assume CI ran there.

---

## Don't

- **Don't branch off `main`** — ever, for any reason.
- **Don't skip the sync step** after merging into `main`. This is the single most common cause of divergence.
- **Don't push feature changes directly to `main` or `staging`** — all changes go through PRs. The documented `main` → `staging` sync, performed by the workflow or its manual fallback, is the only direct-push exception.
- **Don't branch off a local `staging` you haven't fetched** — always `git fetch origin` first.
- **Don't self-merge by default** — prefer reviewer merge. Use emergency self-merge only when the other reviewer is unavailable and the change fits the repo's allowed list (see PR template / [`README.md`](README.md)).

---

## Hotfixes

Hotfixes follow the same staging path as normal work. Only `staging` and `hotfix/*` branches can PR into `main` (enforced by GitHub Action in repos with branch enforcement).

1. `git fetch origin && git checkout -b hotfix/description origin/staging --no-track`
2. PR into `staging`, get review, merge.
3. PR `staging → main`, get review, merge.
4. Sync step runs (manually or via Action).

If a reviewer is unavailable and the fix cannot wait, a maintainer may self-merge either PR under the emergency self-merge policy — fill out the Self-Merge section, tag a post-merge reviewer, and apply the usual labels. Red-zone changes still require a second pair of eyes (or escalation).

The sync step still applies — a hotfix merged into `main` creates the same divergence risk as any other merge.
