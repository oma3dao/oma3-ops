import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatUnits, getAddress, Interface, JsonRpcProvider, parseUnits } from 'ethers';
import { loadChainContext } from './chain.js';
import {
  assertNoUnknownOptions,
  getBooleanFlag,
  getOptionalString,
  getPositiveIntOption,
  getRequiredOption,
  parseCliArgs,
} from './cli-utils.js';
import { getNetworkConfig, OMA_TOTAL_SUPPLY_WEI, type NetworkName } from './config.js';
import { parseCsvFile, requireHeaders } from './csv-utils.js';
import { addUtcCalendarMonths, formatAnchorUtc, parseAnchorDateUtc, unixSeconds } from './date-utils.js';
import {
  batchFingerprint,
  keccakHexBytes,
  sha256Hex,
  shortFingerprint,
} from './hash-utils.js';
import {
  buildSafeBatchFile,
  buildSafeTransaction,
  type Operation,
  type SafeTransaction,
} from './safe-builder.js';
import { renderSummary, type SummaryTransaction, type WalletWarning } from './summary-builder.js';
import { getFixturePath, loadFixtures, saveFixtures, type KnownLockEntry } from './known-locks.js';

const UINT96_MAX = (1n << 96n) - 1n;
const UINT40_MAX = (1n << 40n) - 1n;
const LOCK_QUERY_ABI = [
  'function getLock(address wallet_) view returns (tuple(uint40 timestamp, uint40 cliffDate, uint40 lockEndDate, uint96 amount, uint96 claimedAmount, uint96 stakedAmount, uint96 slashedAmount) lock, uint96 unlockedAmount)',
] as const;
const LOCK_QUERY_INTERFACE = new Interface(LOCK_QUERY_ABI);

interface OnChainLockSnapshot {
  readonly amount: bigint;
  readonly stakedAmount: bigint;
}

export interface ParsedRow {
  readonly lineNumber: number;
  readonly address: string;
  readonly addressLower: string;
  readonly amount: string;
  readonly amountWei: bigint;
  readonly cliffOffsetMonths: number;
  readonly lockEndOffsetMonths: number;
  readonly cliffDate: number;
  readonly lockEndDate: number;
}

export interface ChunkPlan {
  readonly operation: Operation;
  readonly cliffDate: number;
  readonly lockEndDate: number;
  readonly rows: readonly ParsedRow[];
  readonly safeTx: SafeTransaction;
  readonly calldataHash: string;
  readonly totalWei: bigint;
}

async function queryLockSnapshot(
  provider: JsonRpcProvider,
  lockContract: string,
  wallet: string,
): Promise<OnChainLockSnapshot | null> {
  try {
    const callData = LOCK_QUERY_INTERFACE.encodeFunctionData('getLock', [wallet]);
    const result = await provider.call({ to: lockContract, data: callData });
    const decoded = LOCK_QUERY_INTERFACE.decodeFunctionResult('getLock', result);
    const lock = decoded[0] as {
      amount: bigint;
      stakedAmount: bigint;
    };
    return {
      amount: lock.amount,
      stakedAmount: lock.stakedAmount,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('NoLock') || message.includes('0xd8216464')) {
      return null;
    }
    throw err;
  }
}

