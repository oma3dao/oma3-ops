#!/usr/bin/env node
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { formatUnits, getAddress, Interface, JsonRpcProvider } from 'ethers';
import {
  assertNoUnknownOptions,
  getOptionalString,
  parseCliArgs,
} from './cli-utils.js';
import { getNetworkConfig, getRpcUrl, type NetworkName } from './config.js';
import { parseCsvFile, requireHeaders } from './csv-utils.js';

const LOCK_ABI = [
  'function getLock(address wallet_) view returns (tuple(uint40 timestamp, uint40 cliffDate, uint40 lockEndDate, uint96 amount, uint96 claimedAmount, uint96 stakedAmount, uint96 slashedAmount) lock, uint96 unlockedAmount)',
  'function omaToken() view returns (address)',
] as const;

const TOKEN_ABI = ['function decimals() view returns (uint8)'] as const;

const LOCK_INTERFACE = new Interface(LOCK_ABI);
const TOKEN_INTERFACE = new Interface(TOKEN_ABI);

interface LockResult {
  readonly address: string;
  readonly hasLock: boolean;
  readonly timestamp: number | null;
  readonly timestampUtc: string | null;
  readonly cliffDate: number | null;
  readonly cliffDateUtc: string | null;
  readonly lockEndDate: number | null;
  readonly lockEndDateUtc: string | null;
  readonly amount: string | null;
  readonly amountWei: string | null;
  readonly claimedAmount: string | null;
  readonly claimedAmountWei: string | null;
  readonly stakedAmount: string | null;
  readonly stakedAmountWei: string | null;
  readonly slashedAmount: string | null;
  readonly slashedAmountWei: string | null;
  readonly unlockedAmount: string | null;
  readonly unlockedAmountWei: string | null;
  readonly claimable: string | null;
  readonly claimableWei: string | null;
  readonly vestingProgress: string | null;
}

function formatUtc(unixSeconds: number): string {
  const iso = new Date(unixSeconds * 1000).toISOString();
  return iso.endsWith('.000Z') ? iso.replace('.000Z', 'Z') : iso;
}

