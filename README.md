# oma3-ops

Command-line tools for OMA3 representatives to interact with on-chain contracts (currently the OMALock contract). OMA3 uses Safe (Gnosis Safe) multisig for all admin operations, so these scripts serve as the front end for constructing Safe-compatible transactions and producing verification artifacts for reviewers.

## How It Works

1. A proposer prepares a CSV of wallet addresses and lock parameters.
2. The proposer runs a script (`lock-add-locks` or `lock-update-locks`) to generate a Safe-compatible transaction JSON file and a human-readable summary file.
3. The proposer imports the JSON into Safe Transaction Builder and verifies the calldata hashes.
4. The proposer distributes the summary file to reviewers/signers via end-to-end encrypted communications.
5. Reviewers open the pending transaction in Safe, compare the decoded details against the summary file, and approve.
6. Once the signing threshold is met, the transaction is executed.

No private keys are used by these scripts. No transactions are signed or submitted. Safe and hardware wallets are the only execution layer.

## Networks and Contracts

### Sepolia (testnet)

- OMA Token: `0xd7ee0eADb283eFB6d6e628De5E31A284183f4EDf`
- OMALock: `0xfD1410e3A80A0f311804a09C656d98a82B7c5d9f`

### Ethereum Mainnet

- OMA Token: `0x36a72D42468eAffd5990Ddbd5056A0eC615B0bd4`
- OMALock: `0x249d2cc7B23546c3dE8655c03263466B77344ee7`

CLI defaults must match these values. The `--lock-contract` and `--oma-token` flags allow overrides when `--allow-address-override` is also provided.

## Environment Setup

Scripts need an RPC endpoint for read-only on-chain calls (chain ID verification, token decimals, `getLock` queries). No transactions are signed or submitted.

### RPC Configuration

Copy `.env.example` to `.env.local` and fill in your thirdweb Client ID:

```bash
cp .env.example .env.local
```

`.env.local` contents:

```
OMA3_OPS_RPC_URL_SEPOLIA=https://11155111.rpc.thirdweb.com/<CLIENT_ID>
OMA3_OPS_RPC_URL_MAINNET=https://1.rpc.thirdweb.com/<CLIENT_ID>
```

The env file is loaded automatically via Node 20's `--env-file` flag when using the npm scripts (e.g. `npm run lock-status -- --wallet 0x...`). If running the compiled binaries directly, either export the env vars manually or use `node --env-file=.env.local dist/<command>.js`.

### RPC URL Resolution Order

1. `--rpc-url` CLI flag (explicit override)
2. `OMA3_OPS_RPC_URL_SEPOLIA` or `OMA3_OPS_RPC_URL_MAINNET` (network-specific env var)
3. `OMA3_OPS_RPC_URL` (generic fallback env var)

---

## Checking Lock Status (`lock-status`)

Read-only command that queries `getLock()` on-chain for one or more wallets and prints their lock status. This is the simplest way to inspect what's on-chain before generating any transactions.

```bash
# Single or multiple wallets
lock-status --network mainnet --wallet 0xabc... 0xdef...

# Batch from CSV (requires `address` column header)
lock-status --network sepolia --csv wallets.csv

# Export to JSON file
lock-status --network mainnet --wallet 0xabc... --out status.json
```

Exactly one of `--wallet` or `--csv` must be provided. `--wallet` accepts one or more space-separated addresses.

### Parameters

| Flag        | Required | Default   | Description                                                    |
|-------------|----------|-----------|----------------------------------------------------------------|
| `--network` | no       | `sepolia` | `mainnet` or `sepolia`                                         |
| `--wallet`  | one of   | —         | One or more wallet addresses                                   |
| `--csv`     | one of   | —         | CSV file with `address` column                                 |
| `--out`     | no       | —         | Write JSON output to file (otherwise prints table to terminal) |
| `--rpc-url` | no       | —         | Override RPC endpoint                                          |

### Output Fields (per wallet)