async function preflightUpdateLocks(params: {
  readonly rows: readonly ParsedRow[];
  readonly rpcUrl: string;
  readonly lockContract: string;
  readonly decimals: number;
}): Promise<Map<string, bigint>> {
  const provider = new JsonRpcProvider(params.rpcUrl);
  const amountsByAddress = new Map<string, bigint>();
  const missingLocks: string[] = [];
  const stakedLocks: string[] = [];
  const amountMismatches: string[] = [];

  for (const row of params.rows) {
    const onChain = await queryLockSnapshot(provider, params.lockContract, row.address);
    if (!onChain) {
      missingLocks.push(`line ${row.lineNumber} ${row.address}`);
      continue;
    }
    amountsByAddress.set(row.addressLower, onChain.amount);

    if (onChain.stakedAmount > 0n) {
      stakedLocks.push(
        `line ${row.lineNumber} ${row.address} stakedAmountWei=${onChain.stakedAmount.toString()}`,
      );
    }

    if (onChain.amount !== row.amountWei) {
      const csvHuman = formatUnits(row.amountWei, params.decimals);
      const onChainHuman = formatUnits(onChain.amount, params.decimals);
      amountMismatches.push(
        `line ${row.lineNumber} ${row.address} csvWei=${row.amountWei.toString()} chainWei=${onChain.amount.toString()} csvHuman=${csvHuman} chainHuman=${onChainHuman}`,
      );
    }
  }

  // Staked wallets are warnings, not errors — updateLocks only changes dates
  if (stakedLocks.length > 0) {
    console.log(`WARNING: ${stakedLocks.length} wallet(s) have stakedAmount > 0:`);
    for (const value of stakedLocks) {
      console.log(`  ${value}`);
    }
  }

  if (missingLocks.length > 0 || amountMismatches.length > 0) {
    const lines: string[] = ['updateLocks preflight failed:'];
    if (missingLocks.length > 0) {
      lines.push(`- No lock on-chain (${missingLocks.length}):`);
      lines.push(...missingLocks.map((value) => `  ${value}`));
    }
    if (amountMismatches.length > 0) {
      lines.push(`- CSV amount mismatch vs on-chain amount (${amountMismatches.length}):`);
      lines.push(...amountMismatches.map((value) => `  ${value}`));
    }
    lines.push('No output files produced.');
    throw new Error(lines.join('\n'));
  }

  return amountsByAddress;
}

