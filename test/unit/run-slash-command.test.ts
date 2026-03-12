import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { AbiCoder, Interface } from 'ethers';

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
const { runSlashCommand } = await import('../../src/run-slash-command.js');

const LOCK_ABI = [
  'function getLock(address wallet_) view returns (tuple(uint40 timestamp, uint40 cliffDate, uint40 lockEndDate, uint96 amount, uint96 claimedAmount, uint96 stakedAmount, uint96 slashedAmount) lock, uint96 unlockedAmount)',
] as const;
const LOCK_IFACE = new Interface(LOCK_ABI);
const coder = AbiCoder.defaultAbiCoder();

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
  tmpDir = mkdtempSync(join(tmpdir(), 'run-slash-cmd-'));
  outDir = join(tmpDir, 'output');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('runSlashCommand - slash', () => {
  it('--help prints slash usage and returns without writing files', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runSlashCommand('slash', ['--help']);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('lock-slash'));
    logSpy.mockRestore();
  });

  it('--help prints slashStake usage', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runSlashCommand('slashStake', ['--help']);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('lock-slash-stake'));
    logSpy.mockRestore();
  });

  it('throws on unexpected positional args', async () => {
    await expect(
      runSlashCommand('slash', [
        '--csv', join(fixturesDir(), 'slash-2-wallets.csv'),
        '--to', '0x000000000000000000000000000000000000dEaD',
        '--out-dir', outDir,
        'extra-arg',
      ]),
    ).rejects.toThrow(/Unexpected positional argument/);
  });

  it('throws on unknown option', async () => {
    await expect(
      runSlashCommand('slash', [
        '--csv', join(fixturesDir(), 'slash-2-wallets.csv'),
        '--to', '0x000000000000000000000000000000000000dEaD',
        '--out-dir', outDir,
        '--bogus', 'value',
      ]),
    ).rejects.toThrow(/Unknown option/);
  });

  it('throws on invalid --to address', async () => {
    mockCall.mockResolvedValue(encodeLockResult({}));

    await expect(
      runSlashCommand('slash', [
        '--csv', join(fixturesDir(), 'slash-2-wallets.csv'),
        '--to', 'not-an-address',
        '--out-dir', outDir,
        '--rpc-url', 'https://mock.example.com',
      ]),
    ).rejects.toThrow(/Invalid --to address/);
  });

  it('throws on duplicate address in CSV', async () => {
    mockCall.mockResolvedValue(encodeLockResult({}));

    await expect(
      runSlashCommand('slash', [
        '--csv', join(fixturesDir(), 'slash-duplicate-address.csv'),
        '--to', '0x000000000000000000000000000000000000dEaD',
        '--out-dir', outDir,
        '--rpc-url', 'https://mock.example.com',
      ]),
    ).rejects.toThrow(/duplicate address/);
  });

  it('generates safe-tx.json and summary for slash with zero staked amounts', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Both wallets have no staked tokens
    mockCall.mockResolvedValue(encodeLockResult({ stakedAmount: 0n }));

    await runSlashCommand('slash', [
      '--csv', join(fixturesDir(), 'slash-2-wallets.csv'),
      '--to', '0x000000000000000000000000000000000000dEaD',
      '--out-dir', outDir,
      '--rpc-url', 'https://mock.example.com',
    ]);

    const jsonPath = join(outDir, 'safe-tx.json');
    const summaryPath = join(outDir, 'safe-tx.summary.txt');

    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(summaryPath)).toBe(true);

    const safeBatch = JSON.parse(readFileSync(jsonPath, 'utf8'));
    expect(safeBatch.version).toBe('1.0');
    // One transaction per wallet
    expect(safeBatch.transactions).toHaveLength(2);
    // Each transaction should use slash method
    for (const tx of safeBatch.transactions) {
      expect(tx.contractMethod.name).toBe('slash');
    }

    const summary = readFileSync(summaryPath, 'utf8');
    expect(summary).toContain('OMA3 OPS TRANSACTION SUMMARY');
    expect(summary).toContain('Operation: slash');
    expect(summary).toContain('Total Wallets: 2');

    logSpy.mockRestore();
  });

  it('throws if wallet has staked tokens in slash mode', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Wallet has staked tokens
    mockCall.mockResolvedValue(encodeLockResult({ stakedAmount: 5000000000000000000n }));

    await expect(
      runSlashCommand('slash', [
        '--csv', join(fixturesDir(), 'slash-2-wallets.csv'),
        '--to', '0x000000000000000000000000000000000000dEaD',
        '--out-dir', outDir,
        '--rpc-url', 'https://mock.example.com',
      ]),
    ).rejects.toThrow(/Cannot slash wallets with staked tokens/);

    logSpy.mockRestore();
  });

  it('throws if wallet has no lock on-chain', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Simulate NoLock error
    mockCall.mockRejectedValue(new Error('NoLock (0xd8216464)'));

    await expect(
      runSlashCommand('slash', [
        '--csv', join(fixturesDir(), 'slash-2-wallets.csv'),
        '--to', '0x000000000000000000000000000000000000dEaD',
        '--out-dir', outDir,
        '--rpc-url', 'https://mock.example.com',
      ]),
    ).rejects.toThrow(/no lock record on-chain/);

    logSpy.mockRestore();
  });

  it('fail-closed: no output files on validation error', async () => {
    mkdirSync(outDir, { recursive: true });

    await expect(
      runSlashCommand('slash', [
        '--csv', join(fixturesDir(), 'slash-duplicate-address.csv'),
        '--to', '0x000000000000000000000000000000000000dEaD',
        '--out-dir', outDir,
        '--rpc-url', 'https://mock.example.com',
      ]),
    ).rejects.toThrow();

    const files = existsSync(outDir) ? readdirSync(outDir) : [];
    expect(files, 'Output directory must be empty after validation failure').toHaveLength(0);
  });
});