| Field            | Description                                                                                      |
|------------------|--------------------------------------------------------------------------------------------------|
| `address`        | Wallet address (checksum)                                                                        |
| `hasLock`        | Whether a lock record exists                                                                     |
| `timestamp`      | Lock creation timestamp (unix + UTC)                                                             |
| `cliffDate`      | Cliff date — vesting starts here (unix + UTC)                                                    |
| `lockEndDate`    | Lock end date — 100% vested here (unix + UTC)                                                    |
| `amount`         | Total locked amount (human + wei)                                                                |
| `claimedAmount`  | Tokens already withdrawn via `claim()` (human + wei)                                             |
| `stakedAmount`   | Tokens currently staked (human + wei)                                                            |
| `slashedAmount`  | Tokens slashed by admin (human + wei)                                                            |
| `unlockedAmount` | Total vested so far (human + wei). This is cumulative and includes tokens already claimed.       |
| `claimable`      | Available to withdraw right now (human + wei). See formula below.                                |
| `vestingProgress`| Percentage of total amount vested, e.g. `45.2%`                                                  |

How these relate:

- `unlockedAmount` is the total that has vested to date (linear between cliff and lockEnd). Before the cliff it is 0; after lockEnd it equals `amount`.
- `claimedAmount` is the portion of `unlockedAmount` already withdrawn.
- `claimable` is what you can withdraw right now: `min(unlockedAmount - claimedAmount, amount - claimedAmount - stakedAmount - slashedAmount)`, floored at 0. The second term accounts for tokens that are staked or slashed and therefore not available even if vested.
- When there is no staking or slashing: `unlockedAmount ≈ claimedAmount + claimable`.

Wallets without a lock record are reported with `hasLock: false` and all other fields as `N/A` (no error).

---

## Generating Lock Write Transactions (`lock-add-locks` / `lock-update-locks`)

Both commands follow the same flow: prepare a CSV, run the command, review the outputs, import into Safe, verify, distribute to reviewers, and execute.

- `lock-add-locks` creates new locks. It encodes wallet addresses, amounts, cliff dates, and lock end dates into `addLocks()` calldata.
- `lock-update-locks` modifies dates on existing locks. It encodes wallet addresses, cliff dates, and lock end dates into `updateLocks()` calldata. Amounts are not encoded into the transaction — the `amount` CSV column is required but exists only so reviewers can cross-reference that the correct wallets are being updated. The on-chain locked amount is not changed by `updateLocks`.

### Step 1: Prepare the CSV

Create a CSV file with a header row. The scripts parse by header name, not column position.

Required columns:

| Column               | Format                                    | Description                                                |
|----------------------|-------------------------------------------|------------------------------------------------------------|
| `address`            | EVM checksum or lowercase hex             | Wallet address                                             |
| `amount`             | Decimal human units (e.g. `1000`, `2500.5`) | OMA amount (not wei)                                     |
| `cliffOffsetMonths`  | Integer >= 0                              | Calendar-month offset from anchor date to cliff            |
| `lockEndOffsetMonths`| Integer > `cliffOffsetMonths`             | Calendar-month offset from anchor date to lock end         |

- achor date is described in the Parameters section below
- `lockEndOffsetMonths` must be strictly greater than `cliffOffsetMonths`. The OMALock contract requires `lockEndDate > cliffDate`; equal values cause a revert.

Optional column:

| Column      | Format                                        | Description                                                                          |
|-------------|-----------------------------------------------|--------------------------------------------------------------------------------------|
| `amountWei` | Integer string (e.g. `1000000000000000000`)   | Cross-check only. Must equal `parseUnits(amount, 18)`. Any mismatch fails the run.  |

Example:

```csv
address,amount,cliffOffsetMonths,lockEndOffsetMonths
0x1234567890abcdef1234567890abcdef12345678,100000,12,21
0xabcdefabcdefabcdefabcdefabcdefabcdefabcd,250000,12,48
```

Unknown extra columns are ignored. V1 requires exact canonical header names (header aliases deferred to V2).

Before running the command, create a run archive folder and place the CSV in it. This keeps the input CSV alongside the generated output files for a complete audit trail. See the Run Archives section below for the naming convention.

### Step 2: Run the Command

