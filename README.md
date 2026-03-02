# oma3-ops

Deterministic operational tooling for OMA3 governance transactions.  
This repo generates Safe-compatible transaction files and human-readable review artifacts for OMA lock operations.

## Scope (V1)

Phase 1 supports lock contract operations only:

- `addLocks`
- `updateLocks`

Not in V1:

- `slash`
- any private-key signing
- direct transaction submission
- frontend UI

## Design Goals

- No private keys in scripts
- Safe is the only execution layer
- Deterministic outputs from the same inputs
- Human-readable summaries for reviewer verification
- Fail-closed validation

## Networks and Contracts

Defaults are sourced from `token-ft-eth/README.md` in this workspace.

### Sepolia

- OMA: `0xd7ee0eADb283eFB6d6e628De5E31A284183f4EDf`
- OMA Lock: `0x2f38D6cCB480d5C7e68d11b5a02f2c2451543F58`

### Ethereum Mainnet

- OMA: `0x36a72D42468eAffd5990Ddbd5056A0eC615B0bd4`
- OMA Lock: `0x249d2cc7B23546c3dE8655c03263466B77344ee7`

CLI may allow overrides, but defaults must match these values.

## Command Model

One command per operation, with shared core modules:

- `lock-add-locks`
- `lock-update-locks`
- `hash` (utility)

Shared modules handle:

- CSV ingestion and normalization
- validation
- ABI encoding
- deterministic grouping/chunking
- Safe JSON generation
- summary generation
- hash generation

## Input CSV Specification

CSV is required to include a header row.  
Scripts must parse by header names (not by column position) and reject missing required fields.

### Required Fields (V1)

- `address`
- `amount`

### Time Fields

Required per row:

- `cliffOffsetMonths`
- `lockEndOffsetMonths`

Required CLI input:

- `--anchor-date-utc <ISO-8601 UTC datetime>`

Cliff and lock-end are expressed as calendar-month offsets from a shared anchor date, which typically corresponds to a legal or commercial event (e.g. investment date, grant date). The script resolves offsets to absolute timestamps before grouping/encoding, handling month-end clamping deterministically.

Each run supports exactly one anchor date. If wallets have different investment/grant dates requiring different anchors, they must be processed in separate runs.

### Optional Fields (V1)

- `amountWei`

`amountWei` is an optional cross-check column only (not a second source of truth).  
Canonical amount input remains `amount` in human OMA units.

If `amountWei` is present on a row, then:

- `parseUnits(amount, tokenDecimals)` must equal `amountWei`
- any mismatch fails the run

CLI may support `--require-amount-wei` to require this column on all rows.

### Header Aliases (Deferred to V2)

Header alias support (e.g. `wallet` -> `address`, `allocation` -> `amount`) is deferred to V2 to reduce ambiguity in the initial implementation. V1 requires exact canonical header names.

Unknown extra columns are ignored.

### Value Formats

- `address`: EVM checksum or lowercase hex address
- `amount`: decimal human units (OMA, not wei), e.g. `1000`, `2500.5`
- `amountWei` (optional): base units as integer string, e.g. `1000000000000000000`
- `cliffOffsetMonths` / `lockEndOffsetMonths`: integer calendar-month offsets from `anchorDateUtc`

CSV does not carry types; every field is parsed as text and converted by the script.
The parser must reject non-integer offset values.

ISO-8601 datetime values (used for `--anchor-date-utc`) must use the `Z` (Zulu) UTC suffix exclusively. Numeric timezone offsets such as `+00:00` or `+05:30` must be rejected to eliminate timezone ambiguity.

### Offset Month Math (Deterministic)

- `anchorDateUtc` must be explicit and immutable for the run.
- month addition uses UTC calendar months.
- if target month has fewer days, clamp to the month's last day.
- preserve time-of-day from anchor.

Example: `anchorDateUtc=2025-01-31T00:00:00Z`, `+1 month` => `2025-02-28T00:00:00Z`.

## Operation Semantics

`OMALock` contract methods accept one `(cliffDate, lockEndDate)` pair per call:

- `addLocks(address[] wallets, uint96[] amounts, uint40 cliffDate, uint40 lockEndDate)`
- `updateLocks(address[] wallets, uint40 cliffDate, uint40 lockEndDate)`

Therefore, per-row offsets in CSV are handled by:

