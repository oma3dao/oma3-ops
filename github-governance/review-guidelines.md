# AI-Assisted Code Review Guidelines

Guidance for humans using AI tools to evaluate PRs and triage issues across OMA3 repositories. Automated reviewers may also adopt these instructions explicitly.

Human reviewers have judgment and context — these rules are not for them. This document exists because AI reviewers (Cursor, Copilot, automated bots) tend to be pedantic, treating every observation as a blocker regardless of its actual impact. These guidelines correct that behavior.

---

## Core Rule

**Make a proportional decision.** Evaluate whether the PR delivers on its stated goal without introducing harm. Then give a clear recommended verdict — approve, request changes, or comment — with brief reasoning.

Don't block PRs over minor issues. Don't rubber-stamp PRs that have real problems. The job is to distinguish between the two.

A PR should be approved when the available evidence shows that it accomplishes its stated goal without introducing a blocking issue. Non-blocking observations should not be presented as reasons to delay the merge.

---

## When to Block (Request Changes)

Block a PR only when merging it would cause concrete harm. Examples include:

- **Correctness bug** — the code doesn't do what the PR claims, or it introduces a regression.
- **Security issue** — secrets exposed, auth bypassed, injection vulnerability, unsafe data handling.
- **Breaking change** — API contract broken, migration missing, downstream consumers will fail.
- **Data loss risk** — destructive operation without safeguard, irreversible state change.
- **Reliability or performance regression** — the change can cause an outage, resource exhaustion, or material degradation under realistic use.
- **Required validation broken** — required checks fail, or the PR causes a previously passing relevant test to fail.
- **Governance violation** — the change bypasses a repository-specific safety rule or required approval path.

A blocking finding must identify the changed code, a realistic triggering condition, and the resulting impact. Lack of confidence by itself is not a finding. If a safety-critical claim cannot be verified because necessary evidence is missing, state exactly what evidence is needed and why.

## What Is Never Blocking

These are valid observations but must not prevent a merge. Track them separately only when they are material enough to prioritize:

- Style preferences or naming nits
- Suggestions to refactor code that the PR didn't introduce
- Missing tests for edge cases that aren't on the critical path
- "While you're here, you could also..." scope expansion
- Minor readability improvements
- Incidental copy or wording suggestions (unless the text is a functional, accessibility, protocol, or compliance requirement)
- Inconsistency with a pattern used elsewhere in the codebase (unless it causes a bug)

---

## Track Material Follow-Ups Without Blocking

When you notice a material improvement that isn't blocking, first check whether it is already tracked. If it is new and you have permission, create a follow-up issue rather than requesting changes on the current PR. A follow-up issue must:

1. Describe the specific improvement
2. Reference the file and line (or PR number where you noticed it)
3. Stand on its own — someone should be able to fix it without context from the original PR

Do not create issues for every nit or speculative concern. If you cannot create an issue, include the item in a clearly labeled **Non-blocking follow-ups** section so a human can decide whether to track it.

---

## Closing Issues

### Match the PR to the issue's stated criteria

An issue defines a problem. A PR closes that issue when it solves the stated problem and the changed behavior does not introduce a blocking issue. The PR does not need to:

- Fix tangential things the reviewer notices in adjacent code
- Achieve perfect coverage of the new code
- Refactor surrounding code
- Anticipate future requirements not mentioned in the issue

If the issue says "add pagination to /users" and the PR adds working pagination, the issue is resolved.

### Don't block a PR because it doesn't fix something it never claimed to fix

If a PR closes issue #42 but you notice an unrelated problem in the same file, file a new issue. Don't hold the PR open until the unrelated problem is also fixed.

### Don't reopen closed issues for minor follow-ups

If an issue was closed by a merged PR and a minor gap is noticed later, open a new issue. Reopening conflates "this doesn't work" with "this could be improved."

---

## Proportionality

Match review depth to the nature and risk of the change. Size is a useful signal, but it does not determine the verdict: a five-line authorization change can be riskier than a thousand-line fixture update.

| Change profile | Review emphasis |
|---|---|
| Copy, comments, formatting | Confirm the diff is limited to non-functional changes |
| Small localized fix | Verify the reported failure, the fix, and regression risk |
| Feature or broad refactor | Trace affected flows, contracts, failure handling, and tests |
| Generated or repetitive changes | Sample representative sections and validate generator assumptions |
| Security, auth, data, infrastructure, or onchain | Review thoroughly and require evidence for safety-critical assumptions |
| Large or difficult-to-review diff | Identify high-risk areas first; request decomposition only when the change cannot be reviewed reliably |

Review depth does not determine the verdict. Approve only after finding no blocking issue. Request changes only for a specific, evidence-backed risk or for evidence necessary to validate a safety-critical claim.

A small bug fix does not warrant 20 comments about the surrounding file's structure. A large test-only PR does not need every assertion audited, but representative tests should be checked to confirm they exercise real behavior and fail when that behavior is broken.

---

## Scope

A PR's intended outcome is defined by its title, description, and linked issue. Every behavior added or changed by the diff is in review scope, including changes not mentioned in the description.

Do not expand the PR's success criteria to include unrelated pre-existing problems or adjacent improvements. Track those separately. However, an undocumented change introduced by the PR is not protected from review merely because the author did not mention it.

---

## Tone

- Be direct. "This will crash when `items` is empty" — not "Have you considered what might happen if..."
- Base claims on the diff, repository behavior, and available checks. State uncertainty instead of inventing facts.
- Explain the triggering condition and impact. Offer a practical solution when one is clear.
- Don't pile on. One comment per issue is enough.
- Distinguish clearly between blocking concerns and optional follow-ups. Track material follow-ups without turning minor observations into issue noise.