```bash
# Add new locks
lock-add-locks \
  --network mainnet \
  --anchor-date-utc 2025-01-31T00:00:00Z \
  --csv data/runs/mainnet/2025-03-10-001-addLocks/input.csv \
  --out-dir data/runs/mainnet/2025-03-10-001-addLocks

# Update existing locks
lock-update-locks \
  --network mainnet \
  --anchor-date-utc 2025-01-31T00:00:00Z \
  --csv data/runs/mainnet/2025-03-10-002-updateLocks/input.csv \
  --out-dir data/runs/mainnet/2025-03-10-002-updateLocks
```

### Parameters

| Flag                   | Required | Default   | Description                                                                                        |
|------------------------|----------|-----------|----------------------------------------------------------------------------------------------------|
| `--network`            | no       | `sepolia` | `mainnet` or `sepolia`                                                                             |
| `--anchor-date-utc`    | yes      | —         | ISO-8601 UTC datetime with `Z` suffix. Numeric timezone offsets (e.g. `+00:00`) are rejected.      |
| `--csv`                | yes      | —         | Path to input CSV                                                                                  |
| `--out-dir`            | yes      | —         | Directory for output files                                                                         |
| `--max-wallets-per-tx` | no       | `200`     | Max wallets per transaction chunk                                                                  |
| `--max-total-pct`      | no       | `10`      | Hard error if total OMA exceeds this % of total supply (333,333,333 OMA). Positive integer. `lock-add-locks` only.   |
| `--warn-wallet-pct`    | no       | `1`       | Warning if any wallet exceeds this % of total supply. Positive integer. `lock-add-locks` only.                       |
| `--require-amount-wei` | no       | `false`   | Require `amountWei` column on all rows                                                             |
| `--rpc-url`            | no       | —         | Override RPC endpoint                                                                              |

The anchor date is the legal/commercial reference point (e.g. investment date, grant date) from which cliff and lock-end offsets are calculated. Each run supports exactly one anchor date. If wallets have different anchor dates, they must be processed in separate runs.

### Step 3: Review the Outputs

The command produces two files in `--out-dir`:

- `safe-tx.json` — Safe-compatible transaction batch file, importable into Safe Transaction Builder.
- `safe-tx.summary.txt` — Human-readable summary file for reviewer verification.

Review the console output for any warnings (e.g. per-wallet allocations exceeding 1% of total supply).

### Step 4: Import into Safe and Verify

1. Open Safe Transaction Builder at `safe.global`.
2. Import `safe-tx.json`.
3. For each transaction in the batch, verify the `calldataHash` from the summary file:
   - Copy the raw calldata hex from the Transaction Builder.
   - Run `hash <hex>` to compute its keccak256.
   - Confirm it matches the `calldataHash` in the summary file.

The `hash` utility:

```bash
hash <hex-string>
```

Computes `keccak256` of hex-encoded input. `0x` prefix is optional. Output is lowercase hex with `0x` prefix (66 characters).

Test vectors (if you want to verify `hash` outputs the correct value):

```bash
hash 0x1234
# => 0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432

hash 0xabcdef
# => 0x800d501693feda2226878e1ec7869eef8919dbc5bd10c2bcd031b94d73492860

hash 0x6a627842
# => 0x654347b7dc147d586800b07bed0ef8d31b06de26b3210a3e014f9445ad4bf8da
```

### Step 5: Distribute to Reviewers

Send `safe-tx.summary.txt` (and optionally `safe-tx.json`) to reviewers/signers via end-to-end encrypted communications.

### Step 6: Reviewer Verification

> _TODO: Add detailed field-by-field reviewer guidance with a worked example summary file and Safe UI screenshots._

Reviewers open the pending transaction in Safe (`safe.global` or the Safe mobile app) and verify:

1. Decoded transaction details on Safe (contract address, function name, parameters) match the summary file.
2. Chain ID, contract addresses, and anchor date match expectations.
3. Total wallets, total OMA, and per-transaction details match.
4. WARNINGS section: check for any threshold override warnings (non-default `--max-total-pct` or `--warn-wallet-pct`). If present, verify the overrides are authorized. Check any per-wallet allocation warnings and verify each is intentional. Do not sign until all warnings are accounted for.
5. Optional: download `safe-tx.json` and verify SHA-256 against the summary file putting this in the command line: `shasum -a 256 safe-tx.json`.
6. At least one reviewer should validate using the Safe mobile app.