describe('runSlashCommand - slashStake (explicit mode)', () => {
  it('generates safe-tx.json and summary for slashStake with explicit amounts', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Wallets have staked tokens
    mockCall.mockResolvedValue(encodeLockResult({ stakedAmount: 5000000000000000000n }));

    await runSlashCommand('slashStake', [
      '--csv', join(fixturesDir(), 'slash-stake-2-wallets.csv'),
      '--to', '0x000000000000000000000000000000000000dEaD',
      '--out-dir', outDir,
      '--rpc-url', 'https://mock.example.com',
    ]);

    const jsonPath = join(outDir, 'safe-tx.json');
    const summaryPath = join(outDir, 'safe-tx.summary.txt');

    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(summaryPath)).toBe(true);

    const safeBatch = JSON.parse(readFileSync(jsonPath, 'utf8'));
    expect(safeBatch.transactions).toHaveLength(2);
    for (const tx of safeBatch.transactions) {
      expect(tx.contractMethod.name).toBe('slashStake');
    }

    const summary = readFileSync(summaryPath, 'utf8');
    expect(summary).toContain('Operation: slashStake');
    expect(summary).toContain('Total Wallets: 2');

    logSpy.mockRestore();
  });

  it('throws if CSV stakedAmount exceeds on-chain stakedAmount', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // On-chain has 1 OMA staked, CSV asks for 5 OMA
    mockCall.mockResolvedValue(encodeLockResult({ stakedAmount: 1000000000000000000n }));

    await expect(
      runSlashCommand('slashStake', [
        '--csv', join(fixturesDir(), 'slash-stake-2-wallets.csv'),
        '--to', '0x000000000000000000000000000000000000dEaD',
        '--out-dir', outDir,
        '--rpc-url', 'https://mock.example.com',
      ]),
    ).rejects.toThrow(/CSV stakedAmount.*exceeds on-chain stakedAmount/);

    logSpy.mockRestore();
  });

  it('throws if wallet has zero staked amount on-chain', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockCall.mockResolvedValue(encodeLockResult({ stakedAmount: 0n }));

    await expect(
      runSlashCommand('slashStake', [
        '--csv', join(fixturesDir(), 'slash-stake-2-wallets.csv'),
        '--to', '0x000000000000000000000000000000000000dEaD',
        '--out-dir', outDir,
        '--rpc-url', 'https://mock.example.com',
      ]),
    ).rejects.toThrow(/stakedAmount is 0 on-chain/);

    logSpy.mockRestore();
  });
});

