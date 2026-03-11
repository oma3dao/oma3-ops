import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { formatUnits, getAddress, Interface, JsonRpcProvider } from 'ethers';
import {
  assertNoUnknownOptions,
  getBooleanFlag,
  getOptionalString,
  getRequiredOption,
  parseCliArgs,
} from './cli-utils.js';
import { getNetworkConfig, getRpcUrl, type NetworkName } from './config.js';
import { loadChainContext } from './chain.js';
import { parseCsvFile, requireHeaders } from './csv-utils.js';
import {
  buildSlashTransaction,
  buildSlashStakeTransaction,
  buildSafeBatchFile,
  type SafeTransaction,
} from './safe-builder.js';
import {
  batchFingerprint,
  keccakHexBytes,
  sha256Hex,
  shortFingerprint,
} from './hash-utils.js';

type SlashOperation = 'slash' | 'slashStake';

const LOCK_ABI = [
  'function getLock(address wallet_) view returns (tuple(uint40 timestamp, uint40 cliffDate, uint40 lockEndDate, uint96 amount, uint96 claimedAmount, uint96 stakedAmount, uint96 slashedAmount) lock, uint96 unlockedAmount)',
] as const;

const LOCK_QUERY_INTERFACE = new Interface(LOCK_ABI);

interface OnChainLock {
  readonly timestamp: bigint;
  readonly amount: bigint;
  readonly claimedAmount: bigint;
  readonly stakedAmount: bigint;
  readonly slashedAmount: bigint;
}

async function queryLockRaw(
  provider: JsonRpcProvider,
  lockContract: string,
  wallet: string,
): Promise<OnChainLock | null> {
  const address = getAddress(wallet);
  try {
    const callData = LOCK_QUERY_INTERFACE.encodeFunctionData('getLock', [address]);
    const result = await provider.call({ to: lockContract, data: callData });
    const decoded = LOCK_QUERY_INTERFACE.decodeFunctionResult('getLock', result);
    const lock = decoded[0] as {
      timestamp: bigint;
      amount: bigint;
      claimedAmount: bigint;
      stakedAmount: bigint;
      slashedAmount: bigint;
    };
    return {
      timestamp: lock.timestamp,
      amount: lock.amount,
      claimedAmount: lock.claimedAmount,
      stakedAmount: lock.stakedAmount,
      slashedAmount: lock.slashedAmount,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('NoLock') || message.includes('0xd8216464')) {
      return null;
    }
    throw err;
  }
}

interface SlashRow {
  readonly address: string;
  readonly addressLower: string;
  readonly stakedAmountWei: bigint;
  readonly remainingWei: bigint;
}

interface SlashSummaryTx {
  readonly wallet: string;
  readonly amountWei: bigint;
  readonly calldataHash: string;
}

function printUsage(operation: SlashOperation): void {
  const cmd = operation === 'slash' ? 'lock-slash' : 'lock-slash-stake';
  console.log(
    `Usage:\n  ${cmd} --csv <wallets.csv> --to <destination> --out-dir <dir> [--network sepolia|mainnet]`,
  );
}