function requireInt(name: string, raw: string, lineNumber: number): number {
  if (!/^-?\d+$/.test(raw)) {
    throw new Error(`Line ${lineNumber}: ${name} must be an integer.`);
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Line ${lineNumber}: ${name} is out of safe integer range.`);
  }
  return value;
}

export function parseRows(params: {
  readonly csvPath: string;
  readonly anchorDate: Date;
  readonly decimals: number;
  readonly requireAmountWei: boolean;
}): {
  readonly rows: ParsedRow[];
  readonly amountWeiCheck: 'pass' | 'N/A';
  readonly rowsParsed: number;
} {
  const parsed = parseCsvFile(params.csvPath);
  requireHeaders(parsed.headers, [
    'address',
    'amount',
    'cliffOffsetMonths',
    'lockEndOffsetMonths',
  ]);

  const hasAmountWeiColumn = parsed.headers.includes('amountWei');
  if (params.requireAmountWei && !hasAmountWeiColumn) {
    throw new Error('CSV is missing required amountWei column (--require-amount-wei enabled).');
  }

  const rows: ParsedRow[] = [];
  const seenAddresses = new Set<string>();

  for (const row of parsed.rows) {
    const addressRaw = row.values.address ?? '';
    const amountRaw = row.values.amount ?? '';
    const cliffOffsetRaw = row.values.cliffOffsetMonths ?? '';
    const lockEndOffsetRaw = row.values.lockEndOffsetMonths ?? '';

    if (addressRaw === '') {
      throw new Error(`Line ${row.lineNumber}: address is required.`);
    }
    if (amountRaw === '') {
      throw new Error(`Line ${row.lineNumber}: amount is required.`);
    }
    if (cliffOffsetRaw === '') {
      throw new Error(`Line ${row.lineNumber}: cliffOffsetMonths is required.`);
    }
    if (lockEndOffsetRaw === '') {
      throw new Error(`Line ${row.lineNumber}: lockEndOffsetMonths is required.`);
    }

    let address: string;
    try {
      address = getAddress(addressRaw);
    } catch {
      throw new Error(`Line ${row.lineNumber}: invalid EVM address '${addressRaw}'.`);
    }

    const addressLower = address.toLowerCase();
    if (seenAddresses.has(addressLower)) {
      throw new Error(`Line ${row.lineNumber}: duplicate address '${address}'.`);
    }
    seenAddresses.add(addressLower);

    let amountWei: bigint;
    try {
      amountWei = parseUnits(amountRaw, params.decimals);
    } catch {
      throw new Error(`Line ${row.lineNumber}: invalid amount '${amountRaw}'.`);
    }

    if (amountWei <= 0n) {
      throw new Error(`Line ${row.lineNumber}: amount must be positive.`);
    }
    if (amountWei > UINT96_MAX) {
      throw new Error(`Line ${row.lineNumber}: amount exceeds uint96 max.`);
    }

    if (hasAmountWeiColumn) {
      const amountWeiRaw = row.values.amountWei ?? '';
      if (amountWeiRaw === '') {
        throw new Error(`Line ${row.lineNumber}: amountWei is blank but amountWei column is present.`);
      }
      if (!/^\d+$/.test(amountWeiRaw)) {
        throw new Error(`Line ${row.lineNumber}: amountWei must be an unsigned integer.`);
      }
      const parsedAmountWei = BigInt(amountWeiRaw);
      if (parsedAmountWei <= 0n) {
        throw new Error(`Line ${row.lineNumber}: amountWei must be positive.`);
      }
      if (parsedAmountWei !== amountWei) {
        throw new Error(
          `Line ${row.lineNumber}: amountWei mismatch. amount (${amountRaw}) -> ${amountWei.toString()}, csv amountWei is ${parsedAmountWei.toString()}.`,
        );
      }
    }

    const cliffOffsetMonths = requireInt('cliffOffsetMonths', cliffOffsetRaw, row.lineNumber);
    const lockEndOffsetMonths = requireInt(
      'lockEndOffsetMonths',
      lockEndOffsetRaw,
      row.lineNumber,
    );

    if (cliffOffsetMonths < 0) {
      throw new Error(`Line ${row.lineNumber}: cliffOffsetMonths must be >= 0.`);
    }
    if (lockEndOffsetMonths <= cliffOffsetMonths) {
      throw new Error(
        `Line ${row.lineNumber}: lockEndOffsetMonths must be > cliffOffsetMonths.`,
      );
    }

    const cliffDate = unixSeconds(addUtcCalendarMonths(params.anchorDate, cliffOffsetMonths));
    const lockEndDate = unixSeconds(
      addUtcCalendarMonths(params.anchorDate, lockEndOffsetMonths),
    );

    if (cliffDate <= 0) {
      throw new Error(`Line ${row.lineNumber}: resolved cliffDate must be > 0.`);
    }
    if (lockEndDate <= cliffDate) {
      throw new Error(`Line ${row.lineNumber}: resolved lockEndDate must be > cliffDate.`);
    }

    const cliffBig = BigInt(cliffDate);
    const lockEndBig = BigInt(lockEndDate);
    if (cliffBig > UINT40_MAX || lockEndBig > UINT40_MAX) {
      throw new Error(
        `Line ${row.lineNumber}: resolved timestamp exceeds uint40 max (${UINT40_MAX.toString()}).`,
      );
    }

    rows.push({
      lineNumber: row.lineNumber,
      address,
      addressLower,
      amount: amountRaw,
      amountWei,
      cliffOffsetMonths,
      lockEndOffsetMonths,
      cliffDate,
      lockEndDate,
    });
  }

  if (rows.length === 0) {
    throw new Error('CSV contains no data rows.');
  }

  return {
    rows,
    amountWeiCheck: hasAmountWeiColumn ? 'pass' : 'N/A',
    rowsParsed: rows.length,
  };
}

export function planChunks(params: {
  readonly operation: Operation;
  readonly rows: readonly ParsedRow[];
  readonly lockContract: string;
  readonly maxWalletsPerTx: number;
}): ChunkPlan[] {
  const parseGroupKey = (key: string): [number, number] => {
    const parts = key.split(':');
    if (parts.length !== 2) {
      throw new Error(`Invalid internal group key '${key}'.`);
    }
    const cliff = Number.parseInt(parts[0] ?? '', 10);
    const lockEnd = Number.parseInt(parts[1] ?? '', 10);
    if (!Number.isFinite(cliff) || !Number.isFinite(lockEnd)) {
      throw new Error(`Invalid internal group key '${key}'.`);
    }
    return [cliff, lockEnd];
  };

  const grouped = new Map<string, ParsedRow[]>();

  for (const row of params.rows) {
    const key = `${row.cliffDate}:${row.lockEndDate}`;
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      grouped.set(key, [row]);
    }
  }

  const groupKeys = [...grouped.keys()].sort((a, b) => {
    const [aCliff, aEnd] = parseGroupKey(a);
    const [bCliff, bEnd] = parseGroupKey(b);
    if (aCliff !== bCliff) return aCliff - bCliff;
    return aEnd - bEnd;
  });

  const plans: ChunkPlan[] = [];

  for (const key of groupKeys) {
    const rows = grouped.get(key) ?? [];
    rows.sort((left, right) => left.addressLower.localeCompare(right.addressLower));

    const [cliffDate, lockEndDate] = parseGroupKey(key);

    for (let index = 0; index < rows.length; index += params.maxWalletsPerTx) {
      const chunkRows = rows.slice(index, index + params.maxWalletsPerTx);
      const wallets = chunkRows.map((row) => row.address);
      const amountsWei = chunkRows.map((row) => row.amountWei);

      const safeTx = buildSafeTransaction({
        operation: params.operation,
        lockContract: params.lockContract,
        wallets,
        amountsWei,
        cliffDate,
        lockEndDate,
      });

      const totalWei = amountsWei.reduce((acc, value) => acc + value, 0n);
      const calldataHash = keccakHexBytes(safeTx.data);

      plans.push({
        operation: params.operation,
        cliffDate,
        lockEndDate,
        rows: chunkRows,
        safeTx,
        calldataHash,
        totalWei,
      });
    }
  }

  if (plans.length === 0) {
    throw new Error('No transactions generated after grouping/chunking.');
  }

  return plans;
}

function printUsage(operation: Operation): void {
  const command = operation === 'addLocks' ? 'lock-add-locks' : 'lock-update-locks';
  console.log(`Usage:\n  ${command} --anchor-date-utc <ISO-8601 UTC datetime> --csv <csv> --out-dir <dir> [--network sepolia|mainnet] [--max-wallets-per-tx 200] [--rpc-url <url>] [--allow-address-override --lock-contract <addr> --oma-token <addr>] [--require-amount-wei]`);
}

export async function runLockCommand(operation: Operation, argv: string[]): Promise<void> {
  const parsed = parseCliArgs(argv);
  const allowed = new Set([
    'help',
    'network',
    'anchor-date-utc',
    'csv',
    'out-dir',
    'max-wallets-per-tx',
    'rpc-url',
    'lock-contract',
    'oma-token',
    'allow-address-override',
    'require-amount-wei',
    'max-total-pct',
    'warn-wallet-pct',
  ]);
  assertNoUnknownOptions(parsed.options, allowed);

  if (parsed.positionals.length > 0) {
    throw new Error(`Unexpected positional argument(s): ${parsed.positionals.join(' ')}`);
  }

  if (parsed.options.has('help')) {
    printUsage(operation);
    return;
  }

  const networkNameRaw = getOptionalString(parsed.options, 'network') ?? 'sepolia';
  const networkName = getNetworkConfig(networkNameRaw).name as NetworkName;
  const anchorDateUtc = getRequiredOption(parsed.options, 'anchor-date-utc');
  const inputPath = resolve(getRequiredOption(parsed.options, 'csv'));
  const outDir = resolve(getRequiredOption(parsed.options, 'out-dir'));
  const maxWalletsPerTx = getPositiveIntOption(parsed.options, 'max-wallets-per-tx', 200);
  const rpcUrl = getOptionalString(parsed.options, 'rpc-url');
  const lockContractOverride = getOptionalString(parsed.options, 'lock-contract');
  const omaTokenOverride = getOptionalString(parsed.options, 'oma-token');
  const allowAddressOverride = getBooleanFlag(parsed.options, 'allow-address-override');
  const requireAmountWei = getBooleanFlag(parsed.options, 'require-amount-wei');

  const anchorDate = parseAnchorDateUtc(anchorDateUtc);
  const chainContextOptions = {
    networkName,
    allowAddressOverride,
    ...(rpcUrl ? { rpcUrl } : {}),
    ...(lockContractOverride ? { lockContractOverride } : {}),
    ...(omaTokenOverride ? { omaTokenOverride } : {}),
  };

  const chainContext = await loadChainContext(chainContextOptions);

  const { rows, amountWeiCheck, rowsParsed } = parseRows({
    csvPath: inputPath,
    anchorDate,
    decimals: chainContext.decimals,
    requireAmountWei,
  });

  const totalWei = rows.reduce((acc, row) => acc + row.amountWei, 0n);
  let updateLocksAmountsByAddress: Map<string, bigint> | undefined;

  if (operation === 'updateLocks') {
    console.log(`Preflight: verifying ${rows.length} wallet(s) against on-chain locks...`);
    updateLocksAmountsByAddress = await preflightUpdateLocks({
      rows,
      rpcUrl: chainContext.rpcUrl,
      lockContract: chainContext.lockContract,
      decimals: chainContext.decimals,
    });
    console.log('Preflight updateLocks checks: pass');
  }

  // Threshold checks (addLocks only)
  let maxTotalPct: number | undefined;
  let warnWalletPct: number | undefined;
  const walletWarnings: WalletWarning[] = [];

  if (operation === 'addLocks') {
    maxTotalPct = getPositiveIntOption(parsed.options, 'max-total-pct', 10);
    warnWalletPct = getPositiveIntOption(parsed.options, 'warn-wallet-pct', 1);

    // Hard error: total exceeds --max-total-pct of supply
    const maxTotalWei = OMA_TOTAL_SUPPLY_WEI * BigInt(maxTotalPct) / 100n;
    if (totalWei > maxTotalWei) {
      const totalHuman = formatUnits(totalWei, chainContext.decimals);
      const maxHuman = formatUnits(maxTotalWei, chainContext.decimals);
      throw new Error(
        `Total OMA (${totalHuman}) exceeds --max-total-pct ${maxTotalPct}% of total supply (${maxHuman} OMA). No output files produced.`,
      );
    }

    // Per-wallet warnings
    const warnWalletWei = OMA_TOTAL_SUPPLY_WEI * BigInt(warnWalletPct) / 100n;
    for (const row of rows) {
      if (row.amountWei > warnWalletWei) {
        const amountHuman = formatUnits(row.amountWei, chainContext.decimals);
        const pctNum = Number(row.amountWei * 10000n / OMA_TOTAL_SUPPLY_WEI) / 100;
        const pctOfSupply = pctNum.toFixed(2);
        walletWarnings.push({ address: row.address, amountHuman, pctOfSupply });
        console.log(`WARNING: ${row.address} allocated ${amountHuman} OMA (${pctOfSupply}% of total supply)`);
      }
    }
  }

  const chunks = planChunks({
    operation,
    rows,
    lockContract: chainContext.lockContract,
    maxWalletsPerTx,
  });

  const perTxHashes = chunks.map((chunk) => chunk.calldataHash);
  const fingerprint = batchFingerprint(perTxHashes);
  const short = shortFingerprint(fingerprint);

  const safeBatch = buildSafeBatchFile({
    chainId: chainContext.network.chainId,
    operation,
    shortFingerprint: short,
    transactions: chunks.map((chunk) => chunk.safeTx),
  });

  const safeJson = `${JSON.stringify(safeBatch, null, 2)}\n`;
  const jsonSha256 = sha256Hex(Buffer.from(safeJson, 'utf8'));

  const summaryTransactions: SummaryTransaction[] = chunks.map((chunk) => ({
    method: chunk.operation,
    cliffUnix: chunk.cliffDate,
    lockEndUnix: chunk.lockEndDate,
    wallets: chunk.rows.length,
    totalWei: chunk.totalWei,
    firstWallet: chunk.rows[0]?.address ?? '',
    lastWallet: chunk.rows[chunk.rows.length - 1]?.address ?? '',
    calldataHash: chunk.calldataHash,
  }));

  const transactionId = `${operation}-${short.replace(/^0x/, '')}`;

  const summary = renderSummary({
    transactionId,
    operation,
    networkName,
    chainId: chainContext.network.chainId,
    anchorDateUtc: formatAnchorUtc(anchorDate),
    lockContract: chainContext.lockContract,
    omaToken: chainContext.omaToken,
    inputCsv: inputPath,
    rowsParsed,
    transactions: summaryTransactions,
    maxWalletsPerTx,
    totalWallets: rows.length,
    totalWei,
    decimals: chainContext.decimals,
    jsonSha256,
    batchFingerprint: fingerprint,
    amountWeiCheck,
    maxTotalPct,
    warnWalletPct,
    walletWarnings: walletWarnings.length > 0 ? walletWarnings : undefined,
  });

  mkdirSync(outDir, { recursive: true });

  const safeJsonPath = resolve(outDir, 'safe-tx.json');
  const summaryPath = resolve(outDir, 'safe-tx.summary.txt');

  writeFileSync(safeJsonPath, safeJson, 'utf8');
  writeFileSync(summaryPath, summary, 'utf8');

  // Update known-locks fixture
  const fixturePath = getFixturePath(networkName);
  const existingEntries = loadFixtures(fixturePath);
  const sourceTag = `${operation === 'addLocks' ? 'addLocks' : 'updateLocks'}:${short.replace(/^0x/, '')}`;

  const newEntries: KnownLockEntry[] = rows.map((row) => {
    let amountWeiForFixture = row.amountWei;
    if (operation === 'updateLocks') {
      const onChainAmountWei = updateLocksAmountsByAddress?.get(row.addressLower);
      if (onChainAmountWei === undefined) {
        throw new Error(`Internal error: missing preflight lock amount for ${row.address}.`);
      }
      amountWeiForFixture = onChainAmountWei;
    }
    return {
      address: row.address,
      amount: formatUnits(amountWeiForFixture, chainContext.decimals),
      cliffDate: row.cliffDate,
      lockEndDate: row.lockEndDate,
      source: sourceTag,
    };
  });

  let updatedEntries: KnownLockEntry[];
  if (operation === 'addLocks') {
    updatedEntries = [...newEntries, ...existingEntries];
  } else {
    // updateLocks: remove existing entries for updated wallets, then prepend
    const updatedAddresses = new Set(rows.map((r) => r.addressLower));
    const filtered = existingEntries.filter(
      (e) => !updatedAddresses.has(e.address.toLowerCase()),
    );
    updatedEntries = [...newEntries, ...filtered];
  }

  saveFixtures(fixturePath, updatedEntries);

  console.log(`Generated ${operation} batch.`);
  console.log(`Network: ${networkName} (${chainContext.network.chainId.toString()})`);
  console.log(`Token decimals: ${chainContext.decimals}`);
  console.log(`Transactions: ${chunks.length}`);
  console.log(`Total wallets: ${rows.length}`);
  console.log(`Total OMA (human): ${formatUnits(totalWei, chainContext.decimals)}`);
  console.log(`safe-tx.json: ${safeJsonPath}`);
  console.log(`safe-tx.summary.txt: ${summaryPath}`);
}