describe('runSlashCommand - slashStake (full mode / --slash-all)', () => {
  it('--slash-all with blank stakedAmount values succeeds', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockCall.mockResolvedValue(encodeLockResult({ stakedAmount: 5000000000000000000n }));

    await runSlashCommand('slashStake', [
      '--csv', join(fixturesDir(), 'slash-stake-blank-amounts.csv'),
      '--to', '0x000000000000000000000000000000000000dEaD',
      '--out-dir', outDir,
      '--rpc-url', 'https://mock.example.com',
      '--slash-all',
    ]);

    const jsonPath = join(outDir, 'safe-tx.json');
    expect(existsSync(jsonPath)).toBe(true);

    const safeBatch = JSON.parse(readFileSync(jsonPath, 'utf8'));
    expect(safeBatch.transactions).toHaveLength(2);
    for (const tx of safeBatch.transactions) {
      expect(tx.contractMethod.name).toBe('slashStake');
    }

    logSpy.mockRestore();
  });

  it('--slash-all with positive stakedAmount values throws', async () => {
    await expect(
      runSlashCommand('slashStake', [
        '--csv', join(fixturesDir(), 'slash-stake-2-wallets.csv'),
        '--to', '0x000000000000000000000000000000000000dEaD',
        '--out-dir', outDir,
        '--rpc-url', 'https://mock.example.com',
        '--slash-all',
      ]),
    ).rejects.toThrow(/--slash-all requires all stakedAmount values to be blank/);
  });

  it('blank stakedAmount without --slash-all throws', async () => {
    await expect(
      runSlashCommand('slashStake', [
        '--csv', join(fixturesDir(), 'slash-stake-blank-amounts.csv'),
        '--to', '0x000000000000000000000000000000000000dEaD',
        '--out-dir', outDir,
        '--rpc-url', 'https://mock.example.com',
      ]),
    ).rejects.toThrow(/Provide --slash-all to confirm full staked amount slash/);
  });

  it('--slash-all is only valid for slashStake, not slash', async () => {
    await expect(
      runSlashCommand('slash', [
        '--csv', join(fixturesDir(), 'slash-2-wallets.csv'),
        '--to', '0x000000000000000000000000000000000000dEaD',
        '--out-dir', outDir,
        '--rpc-url', 'https://mock.example.com',
        '--slash-all',
      ]),
    ).rejects.toThrow(/--slash-all is only valid for slashStake/);
  });
});