### Step 7: Approve and Execute

Signers approve through Safe. Once the signing threshold is met, any signer can execute the transaction.

### Verifying Known Locks (`lock-verify-json`)

After transactions are executed on-chain, use `lock-verify-json` to reconcile the known-locks files (`data/sepolia-known-locks.json` and `data/mainnet-known-locks.json`) against actual on-chain state:

```bash
lock-verify-json --network mainnet          # dry-run by default on mainnet
lock-verify-json --network sepolia          # auto-fix by default on sepolia
lock-verify-json --network mainnet --auto-fix  # override to auto-fix
```

Reads `data/<network>-known-locks.json`, queries `getLock()` for each wallet, and reports or fixes discrepancies:

- Lock matches fixture → OK
- Lock exists but parameters differ → update fixture (auto-fix flag) or report mismatch (default)
- No lock on-chain → remove from fixture (auto-fix flag) or report missing (default)

---

## Data Directory

The `data/` directory stores operational reference data and run archives.

```
data/
  sepolia-known-locks.json
  mainnet-known-locks.json
  runs/
    mainnet/
      2025-03-10-001-addLocks/
        input.csv
        safe-tx.json
        safe-tx.summary.txt
    sepolia/
      2025-03-06-001-addLocks/
        input.csv
        safe-tx.json
        safe-tx.summary.txt
```

### Known Lock Files

`<network>-known-locks.json` — JSON array of wallet lock records, newest first. Automatically maintained by `lock-add-locks`, `lock-update-locks`, and `lock-verify-json`.

- `lock-add-locks`: prepends new entries for all wallets in the run.
- `lock-update-locks`: removes existing entries for updated wallets, then prepends new entries with updated dates.
- Each entry includes a `source` field that traces it back to the run that created it (e.g. `addLocks:9f2c1e4b7a21`, where the suffix is the short batch fingerprint). This lets you find the corresponding run archive in `data/runs/` to review the original CSV and summary.
- Entries represent expected state (updated at generation time, before Safe execution). Use `lock-verify-json` to reconcile against on-chain state after execution.

### Run Archives

Each run should be archived using the naming convention:

```
data/runs/<network>/YYYY-MM-DD-NNN-<operation>/
```

- `YYYY-MM-DD` — date of the run
- `NNN` — zero-padded index (001, 002, ...) for multiple runs on the same day
- `<operation>` — `addLocks` or `updateLocks`

Place the input CSV in the folder first, then point both `--csv` and `--out-dir` at the same folder. After the run, the folder contains the complete audit trail.

---

## Slashing Locks (`lock-slash`)

Generates Safe transactions that call `slash(address wallet_, address to_)` for each wallet. This deletes the lock record and transfers the remaining balance (`amount - claimedAmount - slashedAmount`) to the `--to` destination (typically the Safe/treasury). Tokens already claimed before slashing are not recoverable.

The contract reverts with `AmountStaked` if a wallet has staked tokens. The script queries `getLock()` on-chain for each wallet before generating transactions and will hard-error if any wallet has `stakedAmount > 0`, listing the affected wallets and instructing the operator to run `lock-slash-stake` first.

```bash
lock-slash \
  --network mainnet \
  --csv data/runs/mainnet/2025-03-10-003-slash/input.csv \
  --to 0xSafeTreasuryAddress \
  --out-dir data/runs/mainnet/2025-03-10-003-slash
```

### CSV Format

| Column    | Format                        | Description      |
|-----------|-------------------------------|------------------|
| `address` | EVM checksum or lowercase hex | Wallet to slash  |

### Parameters

