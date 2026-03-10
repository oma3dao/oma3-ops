import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const RPC_URL = process.env.OMA3_OPS_RPC_URL_SEPOLIA;

// Skip all integration tests if no RPC URL is configured
const describeIf = RPC_URL ? describe : describe.skip;

// Addresses for Sepolia testing.
// Address 0x01 has no lock on Sepolia (it's a precompile).
// For "wallet with lock" tests, set OMA3_OPS_WALLET_WITH_LOCK_SEPOLIA to a known
// wallet address that has an active lock on the Sepolia OMALock contract.
const WALLET_NO_LOCK = '0x0000000000000000000000000000000000000001';
const ANOTHER_WALLET = '0x0000000000000000000000000000000000000002';
const WALLET_WITH_LOCK = process.env.OMA3_OPS_WALLET_WITH_LOCK_SEPOLIA;

let tmpDir: string;

const tsxPath = resolve(process.cwd(), 'node_modules', '.bin', 'tsx');
const scriptPath = resolve(process.cwd(), 'src', 'lock-status.ts');

function runLockStatus(args: string[]): string {
  return execFileSync(tsxPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, OMA3_OPS_RPC_URL_SEPOLIA: RPC_URL },
    timeout: 30000,
  });
}

interface ExecError {
  stderr?: string;
  stdout?: string;
  message?: string;
  status?: number;
}

function runLockStatusExpectError(args: string[]): string {
  try {
    execFileSync(tsxPath, [scriptPath, ...args], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, OMA3_OPS_RPC_URL_SEPOLIA: RPC_URL },
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    throw new Error('Expected command to fail');
  } catch (err: unknown) {
    const error = err as ExecError;
    return (error.stderr ?? '') + (error.stdout ?? '');
  }
}

describeIf('lock-status integration', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'lock-status-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('single wallet without lock returns hasLock: false', () => {
    const outPath = join(tmpDir, 'result.json');

    runLockStatus([
      '--wallet', WALLET_NO_LOCK,
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
      '--out', outPath,
    ]);

    const results = JSON.parse(readFileSync(outPath, 'utf8')) as Array<Record<string, unknown>>;
    expect(results).toHaveLength(1);
    expect(results[0]!.hasLock).toBe(false);
    expect(results[0]!.timestamp).toBeNull();
    expect(results[0]!.cliffDate).toBeNull();
    expect(results[0]!.lockEndDate).toBeNull();
    expect(results[0]!.amount).toBeNull();
  });

  it('single wallet query prints address', () => {
    const output = runLockStatus([
      '--wallet', WALLET_NO_LOCK,
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
    ]);
    expect(output.toLowerCase()).toContain(WALLET_NO_LOCK.toLowerCase().slice(2));
  });

  it('multiple wallets via --wallet', () => {
    const outPath = join(tmpDir, 'multi.json');

    runLockStatus([
      '--wallet', WALLET_NO_LOCK, ANOTHER_WALLET,
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
      '--out', outPath,
    ]);

    const results = JSON.parse(readFileSync(outPath, 'utf8')) as unknown[];
    expect(results).toHaveLength(2);
  });

  it('batch via --csv', () => {
    const csvPath = join(tmpDir, 'wallets.csv');
    writeFileSync(csvPath, `address\n${WALLET_NO_LOCK}\n${ANOTHER_WALLET}\n`, 'utf8');
    const outPath = join(tmpDir, 'batch.json');

    runLockStatus([
      '--csv', csvPath,
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
      '--out', outPath,
    ]);

    const results = JSON.parse(readFileSync(outPath, 'utf8')) as unknown[];
    expect(results).toHaveLength(2);
  });

  it('--out writes JSON file', () => {
    const outPath = join(tmpDir, 'test-output.json');

    runLockStatus([
      '--wallet', WALLET_NO_LOCK,
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
      '--out', outPath,
    ]);

    expect(existsSync(outPath)).toBe(true);
    const content = JSON.parse(readFileSync(outPath, 'utf8'));
    expect(Array.isArray(content)).toBe(true);
    expect(content.length).toBeGreaterThan(0);
  });

  it('rejects both --wallet and --csv', () => {
    const csvPath = join(tmpDir, 'wallets.csv');
    writeFileSync(csvPath, `address\n${WALLET_NO_LOCK}\n`, 'utf8');

    const output = runLockStatusExpectError([
      '--wallet', WALLET_NO_LOCK,
      '--csv', csvPath,
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
    ]);
    expect(output).toContain('not both');
  });

  it('rejects neither --wallet nor --csv', () => {
    const output = runLockStatusExpectError([
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
    ]);
    expect(output).toContain('--wallet');
  });

  it('rejects duplicate addresses', () => {
    const output = runLockStatusExpectError([
      '--wallet', WALLET_NO_LOCK, WALLET_NO_LOCK,
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
    ]);
    expect(output.toLowerCase()).toContain('duplicate');
  });

  it('rejects invalid address', () => {
    const output = runLockStatusExpectError([
      '--wallet', 'notanaddress',
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
    ]);
    expect(output.toLowerCase()).toContain('invalid');
  });

  it('RPC chain ID mismatch', () => {
    const output = runLockStatusExpectError([
      '--wallet', WALLET_NO_LOCK,
      '--network', 'mainnet',
      '--rpc-url', RPC_URL!,
    ]);
    expect(output.toLowerCase()).toContain('chain id mismatch');
  });
});