1. resolving each row's offsets to absolute Unix seconds `(cliffDate, lockEndDate)` from the anchor date
2. grouping rows by `(cliffDate, lockEndDate)`
3. chunking each group into deterministic batches
4. emitting one contract call per chunk

This preserves spreadsheet flexibility while respecting contract constraints.

### Compliance-Oriented Scheduling

Lock periods in governance contexts are measured from a fixed legal/commercial anchor date (for example, funds-received/investment date), not from script run time or Safe execution time. The anchor date is provided via `--anchor-date-utc` and must be explicit and immutable for the run.

Never resolve offsets relative to the future contract execution timestamp.

## On-Chain Behavior Constraints (Important)

From `token-ft-eth/contracts/OMALock.sol`:

- `addLocks` reverts with `LockExist` if any wallet in the call already has a lock.
- `updateLocks` reverts with `NoLock` if any wallet in the call has no lock.
- both functions are all-or-nothing; one invalid wallet reverts the whole call.

Operational implications:

- `addLocks` cannot be used to "top up" an already locked wallet.
- a wallet that has fully vested and claimed all tokens still has an active lock record on-chain (`timestamp` is never cleared by `claim()`). `addLocks` will revert with `LockExist` for that wallet. Only the `slash` function deletes a lock record and would allow the address to be reused in a future `addLocks` call.
- changing dates for existing locks must use `updateLocks`.
- CSV duplicate addresses are rejected to avoid ambiguous behavior.

## Deterministic Grouping and Chunking

### Grouping Key

Rows are grouped by exact key:

`<cliffDate>:<lockEndDate>`

### Ordering Rules

For deterministic artifacts:

1. sort groups by `cliffDate` ascending, then `lockEndDate` ascending
2. inside each group, sort rows by lowercase address ascending
3. chunk in sorted order

### Chunking Rule

Use fixed deterministic chunking with configurable cap:

- `--max-wallets-per-tx` (default: `200`)

Rationale: fixed chunk size is simpler to review, reproducible, and less error-prone than dynamic gas estimation.

## Validation Rules

Scripts must fail closed on validation errors.

### Common

- required headers must exist
- no blank required values
- valid EVM address format
- duplicate `address` rows are not allowed in the same csv file
- `amount` must be positive
- optional `amountWei` must be positive if present
- each row must have valid integer `cliffOffsetMonths` and `lockEndOffsetMonths`
- run must provide `--anchor-date-utc` (ISO-8601 with `Z` suffix)
- `cliffOffsetMonths >= 0` and `lockEndOffsetMonths > cliffOffsetMonths`
- resolved `cliffDate > 0`
- resolved `lockEndDate > cliffDate`
- resolved timestamps must be integer Unix seconds (not milliseconds)
- all numeric values must fit contract types:
  - `amount` -> `uint96` (after decimals conversion)
  - `cliffDate`, `lockEndDate` -> `uint40`
- chain selection must resolve to a supported chain and chain ID
- contract address must match configured chain defaults unless override flag is explicitly used

### `lock-add-locks` Specific

- token decimals are read from chain (OMA expected `18`)
- amounts are converted using on-chain decimals
- if `amountWei` is provided, conversion must exactly match
- optional sanity checks:
  - total amount in run
  - per-wallet min/max thresholds

### `lock-update-locks` Specific

- amounts are not encoded into calldata
- `amount` is still a required CSV field for `lock-update-locks`. This is an intentional strict policy: the amount column allows reviewers to cross-reference wallet addresses against known on-chain lock amounts to confirm the correct wallets are being updated. The script does not encode or use this value beyond basic format validation.
- if `amountWei` is provided, it is validated for consistency but never encoded

## Outputs

For each run, the tool outputs:

- `safe-tx.json`
- `safe-tx.summary.txt`

### `safe-tx.json`

Must be importable directly in the Safe Transaction Builder UI (`safe.global`).

Content requirements:

- top-level fields:
  - `version` (string, `1.0`)
  - `chainId` (string, EIP-155 chain ID)
  - `createdAt` (number, unix milliseconds, deterministic default `0`)
  - `meta` object
  - `transactions` array
- `meta` fields:
  - `name` (string; includes operation + short fingerprint)
  - `description` (string)
  - `txBuilderVersion` (string)
  - `createdFromSafeAddress` (string; empty by default)
  - `createdFromOwnerAddress` (string; empty by default)
  - `checksum` (string, optional)