| Flag                       | Required | Default   | Description                                      |
|----------------------------|----------|-----------|--------------------------------------------------|
| `--network`                | no       | `sepolia` | `mainnet` or `sepolia`                           |
| `--csv`                    | yes      | —         | CSV file with `address` column                   |
| `--to`                     | yes      | —         | Destination address for recovered tokens         |
| `--out-dir`                | yes      | —         | Directory for output files                       |
| `--rpc-url`                | no       | —         | Override RPC endpoint                            |
| `--lock-contract`          | no       | —         | Override OMALock address (requires `--allow-address-override`) |
| `--oma-token`              | no       | —         | Override OMA token address (requires `--allow-address-override`) |
| `--allow-address-override` | no       | `false`   | Allow `--lock-contract` / `--oma-token` overrides |

### Behavior

- One `slash()` call per wallet → one Safe transaction per wallet in the batch.
- Wallets are sorted by lowercase address for deterministic output.
- If any wallet has no lock on-chain, the script errors.
- If any wallet has `stakedAmount > 0`, the script errors with a clear message listing all affected wallets. `lock-slash-stake` must be run first for those wallets — these are separate governance decisions.

### Outputs

`safe-tx.json` and `safe-tx.summary.txt` in `--out-dir`, following the same patterns as other write commands.

---

## Slashing Staked Tokens (`lock-slash-stake`)

Generates Safe transactions that call `slashStake(address wallet_, uint96 amount_, address to_)` for each wallet. This reduces the wallet's `stakedAmount` and transfers the slashed tokens to `--to`. The lock record is preserved (not deleted).

The script queries `getLock()` on-chain for each wallet to read the current `stakedAmount`. By default, the full `stakedAmount` is slashed. To slash a partial amount, include a `stakedAmount` column in the CSV with the wei value to slash.

```bash
# Slash full staked amount for each wallet
lock-slash-stake \
  --network mainnet \
  --csv data/runs/mainnet/2025-03-10-004-slashStake/input.csv \
  --to 0xSafeTreasuryAddress \
  --out-dir data/runs/mainnet/2025-03-10-004-slashStake
```

### CSV Format

| Column         | Format                        | Required | Description                                                        |
|----------------|-------------------------------|----------|--------------------------------------------------------------------|
| `address`      | EVM checksum or lowercase hex | yes      | Wallet to slash stake from                                         |
| `stakedAmount` | Integer wei string            | no       | Partial amount to slash (wei). Omit or leave blank for full slash. |

### Parameters

| Flag                       | Required | Default   | Description                                      |
|----------------------------|----------|-----------|--------------------------------------------------|
| `--network`                | no       | `sepolia` | `mainnet` or `sepolia`                           |
| `--csv`                    | yes      | —         | CSV file with `address` column                   |
| `--to`                     | yes      | —         | Destination address for slashed tokens           |
| `--out-dir`                | yes      | —         | Directory for output files                       |
| `--rpc-url`                | no       | —         | Override RPC endpoint                            |
| `--lock-contract`          | no       | —         | Override OMALock address (requires `--allow-address-override`) |
| `--oma-token`              | no       | —         | Override OMA token address (requires `--allow-address-override`) |
| `--allow-address-override` | no       | `false`   | Allow `--lock-contract` / `--oma-token` overrides |

### Behavior

- One `slashStake()` call per wallet → one Safe transaction per wallet in the batch.
- Wallets are sorted by lowercase address for deterministic output.
- If any wallet has no lock on-chain, the script errors.
- If any wallet has `stakedAmount == 0` on-chain, the script errors (nothing to slash).
- If a CSV `stakedAmount` exceeds the on-chain `stakedAmount`, the script errors.

### Outputs

`safe-tx.json` and `safe-tx.summary.txt` in `--out-dir`, following the same patterns as other write commands.

---

## Reference

### Anchor Date and Offset Month Math

The anchor date (`--anchor-date-utc`) is the legal/commercial reference point from which cliff and lock-end offsets are calculated. It must be ISO-8601 with `Z` suffix exclusively — numeric timezone offsets are rejected.

Offset resolution rules:

- Month addition uses UTC calendar months.
- If the target month has fewer days, clamp to the month's last day.
- Preserve time-of-day from anchor.

Example: `2025-01-31T00:00:00Z` + 1 month → `2025-02-28T00:00:00Z`.

Lock periods are measured from the anchor date, not from script run time or Safe execution time.

### On-Chain Behavior Constraints

From `token-ft-eth/contracts/OMALock.sol`:

