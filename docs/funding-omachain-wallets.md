# Funding Wallets on OMAChain

OMAChain is a custom EVM chain not natively supported by hardware wallet apps (Ledger Live, Trezor Suite) or most wallet UIs. The native gas token is bridged OMA (an ERC-20 on Ethereum/Sepolia that becomes the native token on OMAChain after bridging). This document covers the mechanics of getting OMA onto OMAChain wallets.

---

## Wallet Separation

Use dedicated wallets for each function. Do not reuse wallets across roles:

| Role                       | Wallet Type                  | Used For                              | Do NOT Use For                                    |
|----------------------------|------------------------------|---------------------------------------|---------------------------------------------------|
| Bridging                   | Hardware wallet (Ledger)     | Bridging OMA from L1 to OMAChain      | Signing multisig transactions, admin operations   |
| Safe multisig              | Gnosis Safe on Ethereum      | OMALock governance (vesting, slashing)| Bridging tokens to OMAChain                       |
| Server wallet (attestation)| Thirdweb server wallet       | Delegated attestations on OMAChain    | Anything else                                     |
| Server wallet (admin)      | Thirdweb server wallet       | Timelock proposals on OMAChain        | Anything else                                     |
| Deployment key             | SSH key file (EOA)           | One-time contract deployment          | Anything after ownership transfer                 |

Why separate the bridging wallet from the Safe: The Safe is a shared multisig with governance controls on Ethereum Mainnet. Safe (or any multisig) is not supported on OMAChain. A hardware wallet (used through MetaMask or Rabby) works on both OMAChain and Ethereum Mainnet. Since bridging is a routine funding operation that doesn't transfer large amounts of value, an EOA wallet is an appropriate vehicle.

Wallets used to sign OMA3 Safe transactions should be different from the hardware wallet used for bridging.

---

## How to Bridge OMA to OMAChain

**Testnet:** Use the faucet at https://faucet.testnet.omachain.org/ to get test OMA directly on OMAChain Testnet. No bridging needed for testnet.

To fund the faucet, bridge OMA from Sepolia to OMAChain using the testnet bridging wallet (`0xdf2210A7222f04b8214fDC513532872D62C59ECB`):

1. Go to https://bridge.testnet.omachain.org to bridge OMA from Sepolia to OMAChain. Connect with the hardware wallet via MetaMask or Rabby.
2. Transfer OMA on OMAChain to the faucet wallet using MetaMask or Rabby: `0x51C1C2B1B47bD9D2e17141Af0e31660292394f02`

**Mainnet:** Bridge OMA from Ethereum Mainnet to OMAChain Mainnet:

1. Hold OMA (ERC-20) in your bridging wallet on Ethereum
2. Use the OMAChain bridge at https://bridge.omachain.org to send OMA from Ethereum → OMAChain. Connect with the hardware wallet via MetaMask or Rabby.
3. Transfer native OMA on OMAChain to the target wallets (server wallets, deployment key, etc.) using MetaMask or Rabby

---

## Using a Ledger with OMAChain

Ledger Live does not support OMAChain. To sign OMAChain transactions with a Ledger hardware wallet, connect the Ledger through a browser wallet that supports custom networks:

**Via MetaMask:**
1. Add OMAChain as a custom network in MetaMask (See below for values)
2. Connect Ledger to MetaMask (Settings → Hardware Wallet → Connect)
3. Select the Ledger account
4. Sign transactions through MetaMask — the Ledger displays raw transaction data for confirmation

**Via Rabby:**
1. Add OMAChain as a custom chain in Rabby
2. Connect Ledger via Rabby's hardware wallet integration
3. Sign transactions as normal — Rabby routes signing to the Ledger

**Important:** Because OMAChain is an unknown chain to the Ledger firmware, the device displays raw hex data (not human-readable contract calls). Verify the recipient address and value carefully on the Ledger screen. Consider using a non-Ledger hot wallet for routine funding operations and reserving the Ledger for high-value or infrequent transactions.

---

## Funding Server Wallets

Thirdweb server wallets are standard EOA addresses. To fund them:

1. Get the server wallet address from Thirdweb dashboard (or from `oma3-internal-addresses.json`)
2. Send native OMA on OMAChain to that address using any wallet (MetaMask, Rabby, etc.)
3. Verify the balance via the Thirdweb dashboard or an OMAChain block explorer

Server wallets need enough OMA to cover gas for their expected operations:
- **Attestation wallet:** Gas for delegated attestation transactions (frequent, low-cost)
- **Admin wallet:** Gas for timelock proposals and executions (infrequent)

Monitor balances periodically. If a server wallet runs out of gas, attestations or admin operations will fail silently until refunded.

---

## OMAChain Network Details

| Network | Chain ID | RPC URL                                | Block Explorer                          |
|---------|----------|----------------------------------------|-----------------------------------------|
| Testnet | 66238    | https://rpc.testnet.omachain.org       | https://explorer.testnet.omachain.org   |
| Mainnet | 6623     | https://rpc.omachain.org               | https://explorer.omachain.org           |

Use these values when adding OMAChain as a custom network in MetaMask or Rabby.