- each `transactions[i]`:
  - `to` = OMA Lock contract address
  - `value` = `"0"`
  - `data` = ABI-encoded calldata hex string
  - `contractMethod` with canonical input schema
  - `contractInputsValues` string map matching encoded args
- transactions appear in deterministic group/chunk order.

### `safe-tx.json` Minimal Schema Example

```json
{
  "version": "1.0",
  "chainId": "11155111",
  "createdAt": 0,
  "meta": {
    "name": "OMA3 lock-add-locks 9f2c1e4b7a21",
    "description": "Generated by oma3-ops",
    "txBuilderVersion": "1.x",
    "createdFromSafeAddress": "",
    "createdFromOwnerAddress": "",
    "checksum": "0x..."
  },
  "transactions": [
    {
      "to": "0x2f38D6cCB480d5C7e68d11b5a02f2c2451543F58",
      "value": "0",
      "data": "0x...",
      "contractMethod": {
        "name": "addLocks",
        "payable": false,
        "inputs": [
          { "internalType": "address[]", "name": "wallets_", "type": "address[]" },
          { "internalType": "uint96[]", "name": "amounts_", "type": "uint96[]" },
          { "internalType": "uint40", "name": "cliffDate_", "type": "uint40" },
          { "internalType": "uint40", "name": "lockEndDate_", "type": "uint40" }
        ]
      },
      "contractInputsValues": {
        "wallets_": "[\"0x...\"]",
        "amounts_": "[\"1000000000000000000\"]",
        "cliffDate_": "1767225600",
        "lockEndDate_": "1798761600"
      }
    }
  ]
}
```

### `safe-tx.summary.txt`

Human-readable summary that includes:

- operation name (`addLocks` or `updateLocks`)
- chain and chain ID
- anchor datetime
- contract addresses used (OMALock and OMA ERC-20 token)
- input file path and row count
- transaction count
- total wallets
- total OMA amount (from CSV; encoded total for `addLocks`)
- per-transaction details (wallet count, total amount, boundary wallets)
- validation results
- SHA-256 of `safe-tx.json`
- deterministic batch fingerprint (short + full)

### `safe-tx.summary.txt` Required Sections (Order)

```text
OMA3 OPS TRANSACTION SUMMARY
Transaction ID:
Operation:
Network Name:
Chain ID:
Anchor Date UTC:
OMALock Contract:
OMA Token Contract:
Input CSV:
Rows Parsed:
Validation: PASS
Transactions:
Max Wallets Per Tx:
Total Wallets:
Total OMA (human):
Total OMA (wei):
JSON SHA256:
Batch Fingerprint:

TRANSACTIONS
- tx 1: method=addLocks cliffUnix=... cliffUtc=... lockEndUnix=... lockEndUtc=... wallets=... totalWei=... firstWallet=... lastWallet=... calldataHash=0xabc123...
- tx 2: ...

VALIDATION
- amountWei cross-check: pass/N/A
- duplicate addresses: pass
- offset resolution: pass
- timestamp format: pass
```

Field notes:

- `Anchor Date UTC` is the anchor date provided via `--anchor-date-utc`.
- `OMA Token Contract` is the OMA ERC-20 token address for the selected network. Included so reviewers can confirm the correct token is being used (relevant because `addLocks` performs a `safeTransferFrom` on this token).
- `Validation: PASS` is always `PASS` in a successfully generated summary. If validation fails, the script exits with an error and no summary is produced (fail-closed).
- `Rows Parsed` is the total number of data rows in the CSV. Since the script is fail-closed, all parsed rows are accepted or the run aborts — there is no partial acceptance.
- Validation line items use `pass` when the check succeeded or `N/A` when the check does not apply (e.g. `amountWei cross-check` is `N/A` when no `amountWei` column is present in the CSV). A summary file is never produced on a failed run — if any validation fails, the script exits with an error and no output files are written.
- The TRANSACTIONS section lists each transaction in deterministic order, mapping 1:1 to the `transactions` array in `safe-tx.json`. Each entry includes its group key (cliff/lockEnd dates), wallet count, total amount, boundary wallets, and a `calldataHash`. The proposer verifies each `calldataHash` against the Safe UI by copying the raw calldata hex from the Transaction Builder and running `hash <hex>`. Reviewers can perform the same check independently or rely on the proposer's verification.
- `calldataHash` is `keccak256` computed over the raw bytes of the `data` field. Canonicalization: strip the `0x` prefix from the hex string, reject odd-length hex, decode to bytes, then hash the bytes. Output is lowercase hex with `0x` prefix (66 characters total).
- `Batch Fingerprint` is a batch-level convenience digest: concatenate the 32-byte raw digest of each per-transaction `calldataHash` in transaction order, then compute `keccak256` over the concatenated bytes. Output is lowercase hex with `0x` prefix. The short fingerprint is the first 12 hex characters after `0x` (i.e. `0x` + 12 chars). It allows two reviewers to quickly confirm they are looking at the same batch without comparing every per-tx hash individually. Per-transaction `calldataHash` values are the primary verification mechanism.