- `addLocks` reverts with `LockExist` if any wallet already has a lock.
- `updateLocks` reverts with `NoLock` if any wallet has no lock.
- Both are all-or-nothing: one invalid wallet reverts the whole call.

Operational implications:

- `addLocks` cannot "top up" an already locked wallet.
- A fully vested and claimed wallet still has an active lock record (`timestamp` is never cleared by `claim()`). `addLocks` will revert with `LockExist`. Only `slash` deletes a lock record.
- Changing dates for existing locks must use `updateLocks`.
- CSV duplicate addresses are rejected.

### Recovery from Mistaken `addLocks`

`slash(address wallet_, address to_)` is the recovery mechanism. It requires `SLASH_ROLE`, calculates remaining balance (`amount - claimedAmount - slashedAmount`), transfers those tokens to `to_` (typically the Safe/treasury), and deletes the lock record. After slashing, the wallet can be re-locked with `addLocks`. Tokens already claimed before slashing are not recoverable.

If the wallet has staked tokens, `slash` reverts with `AmountStaked`. Recovery is two steps:

1. `slashStake(wallet_, stakedAmount, to_)` — requires `STAKE_ROLE`. Reduces `stakedAmount` to zero. Use `lock-slash-stake` to generate the Safe transaction.
2. `slash(wallet_, to_)` — now succeeds. Transfers remaining balance and deletes the lock record. Use `lock-slash` to generate the Safe transaction.

On mainnet, the admin Safe holds both `SLASH_ROLE` and `STAKE_ROLE`.

### Operation Semantics

`OMALock` contract methods accept one `(cliffDate, lockEndDate)` pair per call:

- `addLocks(address[] wallets, uint96[] amounts, uint40 cliffDate, uint40 lockEndDate)`
- `updateLocks(address[] wallets, uint40 cliffDate, uint40 lockEndDate)`

Per-row offsets in CSV are handled by:

1. Resolving each row's offsets to absolute Unix seconds from the anchor date.
2. Grouping rows by `(cliffDate, lockEndDate)`.
3. Chunking each group into deterministic batches.
4. Emitting one contract call per chunk.

### Deterministic Grouping and Chunking

Grouping key: `<cliffDate>:<lockEndDate>`

Ordering rules (for deterministic artifacts):

1. Sort groups by `cliffDate` ascending, then `lockEndDate` ascending.
2. Inside each group, sort rows by lowercase address ascending.
3. Chunk in sorted order.

Chunking uses a fixed cap: `--max-wallets-per-tx` (default: `200`). Fixed chunk size is simpler to review, reproducible, and less error-prone than dynamic gas estimation.

### Validation Rules

Scripts fail closed on validation errors — no output files are produced.

Common:

- Required headers must exist
- No blank required values
- Valid EVM address format
- No duplicate addresses in the same CSV
- `amount` must be positive
- `amountWei` must be positive if present
- Valid integer `cliffOffsetMonths` and `lockEndOffsetMonths`
- `--anchor-date-utc` required (ISO-8601 with `Z` suffix)
- `cliffOffsetMonths >= 0` and `lockEndOffsetMonths > cliffOffsetMonths`
- Resolved `cliffDate > 0` and `lockEndDate > cliffDate`
- Resolved timestamps must be integer Unix seconds
- Numeric values must fit contract types: `amount` → `uint96`, dates → `uint40`
- Chain selection must resolve to a supported chain and chain ID

`lock-add-locks` specific:

- Token decimals read from chain (OMA expected `18`)
- Amounts converted using on-chain decimals
- `amountWei` cross-check must exactly match if provided
- Total amount sanity check (`--max-total-pct`, default 10% of 333,333,333 OMA supply)
- Per-wallet warning (`--warn-wallet-pct`, default 1% of supply)
- All wei values in the summary file and terminal output are accompanied by the human-readable OMA equivalent

`lock-update-locks` specific:

- Amounts are not encoded into `updateLocks` calldata — the contract function only takes wallets and dates
- `amount` is still a required CSV column so reviewers can cross-reference wallet addresses against known on-chain lock amounts to confirm the correct wallets are being updated
- `amountWei` validated for consistency if present, but never encoded

