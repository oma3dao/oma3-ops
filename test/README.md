# oma3-ops Test Suite

## Running Tests

<!-- Test engineer: fill this section out after implementation -->

_TODO: Document how to install dependencies, run unit tests, run integration tests, and any environment variables required._

---

## Test Implementation Spec

Tests are written against the README spec (`oma3-ops/README.md`), not the implementation code. If the spec defines a behavior, there must be a test for it. If the implementation does something the spec doesn't mention, the test should not depend on that behavior.

### Framework

Use [Vitest](https://vitest.dev/) as the test runner. It is TypeScript-native, ESM-compatible (the project uses `"type": "module"`), and requires minimal configuration.

Add `vitest` as a dev dependency. Create a `vitest.config.ts` at the `oma3-ops/` root. Add a `test` script to `package.json` (e.g. `"test": "vitest --run"`).

### Directory Structure

```
oma3-ops/
  test/
    README.md          (this file)
    unit/
      csv-utils.test.ts
      date-utils.test.ts
      hash-utils.test.ts
      safe-builder.test.ts
      summary-builder.test.ts
      grouping.test.ts
      validation.test.ts
      cli-utils.test.ts
    integration/
      lock-status.test.ts
      lock-verify-json.test.ts
      end-to-end.test.ts
    fixtures/
      valid-3-wallets.csv
      valid-with-amount-wei.csv
      missing-header.csv
      duplicate-address.csv
      negative-amount.csv
      invalid-offset.csv
      blank-rows.csv
      bom-header.csv
      ...
```

### Test Tiers

#### Tier 1 — Unit Tests (no network, no RPC, fast)

These must run without any environment variables or network access. They test pure functions by importing directly from `../src/`.

#### Tier 2 — Integration Tests (require Sepolia RPC, slower)

These require a live RPC endpoint. Gate them behind an environment variable (e.g. `OMA3_OPS_RPC_URL_SEPOLIA`). If the variable is not set, these tests should be skipped, not failed. Use `describe.skipIf(!process.env.OMA3_OPS_RPC_URL_SEPOLIA)` or equivalent.

---

### Unit Test Specifications

#### `csv-utils.test.ts`

Source: `src/csv-utils.ts`

| Test | Input | Expected |
|------|-------|----------|
| Parses valid CSV with header row | 3-row CSV with `address,amount,cliffOffsetMonths,lockEndOffsetMonths` | Returns 3 `CsvRow` objects with correct `values` and `lineNumber` |
| Parses by header name, not position | CSV with columns in non-standard order | Values correctly mapped to headers regardless of column position |
| Handles BOM in first header | CSV starting with `\uFEFF` | BOM stripped from first header name |
| Handles quoted fields with commas | `"value,with,commas"` in a cell | Parsed as single value |
| Handles escaped quotes | `"value""with""quotes"` in a cell | Parsed as `value"with"quotes` |
| Skips blank rows | CSV with empty lines between data rows | Only non-empty rows returned |
| Rejects unmatched quote | CSV with opening `"` but no closing | Throws error |
| Rejects empty CSV | Empty file | Throws `CSV is empty` |
| `requireHeaders` passes with all required headers | Headers `['address','amount']`, required `['address','amount']` | No error |
| `requireHeaders` fails on missing header | Headers `['address']`, required `['address','amount']` | Throws error listing `amount` as missing |
| Extra columns are ignored | CSV with `address,amount,cliffOffsetMonths,lockEndOffsetMonths,notes` | `notes` column parsed but not rejected |


#### `date-utils.test.ts`

Source: `src/date-utils.ts`

| Test | Input | Expected |
|------|-------|----------|
| Parses valid Z-suffix datetime | `2025-01-31T00:00:00Z` | Valid `Date` object, UTC |
| Rejects `+00:00` offset | `2025-01-31T00:00:00+00:00` | Throws error |
| Rejects `+05:30` offset | `2025-01-31T00:00:00+05:30` | Throws error |
| Rejects no timezone | `2025-01-31T00:00:00` | Throws error |
| Rejects invalid date | `not-a-date` | Throws error |
| Month addition: normal case | `2025-01-15T00:00:00Z` + 1 month | `2025-02-15T00:00:00Z` |
| Month addition: clamp to month end (spec vector) | `2025-01-31T00:00:00Z` + 1 month | `2025-02-28T00:00:00Z` |
| Month addition: leap year | `2024-01-31T00:00:00Z` + 1 month | `2024-02-29T00:00:00Z` |
| Month addition: preserves time-of-day | `2025-01-15T14:30:00Z` + 1 month | `2025-02-15T14:30:00Z` |
| Month addition: zero months | `2025-06-15T00:00:00Z` + 0 months | `2025-06-15T00:00:00Z` |
| Month addition: cross year boundary | `2025-11-30T00:00:00Z` + 3 months | `2026-02-28T00:00:00Z` |
| Month addition: 12 months | `2025-03-31T00:00:00Z` + 12 months | `2026-03-31T00:00:00Z` |
| Month addition: large offset (48 months) | `2025-01-31T00:00:00Z` + 48 months | `2029-01-31T00:00:00Z` |
| `unixSeconds` returns integer seconds | Any `Date` | `Math.floor(ms / 1000)` |
| `formatAnchorUtc` strips `.000Z` | Date with zero milliseconds | Ends with `Z`, not `.000Z` |

#### `hash-utils.test.ts`

Source: `src/hash-utils.ts`

| Test | Input | Expected |
|------|-------|----------|
| `normalizeHexInput`: strips `0x` prefix | `0xabcdef` | `abcdef` |
| `normalizeHexInput`: strips `0X` prefix | `0Xabcdef` | `abcdef` |
| `normalizeHexInput`: no prefix | `abcdef` | `abcdef` |
| `normalizeHexInput`: lowercases | `0xABCDEF` | `abcdef` |
| `normalizeHexInput`: rejects empty | `0x` | Throws error |
| `normalizeHexInput`: rejects odd length | `0xabc` | Throws error |
| `normalizeHexInput`: rejects non-hex chars | `0xgggg` | Throws error |
| `keccakHexBytes`: spec vector 1 | `0x1234` | `0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432` |
| `keccakHexBytes`: spec vector 2 | `0xabcdef` | `0x800d501693feda2226878e1ec7869eef8919dbc5bd10c2bcd031b94d73492860` |
| `keccakHexBytes`: spec vector 3 | `0x6a627842` | `0x654347b7dc147d586800b07bed0ef8d31b06de26b3210a3e014f9445ad4bf8da` |
| `keccakHexBytes`: output is lowercase with 0x prefix | Any valid input | Matches `/^0x[0-9a-f]{64}$/` |
| `batchFingerprint`: single tx | One hash | `keccak256` of that 32-byte digest |
| `batchFingerprint`: two txs | Two hashes | `keccak256(concat(digest1, digest2))` |
| `batchFingerprint`: order matters | `[hashA, hashB]` vs `[hashB, hashA]` | Different results |
| `batchFingerprint`: rejects empty array | `[]` | Throws error |
| `batchFingerprint`: rejects non-32-byte hash | `0xabcd` | Throws error |
| `shortFingerprint`: extracts first 12 hex chars | `0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432` | `0x56570de287d7` |


#### `safe-builder.test.ts`

Source: `src/safe-builder.ts`

| Test | Input | Expected |
|------|-------|----------|
| `addLocks` encoding: correct function selector | 1 wallet, 1 amount, cliff, lockEnd | `data` starts with `addLocks` selector (`0x2b6e1925`) |
| `addLocks` encoding: wallets in calldata | 2 wallets | Both addresses appear in ABI-decoded result |
| `addLocks` encoding: amounts in calldata | 2 amounts | Both amounts appear in ABI-decoded result |
| `addLocks` encoding: cliff and lockEnd in calldata | cliff=1767225600, lockEnd=1798761600 | Values appear in ABI-decoded result |
| `updateLocks` encoding: correct function selector | 1 wallet, cliff, lockEnd | `data` starts with `updateLocks` selector |
| `updateLocks` encoding: no amounts in calldata | 2 wallets | ABI-decoded result has no amounts parameter |
| `updateLocks` encoding: wallets in calldata | 2 wallets | Both addresses appear in ABI-decoded result |
| `contractInputsValues`: wallets are JSON stringified array | 2 wallets | `wallets_` is `'["0x...","0x..."]'` |
| `contractInputsValues`: amounts are JSON stringified string array | 2 amounts | `amounts_` is `'["1000...","2000..."]'` (string representations) |
| `contractMethod.inputs` matches spec schema | `addLocks` | Inputs match the exact schema from README JSON example |
| `buildSafeBatchFile`: version is `"1.0"` | Any | `version === "1.0"` |
| `buildSafeBatchFile`: chainId is string | chainId `11155111n` | `chainId === "11155111"` |
| `buildSafeBatchFile`: createdAt is `0` | Any | `createdAt === 0` |
| `buildSafeBatchFile`: meta.name format | operation `addLocks`, short fingerprint `0x9f2c1e4b7a21` | `name === "OMA3 lock-add-locks 9f2c1e4b7a21"` |
| `buildSafeBatchFile`: meta.name for updateLocks | operation `updateLocks` | Name starts with `OMA3 lock-update-locks` |
| `buildSafeBatchFile`: txBuilderVersion | Any | `txBuilderVersion === "1.x"` |
| `buildSafeBatchFile`: createdFromSafeAddress empty | Any | `createdFromSafeAddress === ""` |
| `buildSafeBatchFile`: createdFromOwnerAddress empty | Any | `createdFromOwnerAddress === ""` |
| Transaction `to` is lock contract address | Any | `to` matches provided lock contract |
| Transaction `value` is `"0"` | Any | `value === "0"` |

#### `summary-builder.test.ts`

Source: `src/summary-builder.ts`

| Test | Input | Expected |
|------|-------|----------|
| Output starts with `OMA3 OPS TRANSACTION SUMMARY` | Any valid params | First line matches |
| All required header fields present in order | Any valid params | Lines for Transaction ID, Operation, Network Name, Chain ID, Anchor Date UTC, OMALock Contract, OMA Token Contract, Input CSV, Rows Parsed, Validation, Transactions, Max Wallets Per Tx, Total Wallets, Total OMA (human), Total OMA (wei), JSON SHA256, Batch Fingerprint — all present in this order |
| `Validation: PASS` always present | Any valid params | Line `Validation: PASS` exists |
| TRANSACTIONS section present | 2 transactions | `TRANSACTIONS` header followed by `- tx 1:` and `- tx 2:` lines |
| Transaction line includes all required fields | 1 transaction | Line contains `method=`, `cliffUnix=`, `cliffUtc=`, `lockEndUnix=`, `lockEndUtc=`, `wallets=`, `totalOMA=`, `totalWei=`, `firstWallet=`, `lastWallet=`, `calldataHash=` |
| VALIDATION section present | Any | Contains `amountWei cross-check:`, `duplicate addresses:`, `offset resolution:`, `timestamp format:` |
| `amountWei cross-check: N/A` when no amountWei column | `amountWeiCheck: 'N/A'` | Line reads `- amountWei cross-check: N/A` |
| `amountWei cross-check: pass` when amountWei present | `amountWeiCheck: 'pass'` | Line reads `- amountWei cross-check: pass` |
| WARNINGS section present | Any | `WARNINGS` header exists after `VALIDATION` |
| Warning for wallet exceeding 1% of supply | 1 wallet with 4,000,000 OMA (default `--warn-wallet-pct 1`) | WARNINGS section contains wallet address and `1.20% of total supply` |
| No warning for wallet under 1% of supply | 1 wallet with 1,000,000 OMA | WARNINGS section shows `None` |
| Multiple warnings for multiple large wallets | 2 wallets each with 5,000,000 OMA | WARNINGS section lists both wallets |
| `--warn-wallet-pct` override raises threshold | `--warn-wallet-pct 5`, wallet with 10,000,000 OMA (3.00% of supply) | WARNINGS section does not contain wallet address (under 5% threshold) |
| Threshold override warning: `--max-total-pct` non-default | `--max-total-pct 50` (default is 10) | WARNINGS section contains `WARNING: --max-total-pct set to 50 (default: 10). Verify this override is authorized.` |
| Threshold override warning: `--warn-wallet-pct` non-default | `--warn-wallet-pct 5` (default is 1) | WARNINGS section contains `WARNING: --warn-wallet-pct set to 5 (default: 1). Verify this override is authorized.` |
| Threshold override warning: both overridden | `--max-total-pct 50`, `--warn-wallet-pct 5` | WARNINGS section contains both WARNING lines |
| No threshold override warning when defaults used | Default `--max-total-pct 10`, `--warn-wallet-pct 1` | WARNINGS section does not contain any `WARNING: --max-total-pct` or `WARNING: --warn-wallet-pct` lines |
| Threshold override warnings appear before per-wallet warnings | `--warn-wallet-pct 2`, wallet exceeding threshold | Override WARNING line appears before per-wallet allocation line |
| Per-wallet warning includes totalOMA line format | Wallet with 5,000,000 OMA (1.50% of supply) | Line format: `- 0x5E77...1615: allocated 5,000,000.0 OMA (1.50% of total supply)` |
| WARNINGS section shows `None` when no overrides and no per-wallet warnings | Default thresholds, all wallets under 1% | WARNINGS section contains only `- None` |
| Transaction line includes `totalOMA=` field | 1 transaction with known total | Line contains `totalOMA=<human-readable amount>` |
| Batch Fingerprint includes short form | Any | Line matches `Batch Fingerprint: 0x... (short 0x............)` |
| Total OMA (human) uses correct decimals | totalWei `1000000000000000000n`, decimals 18 | `Total OMA (human): 1.0` |


#### `grouping.test.ts`

Tests deterministic grouping and chunking logic. This requires calling `parseRows` and `planChunks` from `run-lock-command.ts`. If these are not exported, the test engineer should refactor them into a shared module or test via end-to-end CSV-to-output.

| Test | Input | Expected |
|------|-------|----------|
| Rows grouped by `(cliffDate, lockEndDate)` | 4 rows: 2 with offset (6,12), 2 with offset (6,24) | 2 groups |
| Groups sorted by cliffDate asc, then lockEndDate asc | Groups with cliff 2026, 2025 | 2025 group first |
| Rows within group sorted by lowercase address asc | 3 rows: `0xCCC`, `0xAAA`, `0xBBB` | Order: `0xaaa`, `0xbbb`, `0xccc` |
| Chunking at max-wallets-per-tx boundary | 5 rows, max 2 per tx | 3 chunks (2, 2, 1) |
| Chunking with exact boundary | 4 rows, max 2 per tx | 2 chunks (2, 2) |
| Single row produces single chunk | 1 row | 1 chunk with 1 wallet |
| All rows same group | 3 rows, same offsets | 1 group, 1 chunk (if <= max) |
| Determinism: identical input produces identical output | Run twice with same CSV + anchor | Byte-identical `safe-tx.json` and `safe-tx.summary.txt` |

#### `validation.test.ts`

Each test provides a CSV (via fixture file or inline string) that triggers exactly one validation failure. The test asserts that the script throws an error and does not produce output files.

For tests that require chain context (decimals, addresses), mock the chain context with `decimals: 18` and the Sepolia contract addresses.

| Test | CSV / Input Condition | Expected Error |
|------|----------------------|----------------|
| Missing `address` header | CSV with `wallet,amount,...` | Missing required CSV header |
| Missing `amount` header | CSV with `address,cliffOffsetMonths,...` | Missing required CSV header |
| Missing `cliffOffsetMonths` header | CSV without it | Missing required CSV header |
| Missing `lockEndOffsetMonths` header | CSV without it | Missing required CSV header |
| Blank address value | Row with empty `address` | `address is required` |
| Blank amount value | Row with empty `amount` | `amount is required` |
| Invalid EVM address | `address=notanaddress` | `invalid EVM address` |
| Duplicate address | Two rows with same address | `duplicate address` |
| Duplicate address (case-insensitive) | `0xAAA...` and `0xaaa...` (same address, different case) | `duplicate address` |
| Amount zero | `amount=0` | `amount must be positive` |
| Amount negative | `amount=-100` | Error (invalid or non-positive) |
| Amount exceeds uint96 | `amount=79228162514264337593543950336` (2^96) | `exceeds uint96 max` |
| `amountWei` mismatch | `amount=1`, `amountWei=999` | `amountWei mismatch` |
| `amountWei` zero | `amountWei=0` | `amountWei must be positive` |
| `amountWei` non-integer | `amountWei=1.5` | Error |
| `cliffOffsetMonths` non-integer | `cliffOffsetMonths=1.5` | `must be an integer` |
| `cliffOffsetMonths` negative | `cliffOffsetMonths=-1` | `must be >= 0` |
| `lockEndOffsetMonths` <= `cliffOffsetMonths` | cliff=12, lockEnd=12 | `lockEndOffsetMonths must be > cliffOffsetMonths` |
| `lockEndOffsetMonths` < `cliffOffsetMonths` | cliff=12, lockEnd=6 | `lockEndOffsetMonths must be > cliffOffsetMonths` |
| Missing `--anchor-date-utc` | No anchor flag | `Missing required option` |
| Anchor with `+00:00` | `--anchor-date-utc 2025-01-31T00:00:00+00:00` | Rejected (not Z suffix) |
| Resolved cliffDate exceeds uint40 | Anchor far in future + large offset | `exceeds uint40 max` |
| No data rows in CSV | Header only, no data | `no data rows` |
| `--require-amount-wei` but column absent | Flag set, no `amountWei` column | Error |
| Blank `amountWei` when column present | Column exists but cell empty | Error |
| Total amount exceeds 10% of supply | CSV with total > 33,333,333 OMA (default `--max-total-pct 10`) | Hard error, no output files produced |
| Total amount at exactly 10% boundary | CSV with total = 33,333,333 OMA | Passes (boundary is inclusive) |
| Total amount just over 10% boundary | CSV with total = 33,333,334 OMA | Hard error |
| `--max-total-pct` override lowers threshold | `--max-total-pct 1`, CSV with 5,000,000 OMA | Hard error (threshold is 3,333,333 OMA) |
| `--max-total-pct` override raises threshold | `--max-total-pct 50`, CSV with 100,000,000 OMA | Passes |
| `--max-total-pct` only applies to `lock-add-locks` | `lock-update-locks` with total > 33,333,333 OMA | No error (threshold check skipped for updateLocks) |
| `--warn-wallet-pct` only applies to `lock-add-locks` | `lock-update-locks` with wallet > 1% of supply | No per-wallet warning emitted |
| `--warn-wallet-pct` produces console warning | `lock-add-locks`, wallet with 5,000,000 OMA (default `--warn-wallet-pct 1`) | Console output includes wallet address and percentage |
| `--warn-wallet-pct` does not cause hard error | `lock-add-locks`, wallet with 5,000,000 OMA | Run completes, output files are produced |
| `--warn-wallet-pct` with custom threshold | `--warn-wallet-pct 2`, wallet with 10,000,000 OMA (3.00% of supply) | Console warning emitted, run completes |
| `--warn-wallet-pct` no warning under threshold | `lock-add-locks`, all wallets under 1% of supply | No per-wallet warnings in console or summary |


#### `cli-utils.test.ts`

Source: `src/cli-utils.ts`

| Test | Input | Expected |
|------|-------|----------|
| Parses `--key value` pair | `['--network', 'sepolia']` | `options.get('network') === 'sepolia'` |
| Parses boolean flag | `['--help']` | `options.get('help') === true` |
| Collects positional args | `['0xabc', '0xdef']` | `positionals === ['0xabc', '0xdef']` |
| Mixed flags and positionals | `['--network', 'sepolia', '0xabc']` | Both parsed correctly |
| Rejects bare `--` | `['--']` | Throws `Invalid option --` |
| `getRequiredOption` returns value | Map with `'csv' => 'file.csv'` | `'file.csv'` |
| `getRequiredOption` throws on missing | Map without `'csv'` | Throws `Missing required option` |
| `getRequiredOption` throws on boolean flag | Map with `'csv' => true` | Throws `Missing required option` |
| `getPositiveIntOption` returns default | Map without key, default 200 | `200` |
| `getPositiveIntOption` parses valid int | Map with `'max' => '50'` | `50` |
| `getPositiveIntOption` rejects zero | Map with `'max' => '0'` | Throws error |
| `getPositiveIntOption` rejects negative | Map with `'max' => '-1'` | Throws error |
| `getPositiveIntOption` rejects float | Map with `'max' => '1.5'` | Throws error |

| `getBooleanFlag` returns false when absent | Map without key | `false` |
| `getBooleanFlag` returns true for bare flag | Map with `key => true` | `true` |
| `getBooleanFlag` parses `'true'` | Map with `key => 'true'` | `true` |
| `getBooleanFlag` parses `'false'` | Map with `key => 'false'` | `false` |
| `getBooleanFlag` rejects invalid | Map with `key => 'maybe'` | Throws error |
| `assertNoUnknownOptions` passes with known | Options `{'network'}`, allowed `{'network'}` | No error |
| `assertNoUnknownOptions` fails with unknown | Options `{'network', 'foo'}`, allowed `{'network'}` | Throws `Unknown option(s): --foo` |

---

### Integration Test Specifications

These tests require a Sepolia RPC endpoint. Set `OMA3_OPS_RPC_URL_SEPOLIA` in the environment. Skip the entire suite if the variable is not set.

Sepolia contract addresses (from README):
- OMA: `0xd7ee0eADb283eFB6d6e628De5E31A284183f4EDf`
- OMA Lock: `0x2f38D6cCB480d5C7e68d11b5a02f2c2451543F58`

#### `lock-status.test.ts`

Known test wallets are loaded from `data/sepolia-known-locks.json`. See the "Known Lock Fixtures" section below for details.

##### Tests

| Test | Input | Expected |
|------|-------|----------|
| Single wallet with known lock | First wallet from fixture file | `hasLock: true`, `amount` matches fixture, `cliffDate` matches fixture, `lockEndDate` matches fixture |
| Single wallet without lock | `--wallet 0x0000000000000000000000000000000000000001` on Sepolia | `hasLock: false`, all fields null/N/A |
| Multiple wallets via `--wallet` | All wallets from fixture file | All return `hasLock: true` with amounts matching fixture |
| Batch via `--csv` | CSV generated from fixture file addresses | Same results as `--wallet` with same addresses |
| `--out` writes JSON file | `--out /tmp/test-output.json` with known wallet | File exists, valid JSON, array of results, `hasLock: true` |
| Cross-verify against direct RPC | For each wallet in fixture: query `getLock()` directly via `ethers`, then run `lock-status` for the same wallets, compare all fields | Every field from `lock-status` output matches the directly-decoded RPC response: `timestamp`, `cliffDate`, `lockEndDate`, `amount`, `claimedAmount`, `stakedAmount`, `slashedAmount`, `unlockedAmount`, `claimable`, `vestingProgress` |
| Fixture immutable fields match on-chain | For each wallet in fixture: query `getLock()` on-chain, assert `amount`, `cliffDate`, `lockEndDate` match fixture values | Fixture data is consistent with on-chain state |
| Rejects both `--wallet` and `--csv` | Both flags provided | Throws error |
| Rejects neither `--wallet` nor `--csv` | No input flags | Throws error |
| Rejects duplicate addresses | Same address twice | Throws `Duplicate address` |
| Rejects invalid address | `--wallet notanaddress` | Throws `Invalid EVM address` |
| RPC chain ID mismatch | `--network mainnet` with Sepolia RPC | Throws `chain ID mismatch` |

The cross-verification test is the key integration test. It ensures `lock-status` output is consistent with raw on-chain data by:
1. Loading wallets from `data/sepolia-known-locks.json`
2. Calling `getLock()` directly via `ethers` `JsonRpcProvider` + ABI encoding for each wallet
3. Running `lock-status --wallet <addresses> --out <tmpfile>` and parsing the JSON output
4. Comparing every field between the two results (amounts in both human and wei, timestamps, dates, claimable, vesting progress)

#### `lock-verify-json.test.ts`

These tests exercise the `lock-verify-json` command, which reconciles `data/<network>-known-locks.json` against on-chain state. Requires Sepolia RPC.

Use a temporary copy of the fixture file for tests that modify it (auto-fix tests). Restore the original after each test.

| Test | Scenario | Assertions |
|------|----------|------------|
| All entries match on-chain | Run against unmodified `data/sepolia-known-locks.json` | All entries report `OK`, exit code 0, no changes to fixture file |
| Mismatch detection (dry-run) | Modify a fixture entry's `cliffDate` to a wrong value, run without `--auto-fix` | Reports `MISMATCH` for that wallet, fixture file unchanged |
| Mismatch auto-fix | Modify a fixture entry's `cliffDate`, run with `--auto-fix` | Reports `MISMATCH`, fixture file updated with correct on-chain value, `source` field prefixed with `verified:` |
| Missing lock detection (dry-run) | Add a fixture entry for a wallet with no on-chain lock (e.g. `0x0000...0001`), run without `--auto-fix` | Reports `MISSING`, fixture file unchanged (entry retained) |
| Missing lock auto-fix | Add a fixture entry for a wallet with no on-chain lock, run with `--auto-fix` | Reports `MISSING`, entry removed from fixture file |
| Default mode: sepolia auto-fixes | Run on sepolia without `--auto-fix` or `--dry-run` flags | Behaves as auto-fix (sepolia default) |
| Default mode: mainnet dry-runs | Run on mainnet without `--auto-fix` or `--dry-run` flags | Behaves as dry-run (mainnet default) |
| `--auto-fix` and `--dry-run` mutually exclusive | Both flags provided | Throws error |
| Empty fixture file | Fixture file is `[]` | Prints message, exits cleanly, no error |
| RPC chain ID mismatch | `--network mainnet` with Sepolia RPC | Throws `chain ID mismatch` |
| Amount mismatch detected | Modify a fixture entry's `amount` to a wrong value | Reports `MISMATCH` with `amount: fixture=... chain=...` |
| lockEndDate mismatch detected | Modify a fixture entry's `lockEndDate` | Reports `MISMATCH` with `lockEndDate: fixture=... chain=...` |
| Multiple mismatches in one entry | Modify both `cliffDate` and `lockEndDate` | Both differences reported in the mismatch line |
| Auto-fix preserves entry order | Fixture with 3 entries, middle one mismatched | Updated fixture has same entry count (if all exist on-chain), order preserved |
| Auto-fix removes missing and updates mismatched | Fixture with 1 OK, 1 mismatch, 1 missing on-chain | Result: 2 entries (OK + updated mismatch), missing entry removed |

#### `end-to-end.test.ts`

These tests run the full pipeline: CSV → `lock-add-locks` / `lock-update-locks` → output files → verification.

| Test | Scenario | Assertions |
|------|----------|------------|
| Basic `addLocks` generation | 3-wallet CSV, anchor `2025-01-31T00:00:00Z`, offsets (6,12) | `safe-tx.json` exists, valid JSON, 1 transaction, 3 wallets in calldata |
| `addLocks` with multiple groups | 4-wallet CSV: 2 with (6,12), 2 with (6,24) | 2 transactions in JSON |
| `addLocks` with chunking | 5-wallet CSV, `--max-wallets-per-tx 2` | 3 transactions |
| `updateLocks` generation | 2-wallet CSV | `safe-tx.json` has `updateLocks` method, no amounts in calldata |
| SHA256 in summary matches file | Any run | `shasum -a 256 safe-tx.json` matches `JSON SHA256:` line in summary |
| Batch fingerprint matches per-tx hashes | Any run | Recompute fingerprint from per-tx `calldataHash` values, compare to summary |
| Determinism | Run same CSV + anchor twice | Byte-identical `safe-tx.json` and `safe-tx.summary.txt` |
| Summary field order | Any run | All required fields appear in the order specified in README |
| `--csv` flag works (renamed from `--input`) | `--csv file.csv` | Runs successfully |
| `--input` flag rejected | `--input file.csv` | Throws `Unknown option(s): --input` |
| Safe JSON importable | Generated JSON | Validate against Safe Transaction Builder schema: `version`, `chainId`, `createdAt`, `meta`, `transactions` all present with correct types |
| `--max-total-pct` hard error in end-to-end | `lock-add-locks` with total > 33,333,333 OMA (default threshold) | No output files produced, error message references total supply threshold |
| `--max-total-pct` custom threshold passes | `lock-add-locks` with `--max-total-pct 50`, total 100,000,000 OMA | Output files produced, summary WARNINGS section includes override warning |
| `--warn-wallet-pct` warnings in summary file | `lock-add-locks` with wallet > 1% of supply | `safe-tx.summary.txt` WARNINGS section lists the wallet with address and percentage |
| `--warn-wallet-pct` run completes with warnings | `lock-add-locks` with wallet > 1% of supply | Both `safe-tx.json` and `safe-tx.summary.txt` produced despite warnings |
| Threshold override warnings in summary | `lock-add-locks` with `--max-total-pct 50 --warn-wallet-pct 5` | Summary WARNINGS section contains both `WARNING: --max-total-pct set to 50 (default: 10)` and `WARNING: --warn-wallet-pct set to 5 (default: 1)` lines |
| No threshold override warnings with defaults | `lock-add-locks` with default thresholds | Summary WARNINGS section does not contain `WARNING: --max-total-pct` or `WARNING: --warn-wallet-pct` lines |
| Known-locks fixture: `lock-add-locks` prepends entries | Run `lock-add-locks` with 2 wallets, check `data/<network>-known-locks.json` | 2 new entries prepended to the array (newest first), existing entries unchanged |
| Known-locks fixture: `lock-add-locks` source field format | Run `lock-add-locks`, inspect new entries | Each entry's `source` field matches `addLocks:<short-batch-fingerprint>` (e.g. `addLocks:9f2c1e4b7a21`) |
| Known-locks fixture: `lock-add-locks` entry fields | Run `lock-add-locks` with known CSV | Each new entry has `address` (checksum), `amount` (human-readable), `cliffDate` (unix seconds), `lockEndDate` (unix seconds), `source` |
| Known-locks fixture: `lock-update-locks` removes then prepends | Run `lock-update-locks` for wallets already in fixture | Old entries for those wallets removed, new entries with updated dates prepended |
| Known-locks fixture: `lock-update-locks` source field format | Run `lock-update-locks`, inspect new entries | Each entry's `source` field matches `updateLocks:<short-batch-fingerprint>` |
| Known-locks fixture: `lock-update-locks` preserves other entries | Run `lock-update-locks` for 1 of 3 wallets in fixture | The 2 untouched entries remain in their original positions after the prepended entry |
| Known-locks fixture: entries represent expected state | Run `lock-add-locks`, inspect entries before Safe execution | Entries reflect the CSV parameters (not on-chain state, which hasn't been executed yet) |

---

### Test Fixtures

#### CSV Fixtures

Create CSV fixture files in `test/fixtures/`. Each fixture should be minimal — only the rows and columns needed to test the specific behavior.

Naming convention: `<purpose>.csv`, e.g. `valid-3-wallets.csv`, `duplicate-address.csv`, `missing-header-amount.csv`.

Use deterministic wallet addresses. For unit tests that don't hit the chain, any valid checksum address works. For example:

```
0x0000000000000000000000000000000000000001
0x0000000000000000000000000000000000000002
0x0000000000000000000000000000000000000003
```

#### Known Lock Fixtures

Integration tests load known wallet data from `data/<network>-known-locks.json`. See the "Data Directory" section in the top-level `README.md` for the JSON format, field definitions, auto-maintenance behavior, and `lock-verify-json` usage.

### Key Testing Principles

1. Tests are written against the README spec, not the implementation. If the spec says "reject odd-length hex," there is a test for odd-length hex input that expects an error.

2. Determinism tests: run the same CSV + anchor date twice, assert byte-identical `safe-tx.json` and `safe-tx.summary.txt` output.

3. Every validation rule in the "Validation Rules" section of the README gets at least one test with a CSV that triggers that specific failure, asserting the script throws an error and produces no output files.

4. The hash test vectors from the README are literal test cases with hardcoded expected values.

5. Integration tests are gated behind environment variables so they don't fail in CI without credentials.

6. For chain context in unit tests, create a mock that returns fixed values (`decimals: 18`, Sepolia contract addresses). The `parseRows` and `planChunks` functions are pure — they take a `decimals` parameter and don't touch the network.

7. Fail-closed verification: for every validation error test, assert that no output files are written to the output directory. Create a temp directory before each test and verify it remains empty after the expected failure.

---

## Mainnet Readiness Checklist

The automated tests in this repository verify correctness of individual modules — CSV parsing, date math, ABI encoding, hash computation, deterministic output. These are necessary but not sufficient for mainnet confidence.

The most important tests for this repository are manual. The scripts generate artifacts that humans import into Safe and execute on-chain. No amount of unit testing can substitute for verifying that the full workflow works end-to-end with real contracts, real Safe UI, and real signers.

All items below must pass on Sepolia before the first mainnet run. Each item should be documented with the date, operator, and result (pass/fail + notes).

### 1. Safe Transaction Builder Import

Generate a `safe-tx.json` using `lock-add-locks` with a test CSV on Sepolia. Import the file into Safe Transaction Builder at `app.safe.global`. Verify:

- [ ] Import succeeds without errors
- [ ] Correct number of transactions appear
- [ ] Each transaction shows the correct method name (`addLocks` or `updateLocks`)
- [ ] Decoded parameters in Safe UI match the summary (wallet addresses, amounts, cliff/lockEnd dates)
- [ ] `calldataHash` verification: copy raw calldata hex from Safe UI, run `hash <hex>`, confirm it matches the summary

### 2. Full Round-Trip Execution

Execute the imported Safe transaction on Sepolia (requires a test Safe with Sepolia ETH). After execution:

- [ ] Transaction succeeds on-chain (check Etherscan)
- [ ] `lock-status` returns correct data for all wallets in the batch
- [ ] `lock-verify-json` reports all entries as OK
- [ ] Claimed amounts, vesting progress, and claimable values are consistent with the lock parameters

### 3. Realistic Amount Scale

Generate a batch with realistic OMA amounts (not just 1.0 OMA test values). Use amounts in the thousands to millions range with varying decimal precision. Verify:

- [ ] No precision loss in the `amount` → wei conversion (compare `amountWei` cross-check)
- [ ] Summary displays both human OMA and wei for all amount fields
- [ ] Per-transaction `totalOMA` and `totalWei` in the summary are correct
- [ ] Total amount sanity check triggers correctly when exceeding 10% of supply (33,333,333 OMA)

### 4. Revert Behavior

Generate an `addLocks` batch for wallets that already have locks on Sepolia. Import and attempt to execute in Safe. Verify:

- [ ] The Safe transaction reverts with `LockExist`
- [ ] Document what the revert looks like in Safe UI (error message, transaction status)
- [ ] Confirm no partial execution occurred (all-or-nothing behavior)
- [ ] Repeat with `updateLocks` for wallets that have no lock — verify `NoLock` revert

### 5. Multi-Signer Verification

Have at least two different signers independently verify a batch before signing:

- [ ] Both signers confirm the summary matches what they see in Safe UI
- [ ] At least one signer verifies using Safe mobile app
- [ ] At least one signer verifies `calldataHash` using the `hash` command
- [ ] Optional: both signers verify `safe-tx.json` SHA-256 against the summary

### 6. Update Locks Round-Trip

Generate and execute an `updateLocks` batch on Sepolia for wallets that were previously locked:

- [ ] Transaction succeeds
- [ ] `lock-status` shows updated cliff and lockEnd dates
- [ ] `lock-verify-json` reports entries as OK after fixture auto-update
- [ ] Original lock amount is unchanged

---

_This checklist is the final gate before mainnet. Automated tests catch regressions. This checklist catches integration failures that only surface when real components interact._
