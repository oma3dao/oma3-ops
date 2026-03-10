import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { runLockCommand } from '../../src/run-lock-command.js';
import { parseUnits } from 'ethers';

const fixturesDir = () => resolve(process.cwd(), 'test', 'fixtures');

let tmpDir: string;
let outDir: string;

vi.mock('../../src/chain.js', () => ({
  loadChainContext: vi.fn().mockResolvedValue({
    network: { name: 'sepolia', chainId: 11155111n },
    rpcUrl: 'https://sepolia.example.com',
    lockContract: '0x2f38D6cCB480d5C7e68d11b5a02f2c2451543F58',
    omaToken: '0xd7ee0eADb283eFB6d6e628De5E31A284183f4EDf',
    decimals: 18,
  }),
}));

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'run-lock-cmd-'));
  outDir = join(tmpDir, 'output');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('runLockCommand with mocked chain', () => {
  it('--help prints usage and returns without writing files', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runLockCommand('addLocks', ['--help']);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Usage:'),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('lock-add-locks'),
    );
    logSpy.mockRestore();
  });

  it('updateLocks --help prints updateLocks usage', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runLockCommand('updateLocks', ['--help']);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('lock-update-locks'),
    );
    logSpy.mockRestore();
  });

  it('throws on unexpected positional args', async () => {
    await expect(
      runLockCommand('addLocks', [
        '--anchor-date-utc', '2025-01-31T00:00:00Z',
        '--csv', join(fixturesDir(), 'valid-3-wallets.csv'),
        '--out-dir', outDir,
        'extra-arg',
      ]),
    ).rejects.toThrow(/Unexpected positional argument/);
  });

  it('generates safe-tx.json and summary when chain is mocked', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runLockCommand('addLocks', [
      '--anchor-date-utc', '2025-01-31T00:00:00Z',
      '--csv', join(fixturesDir(), 'valid-3-wallets.csv'),
      '--out-dir', outDir,
    ]);

    const jsonPath = join(outDir, 'safe-tx.json');
    const summaryPath = join(outDir, 'safe-tx.summary.txt');

    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(summaryPath)).toBe(true);

    const safeBatch = JSON.parse(readFileSync(jsonPath, 'utf8'));
    expect(safeBatch.version).toBe('1.0');
    expect(safeBatch.transactions).toHaveLength(1);

    const summary = readFileSync(summaryPath, 'utf8');
    expect(summary).toContain('OMA3 OPS TRANSACTION SUMMARY');
    expect(summary).toContain('Total Wallets: 3');

    logSpy.mockRestore();
  });

  it('accepts --max-total-pct and --warn-wallet-pct options', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(
      runLockCommand('addLocks', [
        '--anchor-date-utc', '2025-01-31T00:00:00Z',
        '--csv', join(fixturesDir(), 'valid-3-wallets.csv'),
        '--out-dir', outDir,
        '--max-total-pct', '50',
        '--warn-wallet-pct', '5',
      ]),
    ).resolves.not.toThrow();

    logSpy.mockRestore();
  });

  it('threshold: total exceeds --max-total-pct causes hard error', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // valid-3-wallets.csv has 100+200+300 = 600 OMA
    // Supply is 333,333,333 OMA. 600/333333333 ~ 0.00018%
    // Set max-total-pct to something tiny that 600 OMA would NOT exceed...
    // Actually we need the total to EXCEED the pct. Let me make a CSV with huge amounts.
    const bigAmountCsv = join(tmpDir, 'big-amount.csv');
    // 50M OMA per wallet * 3 wallets = 150M OMA > 10% of 333M supply (33.3M)
    writeFileSync(bigAmountCsv, [
      'address,amount,cliffOffsetMonths,lockEndOffsetMonths',
      '0x0000000000000000000000000000000000000001,50000000,6,12',
      '0x0000000000000000000000000000000000000002,50000000,6,12',
      '0x0000000000000000000000000000000000000003,50000000,6,12',
    ].join('\n'), 'utf8');

    await expect(
      runLockCommand('addLocks', [
        '--anchor-date-utc', '2025-01-31T00:00:00Z',
        '--csv', bigAmountCsv,
        '--out-dir', outDir,
        '--max-total-pct', '10',
      ]),
    ).rejects.toThrow(/exceeds --max-total-pct/);

    logSpy.mockRestore();
  });

  it('threshold: custom --max-total-pct raises limit', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const bigAmountCsv = join(tmpDir, 'big-amount.csv');
    // 50M OMA * 3 = 150M OMA ~ 45% of supply
    writeFileSync(bigAmountCsv, [
      'address,amount,cliffOffsetMonths,lockEndOffsetMonths',
      '0x0000000000000000000000000000000000000001,50000000,6,12',
      '0x0000000000000000000000000000000000000002,50000000,6,12',
      '0x0000000000000000000000000000000000000003,50000000,6,12',
    ].join('\n'), 'utf8');

    // 50% should allow 150M to pass
    await expect(
      runLockCommand('addLocks', [
        '--anchor-date-utc', '2025-01-31T00:00:00Z',
        '--csv', bigAmountCsv,
        '--out-dir', outDir,
        '--max-total-pct', '50',
      ]),
    ).resolves.not.toThrow();

    logSpy.mockRestore();
  });

  it('threshold: per-wallet warning appears in summary', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // 5M OMA > 1% of 333M (3.33M threshold at default warn-wallet-pct=1)
    const bigWalletCsv = join(tmpDir, 'big-wallet.csv');
    writeFileSync(bigWalletCsv, [
      'address,amount,cliffOffsetMonths,lockEndOffsetMonths',
      '0x0000000000000000000000000000000000000001,5000000,6,12',
      '0x0000000000000000000000000000000000000002,100,6,12',
    ].join('\n'), 'utf8');

    await runLockCommand('addLocks', [
      '--anchor-date-utc', '2025-01-31T00:00:00Z',
      '--csv', bigWalletCsv,
      '--out-dir', outDir,
    ]);

    const summary = readFileSync(join(outDir, 'safe-tx.summary.txt'), 'utf8');
    // The big wallet should appear in WARNINGS
    expect(summary).toContain('0x0000000000000000000000000000000000000001');
    expect(summary).toContain('% of total supply');
    // The small wallet should NOT appear in warnings
    const warningsSection = summary.split('WARNINGS')[1]!;
    expect(warningsSection).not.toContain('0x0000000000000000000000000000000000000002');

    logSpy.mockRestore();
  });

  it('threshold: updateLocks does not check thresholds', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const bigAmountCsv = join(tmpDir, 'big-amount-update.csv');
    // Amounts that would exceed any threshold
    writeFileSync(bigAmountCsv, [
      'address,amount,cliffOffsetMonths,lockEndOffsetMonths',
      '0x0000000000000000000000000000000000000001,100000000,6,12',
      '0x0000000000000000000000000000000000000002,100000000,6,12',
    ].join('\n'), 'utf8');

    // updateLocks should not throw even with huge amounts
    await expect(
      runLockCommand('updateLocks', [
        '--anchor-date-utc', '2025-01-31T00:00:00Z',
        '--csv', bigAmountCsv,
        '--out-dir', outDir,
      ]),
    ).resolves.not.toThrow();

    logSpy.mockRestore();
  });

  it('summary includes WARNINGS section', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runLockCommand('addLocks', [
      '--anchor-date-utc', '2025-01-31T00:00:00Z',
      '--csv', join(fixturesDir(), 'valid-3-wallets.csv'),
      '--out-dir', outDir,
    ]);

    const summary = readFileSync(join(outDir, 'safe-tx.summary.txt'), 'utf8');
    expect(summary).toContain('WARNINGS');

    logSpy.mockRestore();
  });
});
