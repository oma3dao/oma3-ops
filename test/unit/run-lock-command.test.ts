import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Interface, parseUnits } from 'ethers';

const { mockCall } = vi.hoisted(() => ({
  mockCall: vi.fn(),
}));

vi.mock('../../src/chain.js', () => ({
  loadChainContext: vi.fn().mockResolvedValue({
    network: { name: 'sepolia', chainId: 11155111n },
    rpcUrl: 'https://sepolia.example.com',
    lockContract: '0x2f38D6cCB480d5C7e68d11b5a02f2c2451543F58',
    omaToken: '0xd7ee0eADb283eFB6d6e628De5E31A284183f4EDf',
    decimals: 18,
  }),
}));

vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ethers')>();
  class MockJsonRpcProvider {
    call = mockCall;
  }
  return {
    ...actual,
    JsonRpcProvider: MockJsonRpcProvider,
  };
});

// Must import AFTER mocks are set up
const { runLockCommand } = await import('../../src/run-lock-command.js');

const LOCK_ABI = [
  'function getLock(address wallet_) view returns (tuple(uint40 timestamp, uint40 cliffDate, uint40 lockEndDate, uint96 amount, uint96 claimedAmount, uint96 stakedAmount, uint96 slashedAmount) lock, uint96 unlockedAmount)',
] as const;
const LOCK_IFACE = new Interface(LOCK_ABI);

function encodeLockResult(params: {
  timestamp?: bigint;
  cliffDate?: bigint;
  lockEndDate?: bigint;
  amount?: bigint;
  claimedAmount?: bigint;
  stakedAmount?: bigint;
  slashedAmount?: bigint;
  unlockedAmount?: bigint;
}): string {
  return LOCK_IFACE.encodeFunctionResult('getLock', [
    [
      params.timestamp ?? 1000n,
      params.cliffDate ?? 2000n,
      params.lockEndDate ?? 3000n,
      params.amount ?? 1000000000000000000n,
      params.claimedAmount ?? 0n,
      params.stakedAmount ?? 0n,
      params.slashedAmount ?? 0n,
    ],
    params.unlockedAmount ?? 500000000000000000n,
  ]);
}

const fixturesDir = () => resolve(process.cwd(), 'test', 'fixtures');

let tmpDir: string;
let outDir: string;

