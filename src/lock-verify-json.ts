#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatUnits, getAddress, Interface, JsonRpcProvider } from 'ethers';
import {
  assertNoUnknownOptions,
  getOptionalString,
  parseCliArgs,
} from './cli-utils.js';
import { getNetworkConfig, getRpcUrl, type NetworkName } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOCK_ABI = [
  'function getLock(address wallet_) view returns (tuple(uint40 timestamp, uint40 cliffDate, uint40 lockEndDate, uint96 amount, uint96 claimedAmount, uint96 stakedAmount, uint96 slashedAmount) lock, uint96 unlockedAmount)',
  'function omaToken() view returns (address)',
] as const;

const TOKEN_ABI = ['function decimals() view returns (uint8)'] as const;

const LOCK_INTERFACE = new Interface(LOCK_ABI);
const TOKEN_INTERFACE = new Interface(TOKEN_ABI);

interface FixtureEntry {
  address: string;
  amount: string;
  cliffDate: number;
  lockEndDate: number;
  source: string;
}

function getFixturePath(networkName: string): string {
  // Resolve relative to project root (src/../data/)
  const projectRoot = resolve(__dirname, '..');
  return resolve(projectRoot, 'data', `${networkName}-known-locks.json`);
}

function loadFixtures(path: string): FixtureEntry[] {
  const raw = readFileSync(path, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Fixture file is not a JSON array: ${path}`);
  }
  return parsed as FixtureEntry[];
}

function saveFixtures(path: string, entries: FixtureEntry[]): void {
  writeFileSync(path, JSON.stringify(entries, null, 2) + '\n', 'utf8');
}

interface OnChainLock {
  hasLock: boolean;
  amount: string;
  cliffDate: number;
  lockEndDate: number;
}

async function queryOnChain(
  provider: JsonRpcProvider,
  lockContract: string,
  address: string,
  decimals: number,
): Promise<OnChainLock> {
  try {
    const callData = LOCK_INTERFACE.encodeFunctionData('getLock', [address]);
    const result = await provider.call({ to: lockContract, data: callData });
    const decoded = LOCK_INTERFACE.decodeFunctionResult('getLock', result);
    const lock = decoded[0] as {
      amount: bigint;
      cliffDate: bigint;
      lockEndDate: bigint;
    };
    return {
      hasLock: true,
      amount: formatUnits(lock.amount, decimals),
      cliffDate: Number(lock.cliffDate),
      lockEndDate: Number(lock.lockEndDate),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('NoLock') || message.includes('0xd8216464')) {
      return { hasLock: false, amount: '0', cliffDate: 0, lockEndDate: 0 };
    }
    throw err;
  }
}

function printUsage(): void {
  console.log(
    'Usage:\n' +
    '  lock-verify-json --network <sepolia|mainnet> [--auto-fix] [--dry-run]',
  );
}

async function main(): Promise<void> {
  const parsed = parseCliArgs(process.argv.slice(2));
  const allowed = new Set(['help', 'network', 'auto-fix', 'dry-run', 'rpc-url']);
  assertNoUnknownOptions(parsed.options, allowed);

  if (parsed.options.has('help')) {
    printUsage();
    return;
  }

  const networkNameRaw = getOptionalString(parsed.options, 'network') ?? 'sepolia';
  const network = getNetworkConfig(networkNameRaw);
  const rpcUrl = getRpcUrl(network.name as NetworkName, getOptionalString(parsed.options, 'rpc-url'));

  // Determine mode: auto-fix vs dry-run
  const hasAutoFix = parsed.options.has('auto-fix');
  const hasDryRun = parsed.options.has('dry-run');
  if (hasAutoFix && hasDryRun) {
    throw new Error('Cannot specify both --auto-fix and --dry-run.');
  }

  let autoFix: boolean;
  if (hasAutoFix) {
    autoFix = true;
  } else if (hasDryRun) {
    autoFix = false;
  } else {
    // Default: auto-fix for sepolia, dry-run for mainnet
    autoFix = network.name === 'sepolia';
  }

  const fixturePath = getFixturePath(network.name);
  let entries: FixtureEntry[];
  try {
    entries = loadFixtures(fixturePath);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load fixture file ${fixturePath}: ${message}`);
  }

  if (entries.length === 0) {
    console.log(`Fixture file is empty: ${fixturePath}`);
    return;
  }

  const provider = new JsonRpcProvider(rpcUrl);
  const providerNetwork = await provider.getNetwork();
  if (providerNetwork.chainId !== network.chainId) {
    throw new Error(
      `RPC chain ID mismatch. Expected ${network.chainId.toString()}, got ${providerNetwork.chainId.toString()}.`,
    );
  }

  // Read decimals
  const omaTokenCallData = LOCK_INTERFACE.encodeFunctionData('omaToken', []);
  const omaTokenResult = await provider.call({ to: network.omaLock, data: omaTokenCallData });
  const omaTokenDecoded = LOCK_INTERFACE.decodeFunctionResult('omaToken', omaTokenResult);
  const omaToken = getAddress(omaTokenDecoded[0] as string);

  const decimalsCallData = TOKEN_INTERFACE.encodeFunctionData('decimals', []);
  const decimalsResult = await provider.call({ to: omaToken, data: decimalsCallData });
  const decimalsDecoded = TOKEN_INTERFACE.decodeFunctionResult('decimals', decimalsResult);
  const decimals = Number(decimalsDecoded[0] as bigint);

  console.log(`Network: ${network.name} (${network.chainId.toString()})`);
  console.log(`Mode: ${autoFix ? 'auto-fix' : 'dry-run'}`);
  console.log(`Fixture: ${fixturePath}`);
  console.log(`Entries: ${entries.length}`);
  console.log(`Verifying...\n`);

  let okCount = 0;
  let mismatchCount = 0;
  let missingCount = 0;
  const kept: FixtureEntry[] = [];

  for (const entry of entries) {
    const onChain = await queryOnChain(provider, network.omaLock, entry.address, decimals);

    if (!onChain.hasLock) {
      missingCount++;
      console.log(`MISSING  ${entry.address} — no lock on-chain`);
      // In auto-fix mode, omit from kept (removes from fixture)
      if (!autoFix) {
        kept.push(entry);
      }
      continue;
    }

    const amountMatch = onChain.amount === entry.amount;
    const cliffMatch = onChain.cliffDate === entry.cliffDate;
    const lockEndMatch = onChain.lockEndDate === entry.lockEndDate;

    if (amountMatch && cliffMatch && lockEndMatch) {
      okCount++;
      console.log(`OK       ${entry.address}`);
      kept.push(entry);
    } else {
      mismatchCount++;
      const diffs: string[] = [];
      if (!amountMatch) diffs.push(`amount: fixture=${entry.amount} chain=${onChain.amount}`);
      if (!cliffMatch) diffs.push(`cliffDate: fixture=${entry.cliffDate} chain=${onChain.cliffDate}`);
      if (!lockEndMatch) diffs.push(`lockEndDate: fixture=${entry.lockEndDate} chain=${onChain.lockEndDate}`);
      console.log(`MISMATCH ${entry.address} — ${diffs.join(', ')}`);

      if (autoFix) {
        // Update entry with on-chain values
        kept.push({
          ...entry,
          amount: onChain.amount,
          cliffDate: onChain.cliffDate,
          lockEndDate: onChain.lockEndDate,
          source: `verified:${entry.source}`,
        });
      } else {
        kept.push(entry);
      }
    }
  }

  console.log(`\nResults: ${okCount} OK, ${mismatchCount} mismatch, ${missingCount} missing`);

  if (autoFix && (mismatchCount > 0 || missingCount > 0)) {
    saveFixtures(fixturePath, kept);
    console.log(`Fixture updated: ${kept.length} entries written to ${fixturePath}`);
  } else if (!autoFix && (mismatchCount > 0 || missingCount > 0)) {
    console.log(`Dry-run: no changes written. Use --auto-fix to update the fixture file.`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
