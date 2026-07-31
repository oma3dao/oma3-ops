## Risk Level

<!-- Choose one: low / medium / high / red-zone -->

**Risk:** low

## Summary

<!-- What does this PR do? Keep it brief. -->

## Testing Performed

<!-- What did you test? Manual steps, automated tests, etc. -->

## CI Status

<!-- Confirm CI is green before merging. -->

- [ ] All required checks pass

## Self-Merge

<!-- If you are merging this without a second reviewer, fill out this section. Otherwise delete it. -->

- [ ] This is a self-merge
- **Reason for emergency self-merge:**
  <!-- e.g., failed build blocking work, docs correction, low-risk typo -->
- **Post-merge reviewer:** @<!-- tag someone to review after merge -->

---

### Self-Merge Policy Reference

<!--
  SETUP (per repository): Customize the lists below before treating this
  template as final. Keep items that apply to this repo, delete the rest,
  and add repo-specific items as needed. The shared skeleton above stays
  the same across OMA3 repositories; only these policy lists should differ.
-->

**Allowed self-merge examples** (trim / extend for this repo):
- Failed build blocking work
- Low-risk typo / config fix
- Docs correction
- Dependency / security patch
- Test-only or fixture-only changes
- CI / workflow fixes that do not broaden permissions
- Production outage fix *(hosted / deployed services)*
- Broken deploy pipeline *(hosted / deployed services)*
- Launch-blocking bug *(product launch surfaces)*

**Never self-merge (red-zone)** (trim / extend for this repo):

*Common*
- Production secrets
- GitHub Actions permission changes
- Deployment credentials

*Contracts / onchain*
- Smart contract logic
- Contract deployment
- Irreversible onchain changes

*Trust / identity*
- Auth / signature verification
- Permission model changes
- Registry identity / trust logic
- Attestation validity logic

*Data / backend*
- Database migrations

*Protocol / MPAS*
- Policy engine or approval-threshold changes
- Self-approval prevention logic
- Action Package / envelope verification
- Credential Adapter dispatch behavior
- Normative protocol or profile spec changes

*Application plugins / bridges*
- Plugin operation classification / impact changes
- Governed vs pass-through tool surface changes
- `plugin.json`, `registry-entry.json`, or `artifactDid` changes
- Bridge dispatch or approval-gating behavior

---

### Labels

Apply any that fit (add repo-specific labels as needed):
`self-merged` · `emergency` · `post-merge-review-needed` · `launch-blocker` · `low-risk` · `security` · `red-zone` · `contract-change` · `plugin-change` · `bridge-change`