describe('runSlashCommand - slashStake mode validation', () => {
  it('throws on mixed blank and positive stakedAmount values', async () => {
    await expect(
      runSlashCommand('slashStake', [
        '--csv', join(fixturesDir(), 'slash-stake-mixed-amounts.csv'),
        '--to', '0x000000000000000000000000000000000000dEaD',
        '--out-dir', outDir,
        '--rpc-url', 'https://mock.example.com',
      ]),
    ).rejects.toThrow(/Mixed stakedAmount values/);
  });

  it('throws on zero stakedAmount value', async () => {
    await expect(
      runSlashCommand('slashStake', [
        '--csv', join(fixturesDir(), 'slash-stake-zero-amount.csv'),
        '--to', '0x000000000000000000000000000000000000dEaD',
        '--out-dir', outDir,
        '--rpc-url', 'https://mock.example.com',
      ]),
    ).rejects.toThrow(/stakedAmount must be positive or blank \(0 is not valid\)/);
  });

  it('throws when slashStake CSV missing stakedAmount header', async () => {
    await expect(
      runSlashCommand('slashStake', [
        '--csv', join(fixturesDir(), 'slash-no-staked-header.csv'),
        '--to', '0x000000000000000000000000000000000000dEaD',
        '--out-dir', outDir,
        '--rpc-url', 'https://mock.example.com',
      ]),
    ).rejects.toThrow(/CSV missing required header 'stakedAmount' for slashStake/);
  });

  it('throws on negative stakedAmount value', async () => {
    await expect(
      runSlashCommand('slashStake', [
        '--csv', join(fixturesDir(), 'slash-stake-negative-amount.csv'),
        '--to', '0x000000000000000000000000000000000000dEaD',
        '--out-dir', outDir,
        '--rpc-url', 'https://mock.example.com',
      ]),
    ).rejects.toThrow(/stakedAmount must be positive or blank/);
  });

  it('throws on non-numeric stakedAmount value', async () => {
    await expect(
      runSlashCommand('slashStake', [
        '--csv', join(fixturesDir(), 'slash-stake-invalid-amount.csv'),
        '--to', '0x000000000000000000000000000000000000dEaD',
        '--out-dir', outDir,
        '--rpc-url', 'https://mock.example.com',
      ]),
    ).rejects.toThrow(/invalid stakedAmount 'abc'.*Must be a positive wei integer or blank/);
  });

  it('rethrows non-NoLock RPC errors during on-chain query', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Simulate a generic RPC failure (not NoLock)
    mockCall.mockRejectedValue(new Error('connection timeout'));

    await expect(
      runSlashCommand('slash', [
        '--csv', join(fixturesDir(), 'slash-2-wallets.csv'),
        '--to', '0x000000000000000000000000000000000000dEaD',
        '--out-dir', outDir,
        '--rpc-url', 'https://mock.example.com',
      ]),
    ).rejects.toThrow(/connection timeout/);

    logSpy.mockRestore();
  });
});

describe('runSlashCommand - slashStake amount validation', () => {
  it('--slash-all full mode uses on-chain stakedAmount in transaction', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const onChainStakedWei = 7777000000000000000n; // 7.777 OMA
    mockCall.mockResolvedValue(encodeLockResult({ stakedAmount: onChainStakedWei }));

    await runSlashCommand('slashStake', [
      '--csv', join(fixturesDir(), 'slash-stake-blank-amounts.csv'),
      '--to', '0x000000000000000000000000000000000000dEaD',
      '--out-dir', outDir,
      '--rpc-url', 'https://mock.example.com',
      '--slash-all',
    ]);

    const safeBatch = JSON.parse(readFileSync(join(outDir, 'safe-tx.json'), 'utf8'));
    // Each transaction's contractInputsValues should contain the on-chain stakedAmount
    for (const tx of safeBatch.transactions) {
      expect(tx.contractInputsValues.amount_).toBe(onChainStakedWei.toString());
    }

    logSpy.mockRestore();
  });

  it('explicit mode uses CSV stakedAmount in transaction, not on-chain', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // On-chain has 10 OMA staked, CSV specifies 5 OMA and 1 OMA
    mockCall.mockResolvedValue(encodeLockResult({ stakedAmount: 10000000000000000000n }));

    await runSlashCommand('slashStake', [
      '--csv', join(fixturesDir(), 'slash-stake-2-wallets.csv'),
      '--to', '0x000000000000000000000000000000000000dEaD',
      '--out-dir', outDir,
      '--rpc-url', 'https://mock.example.com',
    ]);

    const safeBatch = JSON.parse(readFileSync(join(outDir, 'safe-tx.json'), 'utf8'));
    // slash-stake-2-wallets.csv has 5000000000000000000 and 1000000000000000000
    const amounts = safeBatch.transactions.map(
      (tx: { contractInputsValues: { amount_: string } }) => tx.contractInputsValues.amount_,
    );
    expect(amounts).toContain('5000000000000000000');
    expect(amounts).toContain('1000000000000000000');

    logSpy.mockRestore();
  });

  it('slashStake errors on first wallet with zero staked on-chain', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // First wallet (sorted by address): 0 staked, second: has staked
    let callIndex = 0;
    mockCall.mockImplementation(() => {
      callIndex++;
      if (callIndex === 1) {
        return encodeLockResult({ stakedAmount: 0n });
      }
      return encodeLockResult({ stakedAmount: 5000000000000000000n });
    });

    await expect(
      runSlashCommand('slashStake', [
        '--csv', join(fixturesDir(), 'slash-stake-2-wallets.csv'),
        '--to', '0x000000000000000000000000000000000000dEaD',
        '--out-dir', outDir,
        '--rpc-url', 'https://mock.example.com',
      ]),
    ).rejects.toThrow(/stakedAmount is 0 on-chain/);

    logSpy.mockRestore();
  });
});