function renderSlashSummary(params: {
  readonly transactionId: string;
  readonly operation: SlashOperation;
  readonly networkName: string;
  readonly chainId: bigint;
  readonly lockContract: string;
  readonly omaToken: string;
  readonly inputCsv: string;
  readonly to: string;
  readonly rowsParsed: number;
  readonly transactions: readonly SlashSummaryTx[];
  readonly totalWallets: number;
  readonly totalWei: bigint;
  readonly decimals: number;
  readonly jsonSha256: string;
  readonly batchFingerprintFull: string;
}): string {
  const totalHuman = formatUnits(params.totalWei, params.decimals);
  const short = shortFingerprint(params.batchFingerprintFull);

  const lines: string[] = [];
  lines.push('OMA3 OPS TRANSACTION SUMMARY');
  lines.push(`Transaction ID: ${params.transactionId}`);
  lines.push(`Operation: ${params.operation}`);
  lines.push(`Network Name: ${params.networkName}`);
  lines.push(`Chain ID: ${params.chainId.toString()}`);
  lines.push(`OMALock Contract: ${params.lockContract}`);
  lines.push(`OMA Token Contract: ${params.omaToken}`);
  lines.push(`Destination (--to): ${params.to}`);
  lines.push(`Input CSV: ${params.inputCsv}`);
  lines.push(`Rows Parsed: ${params.rowsParsed.toString()}`);
  lines.push('Validation: PASS');
  lines.push(`Transactions: ${params.transactions.length.toString()}`);
  lines.push(`Total Wallets: ${params.totalWallets.toString()}`);
  lines.push(`Total OMA (human): ${totalHuman}`);
  lines.push(`Total OMA (wei): ${params.totalWei.toString()}`);
  lines.push(`JSON SHA256: ${params.jsonSha256}`);
  lines.push(`Batch Fingerprint: ${params.batchFingerprintFull} (short ${short})`);
  lines.push('');
  lines.push('TRANSACTIONS');

  const method = params.operation;
  params.transactions.forEach((tx, index) => {
    const amountHuman = formatUnits(tx.amountWei, params.decimals);
    lines.push(
      `- tx ${index + 1}: method=${method} wallet=${tx.wallet} amount=${amountHuman} amountWei=${tx.amountWei.toString()} to=${params.to} calldataHash=${tx.calldataHash}`,
    );
  });

  lines.push('');
  lines.push('VALIDATION');
  lines.push('- duplicate addresses: pass');
  lines.push('- on-chain lock check: pass');

  lines.push('');
  lines.push('WARNINGS');
  lines.push('- None');

  return `${lines.join('\n')}\n`;
}

