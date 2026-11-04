# Branching & Merge Workflow

Contributors work from a personal fork of the `oma3dao` repository and open pull requests from that fork. Some repositories also use a `staging` branch; others merge directly into `main`. Use the integration branch that exists in the repo you are working on.

## Why This Matters

This section applies to repositories that have a `staging` branch. Repos without `staging` skip the sync and promotion steps.

When a PR merges into `main`, GitHub creates a squash commit that only exists on `main` (our rulesets enforce squash-only merges with linear history). Because this squash commit has no parent relationship to `staging`, the two branches diverge if nobody merges `main` back into `staging` afterward — and every future PR from `staging → main` will be blocked or require manual conflict resolution.

**The sync step after every merge into main is what keeps this workflow working.** Skip it once and everyone downstream is building on diverged state.

---

## Starting New Work

Your fork is `origin`. The canonical OMA3 repo is `upstream`.

If you have not added the upstream remote yet:

```bash
git remote add upstream git@github.com:oma3dao/<repo>.git
```

Confirm remotes with `git remote -v`. You should see `origin` pointing at your fork and `upstream` pointing at `oma3dao/<repo>`.

Always create the branch from `upstream` — never from a stale local branch, and never from your fork's copy of `main` or `staging`. Syncing your fork's `main` (below) keeps the GitHub UI and local `main` current; it is not a substitute for branching off `upstream`.

**Repos with `staging`:**

```bash
git fetch upstream
git checkout -b feat/your-branch-name upstream/staging --no-track
```

**Optional safety check** — verify staging isn't behind main before you start:

```bash
git log --oneline upstream/staging..upstream/main
```

If this returns nothing you can proceed. If this shows any commits, staging is behind main and someone forgot to sync. Don't start work until it's resolved — either do the sync yourself or flag it to the team.

**Repos without `staging`:**

```bash
git fetch upstream
git checkout -b feat/your-branch-name upstream/main --no-track
```

Push the branch to your fork:

```bash
git push -u origin feat/your-branch-name
```

### Syncing your fork's `main`

Your fork's `main` falls behind as work merges into `oma3dao`. Sync it so `origin/main` matches `upstream/main`. This is useful even in repos with `staging`; you still do not need to keep a fork copy of `staging` current.

```bash
git fetch upstream
git checkout main
git merge --ff-only upstream/main
git push origin main
```

If `--ff-only` fails, your fork's `main` has diverged. Reset it to match upstream — do not merge extra commits in, and do not open a PR to "update" the fork:

```bash
git checkout main
git reset --hard upstream/main
git push --force-with-lease origin main
```

GitHub's **Sync fork** button on your fork's page does the same thing.

---

## Opening a PR

- Open the PR from your fork against the `oma3dao` repository.
- Target: `staging` if the repo has a staging branch; `main` otherwise.
- In repos with `staging`, all feature work, bug fixes, and improvements go into `staging` first.
- Prefer that the reviewer approves and merges. Emergency self-merge is allowed for maintainers when the other reviewer is unavailable — follow the Self-Merge section in the PR template and the policy in [`README.md`](README.md).

**Multiple PRs targeting the same integration branch:** Just merge them one at a time. After PR #1 merges, GitHub may show PR #2 as "out of date" — click "Update branch" in the GitHub UI or rebase onto the latest `upstream` integration branch (`staging` or `main`). No manual sync step is needed between these PRs. The sync step only applies after merges into `main` in repos that have `staging`.

---

## Promoting Staging to Production

Applies only to repositories that have a `staging` branch. The commands below use `upstream` (the canonical `oma3dao` remote) and require write access there.

1. Open a PR: `staging → main`
2. Reviewer approves and merges it.
3. **Confirm that `main` is synced back into `staging`.** Repositories with `sync-main-to-staging.yml` do this automatically. If the workflow is not installed or fails, the person who merged runs the manual fallback immediately:

```bash
git fetch upstream
git checkout staging
git pull upstream staging
git merge upstream/main --no-edit
git push upstream staging
```

This gives `staging` the squash commit that GitHub created on `main`. Until this is done, `upstream/staging` is diverged and everyone branching off it will have problems.

> **Note:** The canonical workflow lives in this folder — copy it into `.github/workflows/` for repos that use `staging`.

> **CI caveat:** Pushes made with `GITHUB_TOKEN` (including the auto-sync Action) don't trigger downstream workflows. CI won't run on `staging` after an auto-sync. This is fine since staging isn't gated by status checks — just don't assume CI ran there.

---

## Don't

- **Don't branch off `main` in a repo that has `staging`** — ever, for any reason. In repos without `staging`, branch from `upstream/main`.
- **Don't skip the sync step** after merging into `main` in a repo that has `staging`. This is the single most common cause of divergence.
- **Don't push feature changes directly to `main` or `staging`** on the canonical repo — all changes go through PRs from your fork. The documented `main` → `staging` sync, performed by the workflow or its manual fallback, is the only direct-push exception.
- **Don't branch off a local `main` or `staging` you haven't fetched** — always `git fetch upstream` first, then create the branch from `upstream`.
- **Don't self-merge by default** — prefer reviewer merge. Use emergency self-merge only when the other reviewer is unavailable and the change fits the repo's allowed list (see PR template / [`README.md`](README.md)).

---

## Hotfixes

Hotfixes follow the same path as normal work for that repository.

**Repos with `staging`:** Only `staging` and `hotfix/*` branches can PR into `main` (enforced by GitHub Action in repos with branch enforcement).

1. `git fetch upstream && git checkout -b hotfix/description upstream/staging --no-track`
2. Push to your fork, PR into `staging`, get review, merge.
3. PR `staging → main`, get review, merge.
4. Sync step runs (manually or via Action).

**Repos without `staging`:**

1. `git fetch upstream && git checkout -b hotfix/description upstream/main --no-track`
2. Push to your fork, PR into `main`, get review, merge.

If a reviewer is unavailable and the fix cannot wait, a maintainer may self-merge either PR under the emergency self-merge policy — fill out the Self-Merge section, tag a post-merge reviewer, and apply the usual labels. Red-zone changes still require a second pair of eyes (or escalation).

In repos with `staging`, the sync step still applies — a hotfix merged into `main` creates the same divergence risk as any other merge.