### Output File Formats

#### `safe-tx.json`

Importable directly in Safe Transaction Builder UI (`safe.global`).

- `version`: `"1.0"`
- `chainId`: string, EIP-155 chain ID
- `createdAt`: `0` (deterministic)
- `meta.name`: includes operation + short fingerprint (e.g. `"OMA3 lock-add-locks 9f2c1e4b7a21"`)
- `meta.description`: `"Generated by oma3-ops"`
- `meta.txBuilderVersion`: `"1.x"`
- `meta.createdFromSafeAddress`: `""` (empty)
- `meta.createdFromOwnerAddress`: `""` (empty)
- `transactions`: An array of blockchain transactions. Each transaction in the array has the following fields: `to` = OMALock address, `value` = `"0"`, `data` = ABI-encoded calldata, `contractMethod` with canonical input schema, `contractInputsValues` string map.
- Transactions appear in deterministic group/chunk order.

Minimal example:

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
      "to": "0xfD1410e3A80A0f311804a09C656d98a82B7c5d9f",
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

#### `safe-tx.summary.txt`

Required sections in order:

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
- tx 1: method=addLocks cliffUnix=... cliffUtc=... lockEndUnix=... lockEndUtc=... wallets=... totalOMA=... totalWei=... firstWallet=... lastWallet=... calldataHash=0x...
- tx 2: ...

VALIDATION
- amountWei cross-check: pass/N/A
- duplicate addresses: pass
- offset resolution: pass
- timestamp format: pass

WARNINGS
- WARNING: --max-total-pct set to 50 (default: 10). Verify this override is authorized.
- WARNING: --warn-wallet-pct set to 5 (default: 1). Verify this override is authorized.
- 0x5E77...1615: allocated 5,000,000.0 OMA (1.50% of total supply)
- (or "None" if no warnings)
```

Field notes:

- `Validation: PASS` is always `PASS` in a successfully generated summary file. If validation fails, the script exits with an error and no summary file is produced (fail-closed).
- `Rows Parsed` is the total number of data rows. Since the script is fail-closed, all parsed rows are accepted or the run aborts.
- Validation line items use `pass` when the check succeeded or `N/A` when the check does not apply (e.g. `amountWei cross-check` is `N/A` when no `amountWei` column is present).
- WARNINGS lists per-wallet allocations exceeding the `--warn-wallet-pct` threshold. These are informational — the run completes — but reviewers must verify each flagged allocation is intentional. If the proposer overrode the default `--max-total-pct` or `--warn-wallet-pct` thresholds, a WARNING line is emitted for each override showing the value used and the default. Reviewers must verify any threshold overrides are authorized before signing.
- `calldataHash` is `keccak256` over the raw bytes of the `data` field. Canonicalization: strip `0x` prefix, reject odd-length hex, decode to bytes, hash. Output is lowercase hex with `0x` prefix (66 characters).
- `Batch Fingerprint` is a convenience digest: concatenate the 32-byte raw digest of each per-transaction `calldataHash` in order, then `keccak256` over the concatenated bytes. The short fingerprint is `0x` + first 12 hex characters. Per-transaction `calldataHash` values are the primary verification mechanism.
- `OMA Token Contract` is included so reviewers can confirm the correct token (relevant because `addLocks` performs a `safeTransferFrom` on this token).

### Hash Canonicalization

The `hash` utility and all internal hash computations follow these rules:

- Input `0x` prefix is optional; stripped before decoding.
- Hex string must be even-length (whole bytes). Odd-length is rejected.
- Hex is decoded to raw bytes, then `keccak256` is computed over those bytes.
- Output is lowercase hex with `0x` prefix (66 characters total).

### Testing Strategy

This README acts as the implementation spec for QA. Tests must be written against the spec, not the implementation code.

QA should verify:

- Strict CSV parsing/validation behavior
- Deterministic grouping/chunk ordering
- Exact ABI encoding for `addLocks` and `updateLocks`
- Safe JSON import compatibility
- Summary file correctness vs JSON payload
- Stable hash behavior for identical inputs
- Fail-closed behavior on malformed inputs
