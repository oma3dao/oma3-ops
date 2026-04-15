import { formatUnits } from 'ethers';
import { relative, resolve } from 'node:path';
import { formatUtcSeconds, shortFingerprint } from './hash-utils.js';
import type { Operation } from './safe-builder.js';

/** Use repo-relative paths in summaries so committed artifacts do not embed absolute machine paths. */
export function formatInputCsvPathForSummary(inputPath: string): string {
  const abs = resolve(inputPath);
  const rel = relative(process.cwd(), abs);
  const display = rel && !rel.startsWith('..') ? rel : abs;
  return display.replace(/\\/g, '/');
}

export interface SummaryTransaction {
  readonly method: Operation;
  readonly cliffUnix: number;
  readonly lockEndUnix: number;
  readonly wallets: number;
  readonly totalWei: bigint;
  readonly firstWallet: string;
  readonly lastWallet: string;
  readonly calldataHash: string;
}

export interface WalletWarning {
  readonly address: string;
  readonly amountHuman: string;
  readonly pctOfSupply: string;
}

export interface SummaryParams {
  readonly transactionId: string;
  readonly operation: Operation;
  readonly networkName: string;
  readonly chainId: bigint;
  readonly anchorDateUtc: string;
  readonly lockContract: string;
  readonly omaToken: string;
  readonly inputCsv: string;
  readonly rowsParsed: number;
  readonly transactions: readonly SummaryTransaction[];
  readonly maxWalletsPerTx: number;
  readonly totalWallets: number;
  readonly totalWei: bigint;
  readonly decimals: number;
  readonly jsonSha256: string;
  readonly batchFingerprint: string;
  readonly amountWeiCheck: 'pass' | 'N/A';
  readonly maxTotalPct?: number | undefined;
  readonly warnWalletPct?: number | undefined;
  readonly walletWarnings?: readonly WalletWarning[] | undefined;
}

export function renderSummary(params: SummaryParams): string {
  const totalHuman = formatUnits(params.totalWei, params.decimals);
  const short = shortFingerprint(params.batchFingerprint);

  const lines: string[] = [];
  lines.push('OMA3 OPS TRANSACTION SUMMARY');
  lines.push(`Transaction ID: ${params.transactionId}`);
  lines.push(`Operation: ${params.operation}`);
  lines.push(`Network Name: ${params.networkName}`);
  lines.push(`Chain ID: ${params.chainId.toString()}`);
  lines.push(`Anchor Date UTC: ${params.anchorDateUtc}`);
  lines.push(`OMALock Contract: ${params.lockContract}`);
  lines.push(`OMA Token Contract: ${params.omaToken}`);
  lines.push(`Input CSV: ${formatInputCsvPathForSummary(params.inputCsv)}`);
  lines.push(`Rows Parsed: ${params.rowsParsed.toString()}`);
  lines.push('Validation: PASS');
  lines.push(`Transactions: ${params.transactions.length.toString()}`);
  lines.push(`Max Wallets Per Tx: ${params.maxWalletsPerTx.toString()}`);
  lines.push(`Total Wallets: ${params.totalWallets.toString()}`);
  lines.push(`Total OMA (human): ${totalHuman}`);
  lines.push(`Total OMA (wei): ${params.totalWei.toString()}`);
  lines.push(`JSON SHA256: ${params.jsonSha256}`);
  lines.push(`Batch Fingerprint: ${params.batchFingerprint} (short ${short})`);
  lines.push('');
  lines.push('TRANSACTIONS');

  params.transactions.forEach((tx, index) => {
    const totalOMA = formatUnits(tx.totalWei, params.decimals);
    lines.push(
      `- tx ${index + 1}: method=${tx.method} cliffUnix=${tx.cliffUnix.toString()} cliffUtc=${formatUtcSeconds(tx.cliffUnix)} lockEndUnix=${tx.lockEndUnix.toString()} lockEndUtc=${formatUtcSeconds(tx.lockEndUnix)} wallets=${tx.wallets.toString()} totalOMA=${totalOMA} totalWei=${tx.totalWei.toString()} firstWallet=${tx.firstWallet} lastWallet=${tx.lastWallet} calldataHash=${tx.calldataHash}`,
    );
  });

  lines.push('');
  lines.push('VALIDATION');
  lines.push(`- amountWei cross-check: ${params.amountWeiCheck}`);
  lines.push('- duplicate addresses: pass');
  lines.push('- offset resolution: pass');
  lines.push('- timestamp format: pass');

  lines.push('');
  lines.push('WARNINGS');

  const DEFAULT_MAX_TOTAL_PCT = 10;
  const DEFAULT_WARN_WALLET_PCT = 1;
  const warnings: string[] = [];

  if (params.maxTotalPct !== undefined && params.maxTotalPct !== DEFAULT_MAX_TOTAL_PCT) {
    warnings.push(`- WARNING: --max-total-pct set to ${params.maxTotalPct} (default: ${DEFAULT_MAX_TOTAL_PCT}). Verify this override is authorized.`);
  }
  if (params.warnWalletPct !== undefined && params.warnWalletPct !== DEFAULT_WARN_WALLET_PCT) {
    warnings.push(`- WARNING: --warn-wallet-pct set to ${params.warnWalletPct} (default: ${DEFAULT_WARN_WALLET_PCT}). Verify this override is authorized.`);
  }
  if (params.walletWarnings) {
    for (const w of params.walletWarnings) {
      warnings.push(`- ${w.address}: allocated ${w.amountHuman} OMA (${w.pctOfSupply}% of total supply)`);
    }
  }

  if (warnings.length === 0) {
    lines.push('- None');
  } else {
    lines.push(...warnings);
  }

  return `${lines.join('\n')}\n`;
}
