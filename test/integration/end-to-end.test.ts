import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { runLockCommand } from '../../src/run-lock-command.js';
import { keccakHexBytes, batchFingerprint } from '../../src/hash-utils.js';
import { assertNoUnknownOptions } from '../../src/cli-utils.js';

const RPC_URL = process.env.OMA3_OPS_RPC_URL_SEPOLIA;

const describeIf = RPC_URL ? describe : describe.skip;

let tmpDir: string;
let outDir: string;

function fixturesDir(): string {
  return resolve(process.cwd(), 'test', 'fixtures');
}

function makeArgs(overrides: Record<string, string | undefined> = {}): string[] {
  const defaults: Record<string, string> = {
    '--anchor-date-utc': '2025-01-31T00:00:00Z',
    '--csv': join(fixturesDir(), 'valid-3-wallets.csv'),
    '--out-dir': outDir,
    '--network': 'sepolia',
    '--rpc-url': RPC_URL!,
  };

  const merged = { ...defaults, ...overrides };
  const args: string[] = [];
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined) {
      args.push(key, value);
    }
  }
  return args;
}

describeIf('end-to-end integration', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'e2e-test-'));
    outDir = join(tmpDir, 'output');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('basic addLocks generation: 3-wallet CSV', async () => {
    await runLockCommand('addLocks', makeArgs());

    const jsonPath = join(outDir, 'safe-tx.json');
    const summaryPath = join(outDir, 'safe-tx.summary.txt');
    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(summaryPath)).toBe(true);

    const safeBatch = JSON.parse(readFileSync(jsonPath, 'utf8'));
    expect(safeBatch.transactions).toHaveLength(1);

    // 3 wallets in calldata — verify by checking contractInputsValues
    const tx = safeBatch.transactions[0];
    const wallets = JSON.parse(tx.contractInputsValues.wallets_);
    expect(wallets).toHaveLength(3);

    // Verify summary contains expected content
    const summary = readFileSync(summaryPath, 'utf8');
    expect(summary).toContain('OMA3 OPS TRANSACTION SUMMARY');
    expect(summary).toContain('Operation: addLocks');
    expect(summary).toContain('Total Wallets: 3');
  });

  it('addLocks with multiple groups', async () => {
    await runLockCommand('addLocks', makeArgs({
      '--csv': join(fixturesDir(), 'valid-4-wallets-multi-group.csv'),
    }));

    const jsonPath = join(outDir, 'safe-tx.json');
    const safeBatch = JSON.parse(readFileSync(jsonPath, 'utf8'));
    expect(safeBatch.transactions).toHaveLength(2);
  });

  it('addLocks with chunking', async () => {
    await runLockCommand('addLocks', [
      ...makeArgs({
        '--csv': join(fixturesDir(), 'valid-5-wallets.csv'),
      }),
      '--max-wallets-per-tx', '2',
    ]);

    const jsonPath = join(outDir, 'safe-tx.json');
    const safeBatch = JSON.parse(readFileSync(jsonPath, 'utf8'));
    expect(safeBatch.transactions).toHaveLength(3);
  });

  it('updateLocks generation', async () => {
    await runLockCommand('updateLocks', makeArgs({
      '--csv': join(fixturesDir(), 'valid-2-wallets.csv'),
    }));

    const jsonPath = join(outDir, 'safe-tx.json');
    const summaryPath = join(outDir, 'safe-tx.summary.txt');
    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(summaryPath)).toBe(true);

    const safeBatch = JSON.parse(readFileSync(jsonPath, 'utf8'));

    expect(safeBatch.transactions.length).toBeGreaterThan(0);
    const tx = safeBatch.transactions[0];
    expect(tx.contractMethod.name).toBe('updateLocks');
    // updateLocks should not have amounts_
    expect(tx.contractInputsValues).not.toHaveProperty('amounts_');

    // Verify summary reflects updateLocks
    const summary = readFileSync(summaryPath, 'utf8');
    expect(summary).toContain('Operation: updateLocks');
  });

  it('SHA256 in summary matches file', async () => {
    await runLockCommand('addLocks', makeArgs());

    const jsonPath = join(outDir, 'safe-tx.json');
    const summaryPath = join(outDir, 'safe-tx.summary.txt');

    const jsonContent = readFileSync(jsonPath, 'utf8');
    const expectedSha = createHash('sha256').update(Buffer.from(jsonContent, 'utf8')).digest('hex');

    const summary = readFileSync(summaryPath, 'utf8');
    const shaLine = summary.split('\n').find((l) => l.startsWith('JSON SHA256:'));
    expect(shaLine).toContain(expectedSha);
  });

  it('batch fingerprint matches per-tx hashes', async () => {
    await runLockCommand('addLocks', makeArgs());

    const summaryPath = join(outDir, 'safe-tx.summary.txt');
    const summary = readFileSync(summaryPath, 'utf8');

    // Extract calldataHash values from tx lines
    const txLines = summary.split('\n').filter((l) => l.startsWith('- tx '));
    const hashes = txLines.map((line) => {
      const match = line.match(/calldataHash=(0x[0-9a-f]+)/);
      return match![1]!;
    });

    // Recompute fingerprint
    const recomputed = batchFingerprint(hashes);

    // Extract fingerprint from summary
    const fpLine = summary.split('\n').find((l) => l.startsWith('Batch Fingerprint:'))!;
    const fpMatch = fpLine.match(/Batch Fingerprint: (0x[0-9a-f]+)/);
    const summaryFingerprint = fpMatch![1]!;

    expect(recomputed).toBe(summaryFingerprint);
  });

  it('determinism: identical output on two runs', async () => {
    const args = makeArgs();

    await runLockCommand('addLocks', args);
    const json1 = readFileSync(join(outDir, 'safe-tx.json'), 'utf8');
    const summary1 = readFileSync(join(outDir, 'safe-tx.summary.txt'), 'utf8');

    // Second run to same directory
    await runLockCommand('addLocks', args);
    const json2 = readFileSync(join(outDir, 'safe-tx.json'), 'utf8');
    const summary2 = readFileSync(join(outDir, 'safe-tx.summary.txt'), 'utf8');

    expect(json1).toBe(json2);
    expect(summary1).toBe(summary2);
  });

  it('summary field order', async () => {
    await runLockCommand('addLocks', makeArgs());

    const summaryPath = join(outDir, 'safe-tx.summary.txt');
    const summary = readFileSync(summaryPath, 'utf8');
    const lines = summary.split('\n');

    const requiredFieldsInOrder = [
      'OMA3 OPS TRANSACTION SUMMARY',
      'Transaction ID:',
      'Operation:',
      'Network Name:',
      'Chain ID:',
      'Anchor Date UTC:',
      'OMALock Contract:',
      'OMA Token Contract:',
      'Input CSV:',
      'Rows Parsed:',
      'Validation:',
      'Transactions:',
      'Max Wallets Per Tx:',
      'Total Wallets:',
      'Total OMA (human):',
      'Total OMA (wei):',
      'JSON SHA256:',
      'Batch Fingerprint:',
    ];

    let lastIndex = -1;
    for (const field of requiredFieldsInOrder) {
      const index = lines.findIndex((line, i) => i > lastIndex && line.startsWith(field));
      expect(index, `${field} should appear after previous field`).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });

  it('--csv flag works (renamed from --input)', async () => {
    await expect(runLockCommand('addLocks', makeArgs())).resolves.not.toThrow();
  });

  it('--input flag rejected', () => {
    const options = new Map<string, string | true>([['input', 'file.csv']]);
    const allowed = new Set([
      'help', 'network', 'anchor-date-utc', 'csv', 'out-dir',
      'max-wallets-per-tx', 'rpc-url', 'lock-contract', 'oma-token',
      'allow-address-override', 'require-amount-wei',
    ]);
    expect(() => assertNoUnknownOptions(options, allowed)).toThrow(
      'Unknown option(s): --input',
    );
  });

  it('Safe JSON importable: all required fields present', async () => {
    await runLockCommand('addLocks', makeArgs());

    const jsonPath = join(outDir, 'safe-tx.json');
    const safeBatch = JSON.parse(readFileSync(jsonPath, 'utf8'));

    expect(safeBatch.version).toBe('1.0');
    expect(typeof safeBatch.chainId).toBe('string');
    expect(safeBatch.createdAt).toBe(0);
    expect(safeBatch.meta).toBeDefined();
    expect(typeof safeBatch.meta.name).toBe('string');
    expect(typeof safeBatch.meta.description).toBe('string');
    expect(Array.isArray(safeBatch.transactions)).toBe(true);

    for (const tx of safeBatch.transactions) {
      expect(typeof tx.to).toBe('string');
      expect(tx.value).toBe('0');
      expect(typeof tx.data).toBe('string');
      expect(tx.contractMethod).toBeDefined();
      expect(tx.contractInputsValues).toBeDefined();
    }
  });

  it('fail-closed: invalid CSV does not write any output files', async () => {
    mkdirSync(outDir, { recursive: true });

    await expect(
      runLockCommand('addLocks', makeArgs({
        '--csv': join(fixturesDir(), 'duplicate-address.csv'),
      })),
    ).rejects.toThrow();

    const files = existsSync(outDir) ? readdirSync(outDir) : [];
    expect(files, 'Output directory must be empty after validation failure').toHaveLength(0);
  });
});
