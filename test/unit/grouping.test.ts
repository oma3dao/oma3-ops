import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseRows, planChunks } from '../../src/run-lock-command.js';
import { buildSafeBatchFile } from '../../src/safe-builder.js';
import { renderSummary } from '../../src/summary-builder.js';
import {
  batchFingerprint,
  keccakHexBytes,
  sha256Hex,
  shortFingerprint,
} from '../../src/hash-utils.js';
import { formatAnchorUtc } from '../../src/date-utils.js';

const LOCK_CONTRACT = '0x2f38D6cCB480d5C7e68d11b5a02f2c2451543F58';
const ANCHOR = new Date('2025-01-31T00:00:00Z');
const DECIMALS = 18;

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'grouping-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeCsv(name: string, content: string): string {
  const path = join(tmpDir, name);
  writeFileSync(path, content, 'utf8');
  return path;
}

describe('grouping by (cliffDate, lockEndDate)', () => {
  it('rows grouped by (cliffDate, lockEndDate)', () => {
    const path = writeCsv('multi-group.csv', [
      'address,amount,cliffOffsetMonths,lockEndOffsetMonths',
      '0x0000000000000000000000000000000000000001,100,6,12',
      '0x0000000000000000000000000000000000000002,200,6,12',
      '0x0000000000000000000000000000000000000003,300,6,24',
      '0x0000000000000000000000000000000000000004,400,6,24',
    ].join('\n'));

    const { rows } = parseRows({
      csvPath: path,
      anchorDate: ANCHOR,
      decimals: DECIMALS,
      requireAmountWei: false,
    });

    const chunks = planChunks({
      operation: 'addLocks',
      rows,
      lockContract: LOCK_CONTRACT,
      maxWalletsPerTx: 200,
    });

    expect(chunks).toHaveLength(2);
  });

  it('groups sorted by cliffDate asc, then lockEndDate asc', () => {
    // Use different cliff offsets to get different cliffDates
    const path = writeCsv('sort-groups.csv', [
      'address,amount,cliffOffsetMonths,lockEndOffsetMonths',
      '0x0000000000000000000000000000000000000001,100,12,24',
      '0x0000000000000000000000000000000000000002,200,6,12',
    ].join('\n'));

    const { rows } = parseRows({
      csvPath: path,
      anchorDate: ANCHOR,
      decimals: DECIMALS,
      requireAmountWei: false,
    });

    const chunks = planChunks({
      operation: 'addLocks',
      rows,
      lockContract: LOCK_CONTRACT,
      maxWalletsPerTx: 200,
    });

    // The group with cliff=6months (earlier date) should be first
    expect(chunks[0]!.cliffDate).toBeLessThan(chunks[1]!.cliffDate);
  });

  it('rows within group sorted by lowercase address asc', () => {
    const path = writeCsv('sort-rows.csv', [
      'address,amount,cliffOffsetMonths,lockEndOffsetMonths',
      '0x0000000000000000000000000000000000000003,300,6,12',
      '0x0000000000000000000000000000000000000001,100,6,12',
      '0x0000000000000000000000000000000000000002,200,6,12',
    ].join('\n'));

    const { rows } = parseRows({
      csvPath: path,
      anchorDate: ANCHOR,
      decimals: DECIMALS,
      requireAmountWei: false,
    });

    const chunks = planChunks({
      operation: 'addLocks',
      rows,
      lockContract: LOCK_CONTRACT,
      maxWalletsPerTx: 200,
    });

    const addresses = chunks[0]!.rows.map((r) => r.addressLower);
    expect(addresses).toEqual([...addresses].sort());
  });
});