async function queryLock(
  provider: JsonRpcProvider,
  lockContract: string,
  wallet: string,
  decimals: number,
): Promise<LockResult> {
  const address = getAddress(wallet);

  try {
    const callData = LOCK_INTERFACE.encodeFunctionData('getLock', [address]);
    const result = await provider.call({ to: lockContract, data: callData });
    const decoded = LOCK_INTERFACE.decodeFunctionResult('getLock', result);

    const lock = decoded[0] as {
      timestamp: bigint;
      cliffDate: bigint;
      lockEndDate: bigint;
      amount: bigint;
      claimedAmount: bigint;
      stakedAmount: bigint;
      slashedAmount: bigint;
    };
    const unlockedAmount = decoded[1] as bigint;

    const amount = lock.amount;
    const claimed = lock.claimedAmount;
    const staked = lock.stakedAmount;
    const slashed = lock.slashedAmount;

    const unlockedNotClaimed = unlockedAmount > claimed ? unlockedAmount - claimed : 0n;
    const available = amount - claimed - staked - slashed;
    const claimableWei = available < unlockedNotClaimed ? available : unlockedNotClaimed;

    const vestingPct =
      amount > 0n
        ? ((Number(unlockedAmount) / Number(amount)) * 100).toFixed(1) + '%'
        : '0.0%';

    const ts = Number(lock.timestamp);
    const cliff = Number(lock.cliffDate);
    const lockEnd = Number(lock.lockEndDate);

    return {
      address,
      hasLock: true,
      timestamp: ts,
      timestampUtc: formatUtc(ts),
      cliffDate: cliff,
      cliffDateUtc: formatUtc(cliff),
      lockEndDate: lockEnd,
      lockEndDateUtc: formatUtc(lockEnd),
      amount: formatUnits(amount, decimals),
      amountWei: amount.toString(),
      claimedAmount: formatUnits(claimed, decimals),
      claimedAmountWei: claimed.toString(),
      stakedAmount: formatUnits(staked, decimals),
      stakedAmountWei: staked.toString(),
      slashedAmount: formatUnits(slashed, decimals),
      slashedAmountWei: slashed.toString(),
      unlockedAmount: formatUnits(unlockedAmount, decimals),
      unlockedAmountWei: unlockedAmount.toString(),
      claimable: formatUnits(claimableWei, decimals),
      claimableWei: claimableWei.toString(),
      vestingProgress: vestingPct,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // ethers v6 surfaces custom errors as hex selectors in the data field.
    // NoLock(address) selector = 0xd8216464
    if (message.includes('NoLock') || message.includes('0xd8216464')) {
      return {
        address,
        hasLock: false,
        timestamp: null, timestampUtc: null,
        cliffDate: null, cliffDateUtc: null,
        lockEndDate: null, lockEndDateUtc: null,
        amount: null, amountWei: null,
        claimedAmount: null, claimedAmountWei: null,
        stakedAmount: null, stakedAmountWei: null,
        slashedAmount: null, slashedAmountWei: null,
        unlockedAmount: null, unlockedAmountWei: null,
        claimable: null, claimableWei: null,
        vestingProgress: null,
      };
    }
    throw err;
  }
}

function printTable(results: LockResult[]): void {
  for (const r of results) {
    console.log(`\n--- ${r.address} ---`);
    if (!r.hasLock) {
      console.log('  hasLock: false');
      continue;
    }
    console.log(`  hasLock:         true`);
    console.log(`  timestamp:       ${r.timestamp} (${r.timestampUtc})`);
    console.log(`  cliffDate:       ${r.cliffDate} (${r.cliffDateUtc})`);
    console.log(`  lockEndDate:     ${r.lockEndDate} (${r.lockEndDateUtc})`);
    console.log(`  amount:          ${r.amount} OMA (${r.amountWei} wei)`);
    console.log(`  claimedAmount:   ${r.claimedAmount} OMA (${r.claimedAmountWei} wei)`);
    console.log(`  stakedAmount:    ${r.stakedAmount} OMA (${r.stakedAmountWei} wei)`);
    console.log(`  slashedAmount:   ${r.slashedAmount} OMA (${r.slashedAmountWei} wei)`);
    console.log(`  unlockedAmount:  ${r.unlockedAmount} OMA (${r.unlockedAmountWei} wei)`);
    console.log(`  claimable:       ${r.claimable} OMA (${r.claimableWei} wei)`);
    console.log(`  vestingProgress: ${r.vestingProgress}`);
  }
}

function printUsage(): void {
  console.log(
    'Usage:\n' +
    '  lock-status --wallet 0xabc... [0xdef...] [--network sepolia|mainnet] [--out <path>]\n' +
    '  lock-status --csv <wallets.csv> [--network sepolia|mainnet] [--out <path>]',
  );
}

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));
  const allowed = new Set([
    'help',
    'network',
    'wallet',
    'csv',
    'out',
    'rpc-url',
    'lock-contract',
    'allow-address-override',
  ]);
  assertNoUnknownOptions(parsed.options, allowed);

  if (parsed.options.has('help')) {
    printUsage();
    return;
  }

  const hasWalletFlag = parsed.options.has('wallet');
  const hasCsvFlag = parsed.options.has('csv');

  if (hasWalletFlag && hasCsvFlag) {
    throw new Error('Provide either --wallet or --csv, not both.');
  }
  if (!hasWalletFlag && !hasCsvFlag) {
    throw new Error('Provide --wallet <address...> or --csv <file>.');
  }

  let wallets: string[];

  if (hasWalletFlag) {
    const walletValue = parsed.options.get('wallet');
    const initial: string[] = [];
    if (typeof walletValue === 'string' && walletValue.trim() !== '') {
      initial.push(walletValue.trim());
    }
    // Positional args are additional wallet addresses
    wallets = [...initial, ...parsed.positionals];
    if (wallets.length === 0) {
      throw new Error('--wallet requires at least one address.');
    }
  } else {
    const csvPath = parsed.options.get('csv');
    if (typeof csvPath !== 'string' || csvPath.trim() === '') {
      throw new Error('--csv requires a file path.');
    }
    if (parsed.positionals.length > 0) {
      throw new Error(`Unexpected positional argument(s): ${parsed.positionals.join(' ')}`);
    }
    const csv = parseCsvFile(resolve(csvPath.trim()));
    requireHeaders(csv.headers, ['address']);
    wallets = csv.rows.map((row) => {
      const addr = row.values.address ?? '';
      if (addr === '') {
        throw new Error(`Line ${row.lineNumber}: address is required.`);
      }
      return addr;
    });
    if (wallets.length === 0) {
      throw new Error('CSV contains no data rows.');
    }
  }

  // Validate and deduplicate
  const seen = new Set<string>();
  const validated: string[] = [];
  for (const raw of wallets) {
    let addr: string;
    try {
      addr = getAddress(raw);
    } catch {
      throw new Error(`Invalid EVM address '${raw}'.`);
    }
    const lower = addr.toLowerCase();
    if (seen.has(lower)) {
      throw new Error(`Duplicate address '${addr}'.`);
    }
    seen.add(lower);
    validated.push(addr);
  }

  const networkNameRaw = getOptionalString(parsed.options, 'network') ?? 'sepolia';
  const network = getNetworkConfig(networkNameRaw);
  const rpcUrl = getRpcUrl(network.name as NetworkName, getOptionalString(parsed.options, 'rpc-url'));

  const provider = new JsonRpcProvider(rpcUrl);
  const providerNetwork = await provider.getNetwork();
  if (providerNetwork.chainId !== network.chainId) {
    throw new Error(
      `RPC chain ID mismatch. Expected ${network.chainId.toString()}, got ${providerNetwork.chainId.toString()}.`,
    );
  }

  let lockContract = network.omaLock;
  const lockOverride = getOptionalString(parsed.options, 'lock-contract');
  if (lockOverride) {
    if (!parsed.options.has('allow-address-override')) {
      throw new Error('Address override requested but --allow-address-override was not provided.');
    }
    lockContract = getAddress(lockOverride);
  }

  // Read decimals from on-chain token
  const omaTokenCallData = LOCK_INTERFACE.encodeFunctionData('omaToken', []);
  const omaTokenResult = await provider.call({ to: lockContract, data: omaTokenCallData });
  const omaTokenDecoded = LOCK_INTERFACE.decodeFunctionResult('omaToken', omaTokenResult);
  const omaToken = getAddress(omaTokenDecoded[0] as string);

  const decimalsCallData = TOKEN_INTERFACE.encodeFunctionData('decimals', []);
  const decimalsResult = await provider.call({ to: omaToken, data: decimalsCallData });
  const decimalsDecoded = TOKEN_INTERFACE.decodeFunctionResult('decimals', decimalsResult);
  const decimals = Number(decimalsDecoded[0] as bigint);

  console.log(`Network: ${network.name} (${network.chainId.toString()})`);
  console.log(`OMALock: ${lockContract}`);
  console.log(`OMA Token: ${omaToken} (decimals: ${decimals})`);
  console.log(`Querying ${validated.length} wallet(s)...`);

  const results: LockResult[] = [];
  for (const wallet of validated) {
    const result = await queryLock(provider, lockContract, wallet, decimals);
    results.push(result);
  }

  const outPath = getOptionalString(parsed.options, 'out');
  if (outPath) {
    const json = JSON.stringify(results, null, 2) + '\n';
    writeFileSync(resolve(outPath), json, 'utf8');
    console.log(`\nWrote ${results.length} result(s) to ${outPath}`);
  } else {
    printTable(results);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
