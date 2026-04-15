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
import { loadFixtures } from '../../src/known-locks.js';

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

const knownLocksPath = resolve(process.cwd(), 'data', 'sepolia-known-locks.json');

describeIf('end-to-end integration', () => {
  let savedKnownLocks: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'e2e-test-'));
    outDir = join(tmpDir, 'output');
    savedKnownLocks = readFileSync(knownLocksPath, 'utf8');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    writeFileSync(knownLocksPath, savedKnownLocks, 'utf8');
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
      '--csv': join(fixturesDir(), 'valid-2-wallets-with-lock.csv'),
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

  it('--max-total-pct hard error: total exceeds default 10% of supply', async () => {
    const csvPath = join(tmpDir, 'large-amount.csv');
    writeFileSync(csvPath, [
      'address,amount,cliffOffsetMonths,lockEndOffsetMonths',
      '0x0000000000000000000000000000000000000001,20000000,6,12',
      '0x0000000000000000000000000000000000000002,20000000,6,12',
    ].join('\n') + '\n', 'utf8');

    mkdirSync(outDir, { recursive: true });
    await expect(
      runLockCommand('addLocks', makeArgs({ '--csv': csvPath })),
    ).rejects.toThrow(/exceeds --max-total-pct/);

    const files = existsSync(outDir) ? readdirSync(outDir) : [];
    expect(files, 'No output files on threshold error').toHaveLength(0);
  });

  it('--max-total-pct custom threshold passes', async () => {
    const csvPath = join(tmpDir, 'large-amount.csv');
    writeFileSync(csvPath, [
      'address,amount,cliffOffsetMonths,lockEndOffsetMonths',
      '0x0000000000000000000000000000000000000001,50000000,6,12',
      '0x0000000000000000000000000000000000000002,50000000,6,12',
    ].join('\n') + '\n', 'utf8');

    await runLockCommand('addLocks', [
      ...makeArgs({ '--csv': csvPath }),
      '--max-total-pct', '50',
    ]);

    expect(existsSync(join(outDir, 'safe-tx.json'))).toBe(true);
    expect(existsSync(join(outDir, 'safe-tx.summary.txt'))).toBe(true);

    const summary = readFileSync(join(outDir, 'safe-tx.summary.txt'), 'utf8');
    expect(summary).toContain('WARNING: --max-total-pct set to 50');
  });

  it('--warn-wallet-pct warnings appear in summary file', async () => {
    const csvPath = join(tmpDir, 'warn-wallet.csv');
    writeFileSync(csvPath, [
      'address,amount,cliffOffsetMonths,lockEndOffsetMonths',
      '0x0000000000000000000000000000000000000001,5000000,6,12',
      '0x0000000000000000000000000000000000000002,100,6,12',
    ].join('\n') + '\n', 'utf8');

    await runLockCommand('addLocks', makeArgs({ '--csv': csvPath }));

    const summary = readFileSync(join(outDir, 'safe-tx.summary.txt'), 'utf8');
    expect(summary).toContain('0x0000000000000000000000000000000000000001');
    expect(summary).toMatch(/\d+\.\d+% of total supply/);
  });

  it('--warn-wallet-pct run completes despite warnings', async () => {
    const csvPath = join(tmpDir, 'warn-wallet.csv');
    writeFileSync(csvPath, [
      'address,amount,cliffOffsetMonths,lockEndOffsetMonths',
      '0x0000000000000000000000000000000000000001,5000000,6,12',
      '0x0000000000000000000000000000000000000002,100,6,12',
    ].join('\n') + '\n', 'utf8');

    await expect(
      runLockCommand('addLocks', makeArgs({ '--csv': csvPath })),
    ).resolves.not.toThrow();

    expect(existsSync(join(outDir, 'safe-tx.json'))).toBe(true);
    expect(existsSync(join(outDir, 'safe-tx.summary.txt'))).toBe(true);
  });

  it('threshold override warnings in summary', async () => {
    const csvPath = join(tmpDir, 'override.csv');
    writeFileSync(csvPath, [
      'address,amount,cliffOffsetMonths,lockEndOffsetMonths',
      '0x0000000000000000000000000000000000000001,100,6,12',
    ].join('\n') + '\n', 'utf8');

    await runLockCommand('addLocks', [
      ...makeArgs({ '--csv': csvPath }),
      '--max-total-pct', '50',
      '--warn-wallet-pct', '5',
    ]);

    const summary = readFileSync(join(outDir, 'safe-tx.summary.txt'), 'utf8');
    expect(summary).toContain('WARNING: --max-total-pct set to 50 (default: 10)');
    expect(summary).toContain('WARNING: --warn-wallet-pct set to 5 (default: 1)');
  });

  it('no threshold override warnings with defaults', async () => {
    await runLockCommand('addLocks', makeArgs());

    const summary = readFileSync(join(outDir, 'safe-tx.summary.txt'), 'utf8');
    expect(summary).not.toContain('WARNING: --max-total-pct');
    expect(summary).not.toContain('WARNING: --warn-wallet-pct');
  });

  it('known-locks fixture: addLocks prepends entries', async () => {
    const before = loadFixtures(knownLocksPath);
    const beforeCount = before.length;

    await runLockCommand('addLocks', makeArgs());

    const after = loadFixtures(knownLocksPath);
    expect(after.length).toBe(beforeCount + 3);

    for (let i = 0; i < 3; i++) {
      expect(after[i]!.source).toContain('addLocks:');
    }

    for (let i = 0; i < beforeCount; i++) {
      expect(after[i + 3]!.address).toBe(before[i]!.address);
      expect(after[i + 3]!.source).toBe(before[i]!.source);
    }
  });

  it('known-locks fixture: addLocks source field format', async () => {
    await runLockCommand('addLocks', makeArgs());

    const after = loadFixtures(knownLocksPath);
    for (let i = 0; i < 3; i++) {
      expect(after[i]!.source).toMatch(/^addLocks:[0-9a-f]{12}$/);
    }
  });

  it('known-locks fixture: addLocks entry fields', async () => {
    await runLockCommand('addLocks', makeArgs());

    const after = loadFixtures(knownLocksPath);
    const newEntries = after.slice(0, 3);

    for (const entry of newEntries) {
      expect(entry.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(typeof entry.amount).toBe('string');
      expect(parseFloat(entry.amount)).toBeGreaterThan(0);
      expect(typeof entry.cliffDate).toBe('number');
      expect(entry.cliffDate).toBeGreaterThan(0);
      expect(typeof entry.lockEndDate).toBe('number');
      expect(entry.lockEndDate).toBeGreaterThan(entry.cliffDate);
    }
  });

  it('known-locks fixture: updateLocks removes then prepends', async () => {
    await runLockCommand('addLocks', makeArgs({
      '--csv': join(fixturesDir(), 'valid-2-wallets-with-lock.csv'),
    }));
    const afterAdd = loadFixtures(knownLocksPath);
    const countAfterAdd = afterAdd.length;

    await runLockCommand('updateLocks', makeArgs({
      '--csv': join(fixturesDir(), 'valid-2-wallets-with-lock.csv'),
    }));
    const afterUpdate = loadFixtures(knownLocksPath);

    expect(afterUpdate[0]!.source).toContain('updateLocks:');
    expect(afterUpdate[1]!.source).toContain('updateLocks:');

    const addLocksEntries = afterAdd.filter((e) => e.source.startsWith('addLocks:'));
    const updateLocksEntries = afterUpdate.filter((e) => e.source.startsWith('updateLocks:'));
    expect(addLocksEntries.length).toBe(2);
    expect(updateLocksEntries.length).toBe(2);

    expect(afterUpdate.length).toBe(countAfterAdd);
  });

  it('known-locks fixture: updateLocks source field format', async () => {
    await runLockCommand('updateLocks', makeArgs({
      '--csv': join(fixturesDir(), 'valid-2-wallets-with-lock.csv'),
    }));

    const after = loadFixtures(knownLocksPath);
    const updateEntries = after.filter((e) => e.source.startsWith('updateLocks:'));
    expect(updateEntries.length).toBeGreaterThan(0);
    for (const entry of updateEntries) {
      expect(entry.source).toMatch(/^updateLocks:[0-9a-f]{12}$/);
    }
  });

  it('known-locks fixture: updateLocks preserves other entries', async () => {
    const before = loadFixtures(knownLocksPath);
    const updateCsvAddresses = new Set([
      '0x073f18d260dc35d40aa5375a3ddee1616f59f5dd',
      '0x822685e68d5d4c1c64973d831a13ebd3ed3c9b55',
    ]);

    const untouchedBefore = before.filter(
      (e) => !updateCsvAddresses.has(e.address.toLowerCase()),
    );

    await runLockCommand('updateLocks', makeArgs({
      '--csv': join(fixturesDir(), 'valid-2-wallets-with-lock.csv'),
    }));

    const after = loadFixtures(knownLocksPath);
    const untouchedAfter = after.filter(
      (e) => !e.source.startsWith('updateLocks:'),
    );

    expect(untouchedAfter.length).toBe(untouchedBefore.length);
    for (let i = 0; i < untouchedBefore.length; i++) {
      expect(untouchedAfter[i]!.address).toBe(untouchedBefore[i]!.address);
      expect(untouchedAfter[i]!.amount).toBe(untouchedBefore[i]!.amount);
      expect(untouchedAfter[i]!.source).toBe(untouchedBefore[i]!.source);
    }
  });

  it('known-locks fixture: entries represent expected state (not on-chain)', async () => {
    await runLockCommand('addLocks', makeArgs());

    const after = loadFixtures(knownLocksPath);
    const newEntries = after.slice(0, 3);

    const expectedAddresses = [
      '0x0000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000002',
      '0x0000000000000000000000000000000000000003',
    ];
    const sortedNew = [...newEntries].sort((a, b) =>
      a.address.toLowerCase().localeCompare(b.address.toLowerCase()),
    );
    for (let i = 0; i < expectedAddresses.length; i++) {
      expect(sortedNew[i]!.address.toLowerCase()).toBe(expectedAddresses[i]);
    }

    expect(sortedNew[0]!.amount).toBe('100.0');
    expect(sortedNew[1]!.amount).toBe('200.0');
    expect(sortedNew[2]!.amount).toBe('300.0');
  });
});