describe('runSlashCommand - summary format', () => {
  it('summary includes expected sections', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockCall.mockResolvedValue(encodeLockResult({ stakedAmount: 0n }));

    await runSlashCommand('slash', [
      '--csv', join(fixturesDir(), 'slash-2-wallets.csv'),
      '--to', '0x000000000000000000000000000000000000dEaD',
      '--out-dir', outDir,
      '--rpc-url', 'https://mock.example.com',
    ]);

    const summary = readFileSync(join(outDir, 'safe-tx.summary.txt'), 'utf8');
    expect(summary).toContain('TRANSACTIONS');
    expect(summary).toContain('VALIDATION');
    expect(summary).toContain('WARNINGS');
    expect(summary).toContain('- duplicate addresses: pass');
    expect(summary).toContain('- on-chain lock check: pass');
    expect(summary).toContain('Destination (--to):');
    expect(summary).toContain('JSON SHA256:');
    expect(summary).toContain('Batch Fingerprint:');

    logSpy.mockRestore();
  });

  it('transaction lines include wallet, amount, and calldataHash', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockCall.mockResolvedValue(encodeLockResult({ stakedAmount: 0n }));

    await runSlashCommand('slash', [
      '--csv', join(fixturesDir(), 'slash-2-wallets.csv'),
      '--to', '0x000000000000000000000000000000000000dEaD',
      '--out-dir', outDir,
      '--rpc-url', 'https://mock.example.com',
    ]);

    const summary = readFileSync(join(outDir, 'safe-tx.summary.txt'), 'utf8');
    const txLines = summary.split('\n').filter((l) => l.startsWith('- tx '));
    expect(txLines).toHaveLength(2);
    for (const line of txLines) {
      expect(line).toContain('method=slash');
      expect(line).toContain('wallet=');
      expect(line).toContain('amount=');
      expect(line).toContain('calldataHash=');
    }

    logSpy.mockRestore();
  });

  it('Safe JSON schema valid for slash', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockCall.mockResolvedValue(encodeLockResult({ stakedAmount: 0n }));

    await runSlashCommand('slash', [
      '--csv', join(fixturesDir(), 'slash-2-wallets.csv'),
      '--to', '0x000000000000000000000000000000000000dEaD',
      '--out-dir', outDir,
      '--rpc-url', 'https://mock.example.com',
    ]);

    const safeBatch = JSON.parse(readFileSync(join(outDir, 'safe-tx.json'), 'utf8'));
    expect(safeBatch.version).toBe('1.0');
    expect(typeof safeBatch.chainId).toBe('string');
    expect(safeBatch.createdAt).toBe(0);
    expect(safeBatch.meta).toBeDefined();
    expect(safeBatch.meta.name).toContain('lock-slash');
    expect(Array.isArray(safeBatch.transactions)).toBe(true);

    for (const tx of safeBatch.transactions) {
      expect(typeof tx.to).toBe('string');
      expect(tx.value).toBe('0');
      expect(typeof tx.data).toBe('string');
      expect(tx.contractMethod).toBeDefined();
      expect(tx.contractInputsValues).toBeDefined();
    }

    logSpy.mockRestore();
  });
});
