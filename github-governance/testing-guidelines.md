# Testing Guidelines

Pragmatic cross-repository guidance for what, how, and how much to test. Use each repository's documented test framework, commands, and more specific test requirements.

Examples below use TypeScript and frontend tests for concreteness, but the principles apply to services, libraries, contracts, scripts, and documentation tooling as well.

## Philosophy

- Tests exist to catch regressions and validate behavior. They are not a coverage number.
- Test what the user sees and what the system does — not how it's wired internally.
- One meaningful test that proves a behavior works is worth more than five that assert mock plumbing.
- AI-generated test PRs must meet the same quality bar as hand-written code. Volume alone is not a contribution.

---

## What to Test

### High value — always test these

**User-facing behavior through interactions.** Click submit, fill a form, trigger a state change — assert the outcome the user would observe.

```ts
// Good: tests what happens from the user's perspective
fireEvent.click(screen.getByRole('button', { name: /submit/i }))
await waitFor(() => {
  expect(screen.getByText(/success/i)).toBeInTheDocument()
})
```

**Conditional rendering that gates functionality.** If a prop or state determines whether something appears or is accessible, test both sides.

```ts
// Plan is free → Upgrade button appears
// Plan is paid → Upgrade button does not appear
```

**State transitions.** Loading → loaded, loading → error, dialog open → submit → close.

**API integration (happy path + representative failures).** Verify the unit uses the right endpoint and contract, then test distinct failure behaviors. One representative failure may be enough when all failures share a path; security- or workflow-sensitive failures may need separate coverage.

**Pure function logic.** For utility functions, test inputs and outputs directly — boundary values, invalid inputs, representative cases.

### Low value — skip or minimize these

**Incidental UI copy.** Don't assert precise wording when the wording is not part of the behavior. Prefer role-based queries or a stable semantic match so routine copy edits do not break tests.

```ts
// Bad — breaks when copy changes
expect(screen.getByText('Ownership verification did not succeed yet.')).toBeInTheDocument()

// Better — tests that feedback exists without coupling to exact words
expect(screen.getByRole('alert')).toBeInTheDocument()
// Or with a loose match:
expect(screen.getByText(/verification.*failed/i)).toBeInTheDocument()
```

Exact text is appropriate when the wording is itself a contract: accessibility names, protocol-defined values, compliance language, commands users must copy, or distinct errors that require different user action.

**CSS classes, Tailwind utilities, styling details.** These are visual concerns, not behavioral. If the design system changes, every test breaks for no functional reason.

```ts
// Bad
expect(element).toHaveClass('text-destructive')

// Instead, test the condition that triggers the styling:
// "When quota is exhausted, the count shows zero"
expect(screen.getByText('0')).toBeInTheDocument()
```

**Mock wiring without an observable contract.** Testing only that a mock function was called often proves wiring rather than useful behavior. Prefer asserting on the resulting output or state when possible.

```ts
// Bad — proves nothing about the UI
expect(mockGetControllerConfirmation).toHaveBeenCalledWith('did:web:example.com')

// Better — proves the data reached the screen
expect(screen.getByText('Authorized')).toBeInTheDocument()
```

Interaction assertions are appropriate when the interaction is the contract: API payloads, callbacks, navigation, persisted data, emitted events, authorization checks, and other external side effects.

**Exhaustive permutations of the same shared pattern.** If fallback behavior is centralized in a shared implementation, test it thoroughly there and use representative integration coverage elsewhere. If several components implement the fallback independently, one component's test does not prove that the others work.

**Third-party component internals.** Don't retest that Radix Dialog implements `open={true}`. Do test your integration with it when configuration, accessibility, or application state could be wrong.

---

## How Much to Test

### The rule of inputs

Think in terms of **inputs to the unit under test**:

| Input type | Example | Test it? |
|---|---|---|
| Props/args that change behavior | `session={null}` vs `session={...}` | Yes |
| User interactions | click, type, submit | Yes |
| API response (happy path) | fetch returns data | Yes |
| API response (failure) | fetch throws | Yes, once per distinct behavior |
| Many error codes with equivalent handling | 10 BackendApiError codes producing the same result | Test representative equivalence classes |
| Exact rendered strings | "Ownership verified via DNS TXT" | Only when the wording is a contract |
| Internal state shape | `useState` value | No — test what the user sees |
| Timer/debounce behavior | 1500ms delay fires | Maybe, if it's user-facing |