describe('chunking', () => {
  it('at max-wallets-per-tx boundary: 5 rows, max 2 per tx', () => {
    const path = writeCsv('chunk5.csv', [
      'address,amount,cliffOffsetMonths,lockEndOffsetMonths',
      '0x0000000000000000000000000000000000000001,100,6,12',
      '0x0000000000000000000000000000000000000002,200,6,12',
      '0x0000000000000000000000000000000000000003,300,6,12',
      '0x0000000000000000000000000000000000000004,400,6,12',
      '0x0000000000000000000000000000000000000005,500,6,12',
    ].join('\n'));

    const { rows } = parseRows({
      csvPath: path,
      anchorDate: ANCHOR,
      decimals: DECIMALS,
      requireAmountWei: false,
    });

    const chunks = planChunks({
      operation: 'addLocks',
      rows,
      lockContract: LOCK_CONTRACT,
      maxWalletsPerTx: 2,
    });

    expect(chunks).toHaveLength(3);
    expect(chunks[0]!.rows).toHaveLength(2);
    expect(chunks[1]!.rows).toHaveLength(2);
    expect(chunks[2]!.rows).toHaveLength(1);
  });

  it('exact boundary: 4 rows, max 2 per tx', () => {
    const path = writeCsv('chunk4.csv', [
      'address,amount,cliffOffsetMonths,lockEndOffsetMonths',
      '0x0000000000000000000000000000000000000001,100,6,12',
      '0x0000000000000000000000000000000000000002,200,6,12',
      '0x0000000000000000000000000000000000000003,300,6,12',
      '0x0000000000000000000000000000000000000004,400,6,12',
    ].join('\n'));

    const { rows } = parseRows({
      csvPath: path,
      anchorDate: ANCHOR,
      decimals: DECIMALS,
      requireAmountWei: false,
    });

    const chunks = planChunks({
      operation: 'addLocks',
      rows,
      lockContract: LOCK_CONTRACT,
      maxWalletsPerTx: 2,
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.rows).toHaveLength(2);
    expect(chunks[1]!.rows).toHaveLength(2);
  });

  it('single row produces single chunk', () => {
    const path = writeCsv('chunk1.csv', [
      'address,amount,cliffOffsetMonths,lockEndOffsetMonths',
      '0x0000000000000000000000000000000000000001,100,6,12',
    ].join('\n'));

    const { rows } = parseRows({
      csvPath: path,
      anchorDate: ANCHOR,
      decimals: DECIMALS,
      requireAmountWei: false,
    });

    const chunks = planChunks({
      operation: 'addLocks',
      rows,
      lockContract: LOCK_CONTRACT,
      maxWalletsPerTx: 200,
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.rows).toHaveLength(1);
  });

  it('all rows same group', () => {
    const path = writeCsv('same-group.csv', [
      'address,amount,cliffOffsetMonths,lockEndOffsetMonths',
      '0x0000000000000000000000000000000000000001,100,6,12',
      '0x0000000000000000000000000000000000000002,200,6,12',
      '0x0000000000000000000000000000000000000003,300,6,12',
    ].join('\n'));

    const { rows } = parseRows({
      csvPath: path,
      anchorDate: ANCHOR,
      decimals: DECIMALS,
      requireAmountWei: false,
    });

    const chunks = planChunks({
      operation: 'addLocks',
      rows,
      lockContract: LOCK_CONTRACT,
      maxWalletsPerTx: 200,
    });

    expect(chunks).toHaveLength(1);
  });
});

describe('determinism', () => {
  it('identical input produces identical output', () => {
    const csvContent = [
      'address,amount,cliffOffsetMonths,lockEndOffsetMonths',
      '0x0000000000000000000000000000000000000001,100,6,12',
      '0x0000000000000000000000000000000000000002,200,6,12',
      '0x0000000000000000000000000000000000000003,300,6,12',
    ].join('\n');

    function runPipeline() {
      const path = writeCsv(`det-${Date.now()}-${Math.random()}.csv`, csvContent);
      const { rows, amountWeiCheck, rowsParsed } = parseRows({
        csvPath: path,
        anchorDate: ANCHOR,
        decimals: DECIMALS,
        requireAmountWei: false,
      });

      const chunks = planChunks({
        operation: 'addLocks',
        rows,
        lockContract: LOCK_CONTRACT,
        maxWalletsPerTx: 200,
      });

      const perTxHashes = chunks.map((c) => c.calldataHash);
      const fp = batchFingerprint(perTxHashes);
      const short = shortFingerprint(fp);

      const safeBatch = buildSafeBatchFile({
        chainId: 11155111n,
        operation: 'addLocks',
        shortFingerprint: short,
        transactions: chunks.map((c) => c.safeTx),
      });

      const safeJson = `${JSON.stringify(safeBatch, null, 2)}\n`;
      const jsonSha = sha256Hex(Buffer.from(safeJson, 'utf8'));

      const summary = renderSummary({
        transactionId: `addLocks-${short.replace(/^0x/, '')}`,
        operation: 'addLocks',
        networkName: 'sepolia',
        chainId: 11155111n,
        anchorDateUtc: formatAnchorUtc(ANCHOR),
        lockContract: LOCK_CONTRACT,
        omaToken: '0xd7ee0eADb283eFB6d6e628De5E31A284183f4EDf',
        inputCsv: path,
        rowsParsed,
        transactions: chunks.map((c) => ({
          method: c.operation,
          cliffUnix: c.cliffDate,
          lockEndUnix: c.lockEndDate,
          wallets: c.rows.length,
          totalWei: c.totalWei,
          firstWallet: c.rows[0]!.address,
          lastWallet: c.rows[c.rows.length - 1]!.address,
          calldataHash: c.calldataHash,
        })),
        maxWalletsPerTx: 200,
        totalWallets: rows.length,
        totalWei: rows.reduce((acc, r) => acc + r.amountWei, 0n),
        decimals: DECIMALS,
        jsonSha256: jsonSha,
        batchFingerprint: fp,
        amountWeiCheck,
      });

      return { safeJson, summary };
    }

    const run1 = runPipeline();
    const run2 = runPipeline();

    expect(run1.safeJson).toBe(run2.safeJson);
    // Summary includes the input path which differs, so compare everything except that line
    const stripInputLine = (s: string) =>
      s.split('\n').filter((l) => !l.startsWith('Input CSV:')).join('\n');
    expect(stripInputLine(run1.summary)).toBe(stripInputLine(run2.summary));
  });
});