// Separate describe block for tests requiring a wallet with an active lock.
// Set OMA3_OPS_WALLET_WITH_LOCK_SEPOLIA to enable these tests.
const describeIfLocked = RPC_URL && WALLET_WITH_LOCK ? describe : describe.skip;

describeIfLocked('lock-status integration (hasLock: true)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'lock-status-locked-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('wallet with lock returns hasLock: true and populated fields', () => {
    const outPath = join(tmpDir, 'locked.json');

    runLockStatus([
      '--wallet', WALLET_WITH_LOCK!,
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
      '--out', outPath,
    ]);

    const results = JSON.parse(readFileSync(outPath, 'utf8')) as Array<Record<string, unknown>>;
    expect(results).toHaveLength(1);

    const r = results[0]!;
    expect(r.hasLock).toBe(true);
    expect(typeof r.timestamp).toBe('number');
    expect(r.timestamp).toBeGreaterThan(0);
    expect(typeof r.timestampUtc).toBe('string');
    expect(typeof r.cliffDate).toBe('number');
    expect(r.cliffDate).toBeGreaterThan(0);
    expect(typeof r.cliffDateUtc).toBe('string');
    expect(typeof r.lockEndDate).toBe('number');
    expect(r.lockEndDate).toBeGreaterThan(0);
    expect(typeof r.lockEndDateUtc).toBe('string');
    expect(typeof r.amount).toBe('string');
    expect(typeof r.amountWei).toBe('string');
    expect(BigInt(r.amountWei as string)).toBeGreaterThan(0n);
    expect(typeof r.claimedAmountWei).toBe('string');
    expect(typeof r.stakedAmountWei).toBe('string');
    expect(typeof r.slashedAmountWei).toBe('string');
    expect(typeof r.unlockedAmountWei).toBe('string');
    expect(typeof r.claimableWei).toBe('string');
    expect(typeof r.vestingProgress).toBe('string');
    expect(r.vestingProgress).toMatch(/^\d+\.\d+%$/);
  });

  it('wallet with lock prints hasLock: true in stdout', () => {
    const output = runLockStatus([
      '--wallet', WALLET_WITH_LOCK!,
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
    ]);
    expect(output).toContain('hasLock:         true');
    expect(output).toContain('amount:');
    expect(output).toContain('OMA');
  });

  it('mixed locked and unlocked wallets', () => {
    const outPath = join(tmpDir, 'mixed.json');

    runLockStatus([
      '--wallet', WALLET_WITH_LOCK!, WALLET_NO_LOCK,
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
      '--out', outPath,
    ]);

    const results = JSON.parse(readFileSync(outPath, 'utf8')) as Array<Record<string, unknown>>;
    expect(results).toHaveLength(2);

    const locked = results.find((r) => r.hasLock === true);
    const unlocked = results.find((r) => r.hasLock === false);
    expect(locked).toBeDefined();
    expect(unlocked).toBeDefined();
    expect(locked!.amountWei).not.toBeNull();
    expect(unlocked!.amountWei).toBeNull();
  });
});