beforeEach(() => {
  vi.clearAllMocks();
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

describe('runLockCommand - updateLocks preflight', () => {
  it('updateLocks does not check thresholds', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const bigAmountCsv = join(tmpDir, 'big-amount-update.csv');
    writeFileSync(bigAmountCsv, [
      'address,amount,cliffOffsetMonths,lockEndOffsetMonths',
      '0x0000000000000000000000000000000000000001,100000000,6,12',
      '0x0000000000000000000000000000000000000002,100000000,6,12',
    ].join('\n'), 'utf8');

    // Mock: on-chain amount matches CSV amount
    mockCall.mockResolvedValue(
      encodeLockResult({ amount: parseUnits('100000000', 18), stakedAmount: 0n }),
    );

    await expect(
      runLockCommand('updateLocks', [
        '--anchor-date-utc', '2025-01-31T00:00:00Z',
        '--csv', bigAmountCsv,
        '--out-dir', outDir,
      ]),
    ).resolves.not.toThrow();

    logSpy.mockRestore();
  });

  it('preflight passes when on-chain amounts match CSV', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // CSV has 100, 200, 300 OMA — rows sorted by address, so amounts map to 0x...01, 02, 03
    const amounts = [
      parseUnits('100', 18),
      parseUnits('200', 18),
      parseUnits('300', 18),
    ];
    let callIndex = 0;
    mockCall.mockImplementation(() => {
      const amount = amounts[callIndex % amounts.length]!;
      callIndex++;
      return encodeLockResult({ amount, stakedAmount: 0n });
    });

    await runLockCommand('updateLocks', [
      '--anchor-date-utc', '2025-01-31T00:00:00Z',
      '--csv', join(fixturesDir(), 'valid-3-wallets.csv'),
      '--out-dir', outDir,
    ]);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Preflight updateLocks checks: pass'));

    const jsonPath = join(outDir, 'safe-tx.json');
    expect(existsSync(jsonPath)).toBe(true);

    logSpy.mockRestore();
  });

  it('preflight fails when wallet has no lock on-chain', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockCall.mockRejectedValue(new Error('NoLock (0xd8216464)'));

    await expect(
      runLockCommand('updateLocks', [
        '--anchor-date-utc', '2025-01-31T00:00:00Z',
        '--csv', join(fixturesDir(), 'valid-3-wallets.csv'),
        '--out-dir', outDir,
      ]),
    ).rejects.toThrow(/updateLocks preflight failed/);

    logSpy.mockRestore();
  });

  it('preflight fails on amount mismatch between CSV and on-chain', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // CSV has 100, 200, 300 OMA; on-chain has 999 OMA for all
    mockCall.mockResolvedValue(
      encodeLockResult({ amount: parseUnits('999', 18), stakedAmount: 0n }),
    );

    await expect(
      runLockCommand('updateLocks', [
        '--anchor-date-utc', '2025-01-31T00:00:00Z',
        '--csv', join(fixturesDir(), 'valid-3-wallets.csv'),
        '--out-dir', outDir,
      ]),
    ).rejects.toThrow(/CSV amount mismatch vs on-chain amount/);

    logSpy.mockRestore();
  });

  it('preflight logs warning for staked wallets but does not error', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // On-chain amounts match CSV, wallets have staked amounts
    const amounts = [
      parseUnits('100', 18),
      parseUnits('200', 18),
      parseUnits('300', 18),
    ];
    let callIndex = 0;
    mockCall.mockImplementation(() => {
      const amount = amounts[callIndex % amounts.length]!;
      callIndex++;
      return encodeLockResult({ amount, stakedAmount: 5000000000000000000n });
    });

    await runLockCommand('updateLocks', [
      '--anchor-date-utc', '2025-01-31T00:00:00Z',
      '--csv', join(fixturesDir(), 'valid-3-wallets.csv'),
      '--out-dir', outDir,
    ]);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('WARNING:'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('stakedAmount > 0'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Preflight updateLocks checks: pass'));

    logSpy.mockRestore();
  });

  it('preflight error includes both missing locks and mismatches', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // First wallet: no lock; remaining: amount mismatch
    let callIndex = 0;
    mockCall.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) {
        throw new Error('NoLock (0xd8216464)');
      }
      return encodeLockResult({ amount: parseUnits('999', 18), stakedAmount: 0n });
    });

    await expect(
      runLockCommand('updateLocks', [
        '--anchor-date-utc', '2025-01-31T00:00:00Z',
        '--csv', join(fixturesDir(), 'valid-3-wallets.csv'),
        '--out-dir', outDir,
      ]),
    ).rejects.toThrow(/No lock on-chain.*CSV amount mismatch/s);

    logSpy.mockRestore();
  });

  it('preflight error message includes "No output files produced"', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockCall.mockRejectedValue(new Error('NoLock (0xd8216464)'));

    await expect(
      runLockCommand('updateLocks', [
        '--anchor-date-utc', '2025-01-31T00:00:00Z',
        '--csv', join(fixturesDir(), 'valid-3-wallets.csv'),
        '--out-dir', outDir,
      ]),
    ).rejects.toThrow(/No output files produced/);

    logSpy.mockRestore();
  });

  it('no output files produced on preflight failure', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    mockCall.mockRejectedValue(new Error('NoLock (0xd8216464)'));

    await expect(
      runLockCommand('updateLocks', [
        '--anchor-date-utc', '2025-01-31T00:00:00Z',
        '--csv', join(fixturesDir(), 'valid-3-wallets.csv'),
        '--out-dir', outDir,
      ]),
    ).rejects.toThrow();

    expect(existsSync(join(outDir, 'safe-tx.json'))).toBe(false);

    logSpy.mockRestore();
  });

  it('preflight logs start message with wallet count', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const amounts = [
      parseUnits('100', 18),
      parseUnits('200', 18),
      parseUnits('300', 18),
    ];
    let callIndex = 0;
    mockCall.mockImplementation(() => {
      const amount = amounts[callIndex % amounts.length]!;
      callIndex++;
      return encodeLockResult({ amount, stakedAmount: 0n });
    });

    await runLockCommand('updateLocks', [
      '--anchor-date-utc', '2025-01-31T00:00:00Z',
      '--csv', join(fixturesDir(), 'valid-3-wallets.csv'),
      '--out-dir', outDir,
    ]);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Preflight: verifying 3 wallet(s) against on-chain locks'),
    );

    logSpy.mockRestore();
  });

  it('preflight mismatch error includes csvWei and chainWei details', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // CSV has 100 OMA, on-chain has 555 OMA
    const csvPath = join(tmpDir, 'mismatch-detail.csv');
    writeFileSync(csvPath, [
      'address,amount,cliffOffsetMonths,lockEndOffsetMonths',
      '0x0000000000000000000000000000000000000001,100,6,12',
    ].join('\n'), 'utf8');

    mockCall.mockResolvedValue(
      encodeLockResult({ amount: parseUnits('555', 18), stakedAmount: 0n }),
    );

    try {
      await runLockCommand('updateLocks', [
        '--anchor-date-utc', '2025-01-31T00:00:00Z',
        '--csv', csvPath,
        '--out-dir', outDir,
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toContain('csvWei=');
      expect(message).toContain('chainWei=');
      expect(message).toContain('csvHuman=');
      expect(message).toContain('chainHuman=');
    }

    logSpy.mockRestore();
  });

  it('updateLocks fixture entries use on-chain amount, not CSV amount', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // CSV says 100 OMA, on-chain also says 100 OMA (must match for preflight to pass)
    // The fixture entry amount should come from on-chain via the preflight map
    const csvPath = join(tmpDir, 'update-fixture-check.csv');
    writeFileSync(csvPath, [
      'address,amount,cliffOffsetMonths,lockEndOffsetMonths',
      '0x0000000000000000000000000000000000000001,100,6,12',
    ].join('\n'), 'utf8');

    const onChainAmount = parseUnits('100', 18);
    mockCall.mockResolvedValue(
      encodeLockResult({ amount: onChainAmount, stakedAmount: 0n }),
    );

    await runLockCommand('updateLocks', [
      '--anchor-date-utc', '2025-01-31T00:00:00Z',
      '--csv', csvPath,
      '--out-dir', outDir,
    ]);

    // Read the known-locks fixture that was written
    const { getFixturePath, loadFixtures } = await import('../../src/known-locks.js');
    const fixturePath = getFixturePath('sepolia');
    const entries = loadFixtures(fixturePath);

    // Find the entry for our test address
    const entry = entries.find(
      (e) => e.address.toLowerCase() === '0x0000000000000000000000000000000000000001',
    );
    expect(entry).toBeDefined();
    expect(entry!.amount).toBe('100.0');
    expect(entry!.source).toContain('updateLocks:');

    logSpy.mockRestore();
  });

  it('preflight rethrows non-NoLock RPC errors', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Simulate a generic RPC failure (not NoLock)
    mockCall.mockRejectedValue(new Error('server unavailable'));

    await expect(
      runLockCommand('updateLocks', [
        '--anchor-date-utc', '2025-01-31T00:00:00Z',
        '--csv', join(fixturesDir(), 'valid-3-wallets.csv'),
        '--out-dir', outDir,
      ]),
    ).rejects.toThrow(/server unavailable/);

    logSpy.mockRestore();
  });
});