export async function runSlashCommand(
  operation: SlashOperation,
  argv: string[],
): Promise<void> {
  const parsed = parseCliArgs(argv);
  const allowed = new Set([
    'help',
    'network',
    'csv',
    'to',
    'out-dir',
    'rpc-url',
    'lock-contract',
    'oma-token',
    'allow-address-override',
    'slash-all',
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
  const inputPath = resolve(getRequiredOption(parsed.options, 'csv'));
  const to = getRequiredOption(parsed.options, 'to');
  const outDir = resolve(getRequiredOption(parsed.options, 'out-dir'));
  const rpcUrl = getOptionalString(parsed.options, 'rpc-url');
  const lockContractOverride = getOptionalString(parsed.options, 'lock-contract');
  const omaTokenOverride = getOptionalString(parsed.options, 'oma-token');
  const allowAddressOverride = getBooleanFlag(parsed.options, 'allow-address-override');

  let toAddress: string;
  try {
    toAddress = getAddress(to);
  } catch {
    throw new Error(`Invalid --to address '${to}'.`);
  }

  const chainContext = await loadChainContext({
    networkName,
    allowAddressOverride,
    ...(rpcUrl ? { rpcUrl } : {}),
    ...(lockContractOverride ? { lockContractOverride } : {}),
    ...(omaTokenOverride ? { omaTokenOverride } : {}),
  });

  // Parse CSV
  const csv = parseCsvFile(inputPath);
  requireHeaders(csv.headers, ['address']);

  const hasStakedAmountColumn = csv.headers.includes('stakedAmount');
  if (operation === 'slashStake' && !hasStakedAmountColumn) {
    throw new Error(
      "CSV missing required header 'stakedAmount' for slashStake. Include the column with positive wei values (explicit mode) or blank values with --slash-all (full mode).",
    );
  }

  const slashAll = getBooleanFlag(parsed.options, 'slash-all');
  if (slashAll && operation !== 'slashStake') {
    throw new Error('--slash-all is only valid for slashStake.');
  }

  const seenAddresses = new Set<string>();
  const wallets: Array<{ address: string; addressLower: string; csvStakedAmountWei: bigint | undefined; lineNumber: number }> = [];

  let blankCount = 0;
  let positiveCount = 0;

  for (const row of csv.rows) {
    const addressRaw = row.values.address ?? '';
    if (addressRaw === '') {
      throw new Error(`Line ${row.lineNumber}: address is required.`);
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

    let csvStakedAmountWei: bigint | undefined;
    if (operation === 'slashStake') {
      const stakedRaw = row.values.stakedAmount ?? '';
      if (stakedRaw === '') {
        blankCount += 1;
      } else {
        let parsed: bigint;
        try {
          parsed = BigInt(stakedRaw);
        } catch {
          throw new Error(`Line ${row.lineNumber}: invalid stakedAmount '${stakedRaw}'. Must be a positive wei integer or blank.`);
        }
        if (parsed === 0n) {
          throw new Error(`Line ${row.lineNumber}: stakedAmount must be positive or blank (0 is not valid).`);
        }
        if (parsed < 0n) {
          throw new Error(`Line ${row.lineNumber}: stakedAmount must be positive or blank.`);
        }
        positiveCount += 1;
        csvStakedAmountWei = parsed;
      }
    }

    wallets.push({ address, addressLower, csvStakedAmountWei, lineNumber: row.lineNumber });
  }

  // Validate slash-stake mode consistency
  if (operation === 'slashStake') {
    if (blankCount > 0 && positiveCount > 0) {
      throw new Error(
        `Mixed stakedAmount values: ${blankCount} blank and ${positiveCount} with amounts. All rows must be blank (full mode with --slash-all) or all must have positive values (explicit mode).`,
      );
    }
    if (blankCount > 0 && !slashAll) {
      throw new Error(
        'All stakedAmount values are blank. Provide --slash-all to confirm full staked amount slash for every wallet.',
      );
    }
    if (slashAll && positiveCount > 0) {
      throw new Error(
        '--slash-all requires all stakedAmount values to be blank.',
      );
    }
  }

  if (wallets.length === 0) {
    throw new Error('CSV contains no data rows.');
  }

  // Sort by lowercase address for deterministic output
  wallets.sort((a, b) => a.addressLower.localeCompare(b.addressLower));

  // Query on-chain state and validate
  const network = getNetworkConfig(networkName);
  const providerRpcUrl = getRpcUrl(network.name, rpcUrl);
  const provider = new JsonRpcProvider(providerRpcUrl);

  console.log(`Network: ${networkName} (${network.chainId.toString()})`);
  console.log(`OMALock: ${chainContext.lockContract}`);
  console.log(`Destination (--to): ${toAddress}`);
  console.log(`Querying ${wallets.length} wallet(s) on-chain...`);

  const rows: SlashRow[] = [];
  const walletsWithStake: string[] = [];

  for (const w of wallets) {
    const lock = await queryLockRaw(provider, chainContext.lockContract, w.address);

    if (lock === null) {
      throw new Error(`${w.address}: no lock record on-chain. Cannot ${operation}.`);
    }

    if (operation === 'slash') {
      if (lock.stakedAmount > 0n) {
        walletsWithStake.push(
          `${w.address} (stakedAmount: ${formatUnits(lock.stakedAmount, chainContext.decimals)} OMA / ${lock.stakedAmount.toString()} wei)`,
        );
      }
      const remaining = lock.amount - lock.claimedAmount - lock.slashedAmount;
      rows.push({
        address: w.address,
        addressLower: w.addressLower,
        stakedAmountWei: lock.stakedAmount,
        remainingWei: remaining > 0n ? remaining : 0n,
      });
    } else {
      // slashStake
      if (lock.stakedAmount === 0n) {
        throw new Error(`${w.address}: stakedAmount is 0 on-chain. Nothing to slash-stake.`);
      }

      let amountToSlash: bigint;
      if (slashAll) {
        // Full mode: use on-chain stakedAmount
        amountToSlash = lock.stakedAmount;
      } else {
        // Explicit mode: use CSV value, validated against on-chain
        const csvStakedAmountWei = w.csvStakedAmountWei;
        if (csvStakedAmountWei === undefined) {
          throw new Error(`${w.address}: internal error — missing CSV stakedAmount in explicit mode.`);
        }
        if (csvStakedAmountWei > lock.stakedAmount) {
          throw new Error(
            `${w.address}: CSV stakedAmount (${csvStakedAmountWei.toString()} wei) exceeds on-chain stakedAmount (${lock.stakedAmount.toString()} wei).`,
          );
        }
        amountToSlash = csvStakedAmountWei;
      }

      rows.push({
        address: w.address,
        addressLower: w.addressLower,
        stakedAmountWei: amountToSlash,
        remainingWei: amountToSlash,
      });
    }
  }

  // For slash: hard error if any wallet has staked tokens
  if (operation === 'slash' && walletsWithStake.length > 0) {
    const details = walletsWithStake.join('\n  ');
    throw new Error(
      `Cannot slash wallets with staked tokens. Run lock-slash-stake first for:\n  ${details}`,
    );
  }

  // Build Safe transactions (one per wallet)
  const safeTxs: SafeTransaction[] = [];
  const summaryTxs: SlashSummaryTx[] = [];

  for (const row of rows) {
    let safeTx: SafeTransaction;
    let amountWei: bigint;

    if (operation === 'slash') {
      safeTx = buildSlashTransaction({
        lockContract: chainContext.lockContract,
        wallet: row.address,
        to: toAddress,
      });
      amountWei = row.remainingWei;
    } else {
      safeTx = buildSlashStakeTransaction({
        lockContract: chainContext.lockContract,
        wallet: row.address,
        amountWei: row.stakedAmountWei,
        to: toAddress,
      });
      amountWei = row.stakedAmountWei;
    }

    const calldataHash = keccakHexBytes(safeTx.data);
    safeTxs.push(safeTx);
    summaryTxs.push({ wallet: row.address, amountWei, calldataHash });
  }

  const perTxHashes = summaryTxs.map((tx) => tx.calldataHash);
  const fingerprint = batchFingerprint(perTxHashes);
  const short = shortFingerprint(fingerprint);

  const safeBatch = buildSafeBatchFile({
    chainId: chainContext.network.chainId,
    operation,
    shortFingerprint: short,
    transactions: safeTxs,
  });

  const safeJson = `${JSON.stringify(safeBatch, null, 2)}\n`;
  const jsonSha256 = sha256Hex(Buffer.from(safeJson, 'utf8'));

  const totalWei = summaryTxs.reduce((acc, tx) => acc + tx.amountWei, 0n);
  const transactionId = `${operation}-${short.replace(/^0x/, '')}`;

  const summary = renderSlashSummary({
    transactionId,
    operation,
    networkName,
    chainId: chainContext.network.chainId,
    lockContract: chainContext.lockContract,
    omaToken: chainContext.omaToken,
    inputCsv: inputPath,
    to: toAddress,
    rowsParsed: wallets.length,
    transactions: summaryTxs,
    totalWallets: wallets.length,
    totalWei,
    decimals: chainContext.decimals,
    jsonSha256,
    batchFingerprintFull: fingerprint,
  });

  mkdirSync(outDir, { recursive: true });

  const safeJsonPath = resolve(outDir, 'safe-tx.json');
  const summaryPath = resolve(outDir, 'safe-tx.summary.txt');

  writeFileSync(safeJsonPath, safeJson, 'utf8');
  writeFileSync(summaryPath, summary, 'utf8');

  const cliCommand = operation === 'slash' ? 'lock-slash' : 'lock-slash-stake';
  console.log(`Generated ${cliCommand} batch.`);
  console.log(`Network: ${networkName} (${chainContext.network.chainId.toString()})`);
  console.log(`Token decimals: ${chainContext.decimals}`);
  console.log(`Transactions: ${safeTxs.length}`);
  console.log(`Total wallets: ${wallets.length}`);
  console.log(`Total OMA (human): ${formatUnits(totalWei, chainContext.decimals)}`);
  console.log(`safe-tx.json: ${safeJsonPath}`);
  console.log(`safe-tx.summary.txt: ${summaryPath}`);
}
