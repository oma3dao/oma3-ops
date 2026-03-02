# OMA Treasury Contract Management – Safe Transaction Generation & Verification Plan

## Objective

Build a deterministic, script-based system for managing OMA token and lock contracts through Safe (Gnosis Safe) without relying on a custom frontend.

The system must:

* Ingest structured CSV inputs
* Generate Safe-compatible transaction JSON
* Output a human-readable summary (.txt)
* Support optional CLI verification
* Minimize attack surface
* Avoid exposing private keys
* Preserve Safe multisig governance

---

# Design Principles

1. No private keys in scripts.
2. Safe remains the only transaction execution layer.
3. No hosted verification website.
4. Deterministic outputs.
5. Human-readable verification artifact.
6. Hash-based integrity verification.
7. Reproducible builds.

---

# Scope

## Supported Operations (Phase 1)

1. `updateLocks`

   * Modify lock parameters for existing wallets
   * Input: CSV

2. `addLocks` / token issuance into lock contract

   * Input: CSV

Each contract function will either:

* Have its own script, OR
* Be selected via CLI flag (`--function updateLocks`)

---

# System Architecture

## Input

CSV file format (example):

address,amount,unlockTimestamp
0x123...,100000,1767225600
0xabc...,250000,1767225600

Validation requirements:

* Valid Ethereum address
* No duplicate addresses
* Correct decimal formatting (padding is possible)
* Valid timestamps
* No negative values
* Total amount sanity checks

---

## Output Artifacts

### 1. Safe Transaction JSON

File: `safe-tx.json`

* Safe-compatible batch transaction format
* Encoded contract call(s)
* Target contract address
* ABI-encoded calldata
* Value = 0
* Chain ID included
* No signing

This file will be:

* Dragged into Safe transaction builder
* Used for execution via multisig

---

### 2. Human-Readable Summary

File: `safe-tx.summary.txt`

Contains:

Contract Address:
Function Name:
Chain:
Total Wallets:
Total OMA Affected:

Per-wallet breakdown:
Address:
Amount:
Unlock:
Old vs New (if applicable)

Aggregate totals:

* Sum of tokens
* Timestamp range
* Any parameter changes

---

### 3. Deterministic Hash

Include in summary:

SHA256(safe-tx.json): <hash>

This allows reviewers to verify integrity using:

shasum -a 256 safe-tx.json

---

# Verification Model

## Reviewer Level 1 (Non-CLI)

* Open `safe-tx.summary.txt`
* Compare totals
* Compare addresses
* Load `safe-tx.json` into Safe
* Compare Safe's decoded function output against summary
* Approve

## Reviewer Level 2 (CLI Comfortable)

* Run verification script:

  * Re-decodes JSON
  * Confirms contract
  * Confirms function
  * Confirms parameters
  * Confirms totals
  * Confirms hash
* Approve

---

# Security Model

This design intentionally avoids:

* Hosted verification websites
* Dynamic JS rendering
* Third-party decoding services
* Server infrastructure
* Wallet private keys
* Hardhat signer usage

Attack surfaces minimized to:

* CSV integrity
* Local script integrity
* Safe UI integrity
* Signer device integrity

---

# Governance Workflow

1. Admin prepares CSV.
2. Generation script produces:

   * safe-tx.json
   * safe-tx.summary.txt
3. Admin distributes both files to reviewers.
4. Reviewers:

   * Validate summary
   * Optionally verify hash
   * Import JSON into Safe
   * Confirm Safe decoding matches summary
5. Signers approve via Safe (Ledger hardware required).
6. Transaction executed.

---

# Safety Constraints

Scripts must enforce:

* No address duplicates
* No malformed addresses
* No integer overflow
* Token decimals verified from chain (show decimals)
* Chain ID confirmation
* Contract address hardcoded or environment-validated
* Clear error output on failure
* Read-only verification script for CLI users

Scripts must fail closed.

---

# Future Enhancements (Optional)

* Deterministic Docker build
* Signed release artifacts
* JSON schema validation
* CSV schema validation
* Automatic diffing against on-chain state
* Dry-run mode
* Multi-operation batch builder

---

# Explicit Non-Goals

* No frontend UI (for now)
* No automated execution
* No private key signing in scripts
* No hot wallet usage
* No hosted SaaS verification

---

# Rationale

This approach:

* Preserves Safe as execution layer
* Reduces operational risk
* Avoids unnecessary web attack surface
* Allows mixed technical ability among signers
* Creates clear governance audit trail
* Scales to future contract operations

---

## Repository Strategy: `oma3-ops`

The `oma3-ops` repository will contain operational tooling for OMA3 governance, treasury management, and protocol administration.

This repository is intentionally separate from audited smart contract repositories. It does **not** contain Solidity contracts or deployment logic. Instead, it contains deterministic tooling used to:

* Generate Safe-compatible transaction JSON files
* Produce human-readable summaries of proposed actions
* Verify transaction payloads before submission
* Support governance and treasury workflows
* Maintain reproducible operational processes

This separation reduces risk, preserves audit clarity, and prevents operational scripts from polluting contract history.

## High-Level Repository Structure

oma3-ops/

### /treasury

Operational scripts related to token and lock contract management.

* update-locks/
* issue-new-locks/
* mint-to-lock/
* parameter-changes/

Each subfolder contains:

* generation script
* verification script
* sample input CSV
* documentation

### /governance (future implementation)

Scripts for structured governance operations.

* board-votes/
* treasury-release/
* builder-program-adjustments/
* signer-rotation/

## Script Architecture: OMA3-ops

### Overview

These scripts are **not Hardhat tasks** and **do not sign or broadcast transactions**. Their sole purpose is to:

1. Ingest structured inputs (e.g., CSV files)
2. Validate and encode contract calldata
3. Generate Safe-compatible JSON files
4. Produce human-readable summaries for verification

Safe and Ledger remain the only signing mechanisms.

---

### 1. No Private Keys

Scripts must:

* Never load a private key
* Never sign transactions
* Never broadcast transactions
* Never require a signer configuration

Safe is the contract admin.
Ledger signs Safe transactions.
The scripts only build transaction payloads.

---

### 2. Deterministic Transaction Builders

Each script acts as a stateless compiler:

**Input**

* CSV file
* Network selection
* Contract address
* ABI

**Output**

* Safe-compatible JSON
* Human-readable TXT summary
* Optional decoded verification output

The output must be reproducible from identical inputs.

---
## Summary

OMA3-ops scripts are:

* Node/TypeScript CLI tools
* Stateless
* Read-only
* Deterministic
* Safe-compatible

They are **not**:

* Deployment scripts
* Signers
* Admin bots
* Hardhat tasks
* Automation agents

Safe and Ledger remain the only execution layer.