### Coverage targets

Use the coverage tool already configured by the repository. For repositories using Vitest, `@vitest/coverage-v8` measures line, branch, function, and statement coverage; Solidity and other repositories may use different tools.

The following Vitest thresholds are a possible starting point, not an organization-wide mandate. Set thresholds per repository based on its baseline, risk, and ability to enforce them without encouraging low-value tests:

```ts
coverage: {
  thresholds: {
    lines: 80,
    branches: 70,
    functions: 80,
  },
}
```

When configured, thresholds are floors, not goals. Going from 80% to 95% often means writing low-value tests for obscure branches. Focus effort on testing critical paths well rather than chasing a number.

**What coverage actually measures:**
- Line coverage: "Was this line executed during any test?" — does not prove the line works correctly.
- Branch coverage: "For each conditional, were both true/false paths taken?" — more useful than line coverage.
- Function coverage: "Was this function ever called?" — lowest bar, useful for finding dead code.

A component can have 100% line coverage and still be broken if the tests only assert that it doesn't crash. Coverage answers "was this code reached?" — not "does this code work?"

---

## Test Structure

### One coherent behavior per test

Each test should verify one coherent behavior or scenario. Multiple assertions are fine when they jointly prove the same outcome. Split a test when it covers independent behaviors, has unrelated failure reasons, or requires substantially different setup.

```ts
// Too broad: three independently failing behaviors
it('loads data, shows the list, and handles pagination')

// Good
it('shows a loading spinner before data arrives')
it('renders all items after data loads')
it('loads the next page when the user scrolls to the bottom')
```

### Use describe blocks for shared context

Group tests by the condition they test, not by the function they call.

```ts
describe('AccountPage', () => {
  describe('when unauthenticated', () => { ... })
  describe('when authenticated with a free plan', () => { ... })
  describe('when editing the display name', () => { ... })
})
```

### Keep setup close to the test

Prefer per-test setup over large `beforeEach` blocks. When `beforeEach` grows past 20 lines of mock configuration, it becomes hard to see what each test actually depends on. Use helper functions instead:

```ts
function renderWithSession(session: Session) {
  mockUseBackendSession.mockReturnValue({ session })
  return render(<AccountPage />)
}
```

---

## AI-Generated Tests

AI tools (Cursor, Copilot, etc.) can generate test suites quickly. They also tend to:

1. **Over-test exact strings** — because they see the string in the source and assert it verbatim.
2. **Duplicate the same pattern 10x** — testing every error code individually instead of parameterizing.
3. **Test mock wiring** — asserting that mocks were called rather than that UI changed.
4. **Create massive files** — 2,000+ line test files that nobody will review properly.

**Before merging an AI-generated test PR:**

- Run the repository's documented test command and confirm the relevant suite passes
- Spot-check a representative sample by temporarily breaking the implementation and confirming the test fails; restore the implementation afterward and verify no accidental diff remains
- Look for tests that would pass even if the component rendered nothing — these test mock setup, not behavior
- Treat a test file over 500 lines as a review signal, not an automatic failure; split or trim it when that improves comprehension
- Remove repetitive fallback tests when they cover the same centralized implementation rather than distinct behavior

---

## CI Integration

Where configured, tests run in a separate `test` job in `ci.yml`. The test job is **not** a required status check for merge (see [governance README](README.md) for rationale). Required-check configuration and review judgment are separate:

- A failure newly caused by a production-code change is blocking evidence of a regression
- A documented pre-existing failure does not become the current PR's responsibility
- A test-only PR may intentionally expose an existing implementation bug; document it and track the implementation fix separately
- Coverage thresholds apply wherever the repository's coverage command runs; enforcement requires that command and its thresholds to be configured in CI

---

## Per-Repo Test Specs

Some repositories have detailed test specifications (e.g., `oma3-ops/test/README.md`). These are authoritative for their repo. This document provides the cross-repo defaults and philosophy. When in conflict, the repo-specific spec wins for that repo.
