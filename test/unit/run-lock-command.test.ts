import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { runLockCommand } from '../../src/run-lock-command.js';

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
});