## Hash Integrity

Summary includes:

`SHA256(safe-tx.json): <hash>`

Reviewers can verify with:

```bash
shasum -a 256 safe-tx.json
```

Note: Safe UI may not display file-level SHA256 directly; reviewers should compare decoded transactions plus the summary fingerprint/totals.

## CLI Shape (Spec)

Final flag names may evolve, but behavior should match this contract.

### `lock-add-locks`

```bash
lock-add-locks \
  --network <mainnet|sepolia> \
  --anchor-date-utc <ISO-8601 UTC datetime> \
  --input <path/to/file.csv> \
  --out-dir <path/to/output> \
  --max-wallets-per-tx 200
```

Defaults:

- `--network sepolia`
- `--max-wallets-per-tx 200`

`--anchor-date-utc` is required and must use the `Z` suffix (numeric timezone offsets are rejected).

Network mapping:

- `sepolia` -> chainId `11155111`
- `mainnet` -> chainId `1`

### `lock-update-locks`

```bash
lock-update-locks \
  --network <mainnet|sepolia> \
  --anchor-date-utc <ISO-8601 UTC datetime> \
  --input <path/to/file.csv> \
  --out-dir <path/to/output> \
  --max-wallets-per-tx 200
```

`lock-update-locks` uses the same anchor rules as `lock-add-locks`.

### `hash`

```bash
hash <hex-string>
```

Utility command that computes `keccak256` of the provided hex-encoded input and prints the result. Used by the proposer during the governance workflow to verify calldata hashes against the Safe UI.

Canonicalization rules:

- Input `0x` prefix is optional; if present it is stripped before decoding.
- Hex string must be even-length (whole bytes). Odd-length input is rejected with an error.
- Hex is decoded to raw bytes, then `keccak256` is computed over those bytes.
- Output is lowercase hex with `0x` prefix (66 characters total).

Test vectors:

```bash
hash 0x1234
# => 0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432

hash 0xabcdef
# => 0x800d501693feda2226878e1ec7869eef8919dbc5bd10c2bcd031b94d73492860

hash 0x6a627842
# => 0x654347b7dc147d586800b07bed0ef8d31b06de26b3210a3e014f9445ad4bf8da
```

No network or file arguments required.

## Governance Workflow

1. Transaction Initiator exports CSV from spreadsheet and checks the contents.
2. Initiator runs the proper command to generate `safe-tx.json` and `safe-tx.summary.txt`.
3. Initiator imports `safe-tx.json` into Safe Transaction Builder.
4. Initiator verifies each transaction's `calldataHash` from the summary against the Safe UI: copy the raw calldata hex from the Transaction Builder, run `hash <hex>` to compute its keccak256, and confirm it matches the summary.
5. Initiator distributes `safe-tx.summary.txt` (and optionally `safe-tx.json`) to reviewers/signers via an end-to-end encrypted messaging service.
6. Participants validate `safe-tx.summary.txt` and confirm decoded transactions on Safe match summary totals, group/chunk details, and calldata hashes.
7. Optional: verify `safe-tx.json` SHA256 against summary.
8. At least one validation must use Safe mobile app.
9. Signers approve and execute through Safe.

## Security Constraints

- no private keys in repo or scripts
- no auto-submit mode in V1
- no remote decode dependency required for verification
- deterministic output to reduce reviewer ambiguity
- explicit chain and contract controls to prevent cross-chain misrouting

## Testing Strategy

The README acts as the implementation spec for QA.  Tests must be written against the spec, not the implementation code. 

QA should build tests that include verification of:

- strict CSV parsing/validation behavior
- deterministic grouping/chunk ordering
- exact ABI encoding for `addLocks` and `updateLocks`
- Safe JSON import compatibility
- summary correctness vs JSON payload
- stable hash behavior for identical inputs
- fail-closed behavior on malformed inputs
