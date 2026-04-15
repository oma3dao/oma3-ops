import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { Interface, JsonRpcProvider, getAddress, formatUnits } from 'ethers';
import { loadFixtures, type KnownLockEntry } from '../../src/known-locks.js';
import { getNetworkConfig } from '../../src/config.js';

const RPC_URL = process.env.OMA3_OPS_RPC_URL_SEPOLIA;

// Skip all integration tests if no RPC URL is configured
const describeIf = RPC_URL ? describe : describe.skip;

const WALLET_NO_LOCK = '0x0000000000000000000000000000000000000001';
const ANOTHER_WALLET = '0x0000000000000000000000000000000000000002';
const WALLET_WITH_LOCK = process.env.OMA3_OPS_WALLET_WITH_LOCK_SEPOLIA;

const LOCK_ABI = [
  'function getLock(address wallet_) view returns (tuple(uint40 timestamp, uint40 cliffDate, uint40 lockEndDate, uint96 amount, uint96 claimedAmount, uint96 stakedAmount, uint96 slashedAmount) lock, uint96 unlockedAmount)',
  'function omaToken() view returns (address)',
] as const;
const TOKEN_ABI = ['function decimals() view returns (uint8)'] as const;

const FIXTURE_PATH = resolve(process.cwd(), 'data', 'sepolia-known-locks.json');

function getUniqueFixtureAddresses(): string[] {
  const entries = loadFixtures(FIXTURE_PATH);
  const seen = new Set<string>();
  const addresses: string[] = [];
  for (const entry of entries) {
    const lower = entry.address.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      addresses.push(entry.address);
    }
  }
  return addresses;
}

let tmpDir: string;

// NOTE: This test shells out via execFileSync rather than using the import-and-mock
// pattern (as used in unit tests). This is intentional — lock-status.ts is a CLI
// entry point with no exported functions; it reads process.argv, writes to stdout,
// and sets process.exitCode directly. Shelling out tests the full CLI surface
// (arg parsing, RPC calls, stdout formatting, JSON output) end-to-end.
const tsxPath = resolve(process.cwd(), 'node_modules', '.bin', 'tsx');
const scriptPath = resolve(process.cwd(), 'src', 'lock-status.ts');

function runLockStatus(args: string[]): string {
  return execFileSync(tsxPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, OMA3_OPS_RPC_URL_SEPOLIA: RPC_URL },
    timeout: 30000,
    shell: true,
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
      shell: true,
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

  it('batch via --csv from fixture addresses', () => {
    const addresses = getUniqueFixtureAddresses();
    const csvPath = join(tmpDir, 'wallets.csv');
    writeFileSync(csvPath, 'address\n' + addresses.join('\n') + '\n', 'utf8');
    const outPath = join(tmpDir, 'batch.json');

    runLockStatus([
      '--csv', csvPath,
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
      '--out', outPath,
    ]);

    const results = JSON.parse(readFileSync(outPath, 'utf8')) as Array<Record<string, unknown>>;
    expect(results).toHaveLength(addresses.length);

    for (const addr of addresses) {
      const match = results.find(
        (r) => (r.address as string).toLowerCase() === addr.toLowerCase(),
      );
      expect(match, `result should include ${addr}`).toBeDefined();
    }
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

describeIf('lock-status cross-verification against direct RPC', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'lock-status-xverify-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lock-status output matches direct getLock() RPC for all fixture wallets', async () => {
    const network = getNetworkConfig('sepolia');
    const lockIface = new Interface(LOCK_ABI);
    const tokenIface = new Interface(TOKEN_ABI);
    const provider = new JsonRpcProvider(RPC_URL);

    const omaTokenCallData = lockIface.encodeFunctionData('omaToken', []);
    const omaTokenResult = await provider.call({ to: network.omaLock, data: omaTokenCallData });
    const omaToken = getAddress(lockIface.decodeFunctionResult('omaToken', omaTokenResult)[0] as string);

    const decimalsResult = await provider.call({ to: omaToken, data: tokenIface.encodeFunctionData('decimals', []) });
    const decimals = Number(tokenIface.decodeFunctionResult('decimals', decimalsResult)[0] as bigint);

    const addresses = getUniqueFixtureAddresses();

    const outPath = join(tmpDir, 'xverify.json');
    runLockStatus([
      '--wallet', ...addresses,
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
      '--out', outPath,
    ]);
    const cliResults = JSON.parse(readFileSync(outPath, 'utf8')) as Array<Record<string, unknown>>;

    for (const addr of addresses) {
      const cliResult = cliResults.find(
        (r) => (r.address as string).toLowerCase() === addr.toLowerCase(),
      );
      expect(cliResult, `lock-status should include ${addr}`).toBeDefined();

      try {
        const callData = lockIface.encodeFunctionData('getLock', [addr]);
        const result = await provider.call({ to: network.omaLock, data: callData });
        const decoded = lockIface.decodeFunctionResult('getLock', result);
        const lock = decoded[0] as {
          timestamp: bigint; cliffDate: bigint; lockEndDate: bigint;
          amount: bigint; claimedAmount: bigint; stakedAmount: bigint; slashedAmount: bigint;
        };
        const unlockedAmount = decoded[1] as bigint;

        expect(cliResult!.hasLock, `${addr} hasLock`).toBe(true);
        expect(cliResult!.timestamp, `${addr} timestamp`).toBe(Number(lock.timestamp));
        expect(cliResult!.cliffDate, `${addr} cliffDate`).toBe(Number(lock.cliffDate));
        expect(cliResult!.lockEndDate, `${addr} lockEndDate`).toBe(Number(lock.lockEndDate));
        expect(cliResult!.amountWei, `${addr} amountWei`).toBe(lock.amount.toString());
        expect(cliResult!.claimedAmountWei, `${addr} claimedAmountWei`).toBe(lock.claimedAmount.toString());
        expect(cliResult!.stakedAmountWei, `${addr} stakedAmountWei`).toBe(lock.stakedAmount.toString());
        expect(cliResult!.slashedAmountWei, `${addr} slashedAmountWei`).toBe(lock.slashedAmount.toString());
        expect(cliResult!.unlockedAmountWei, `${addr} unlockedAmountWei`).toBe(unlockedAmount.toString());
        expect(cliResult!.amount, `${addr} amount`).toBe(formatUnits(lock.amount, decimals));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('NoLock') || message.includes('0xd8216464')) {
          expect(cliResult!.hasLock, `${addr} hasLock (no lock)`).toBe(false);
        } else {
          throw err;
        }
      }
    }
  }, 90_000);

  it('fixture immutable fields match on-chain for wallets with locks', async () => {
    const network = getNetworkConfig('sepolia');
    const lockIface = new Interface(LOCK_ABI);
    const provider = new JsonRpcProvider(RPC_URL);

    const entries = loadFixtures(FIXTURE_PATH);
    const seen = new Set<string>();
    let verifiedCount = 0;

    for (const entry of entries) {
      const lower = entry.address.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);

      try {
        const callData = lockIface.encodeFunctionData('getLock', [entry.address]);
        const result = await provider.call({ to: network.omaLock, data: callData });
        const decoded = lockIface.decodeFunctionResult('getLock', result);
        const lock = decoded[0] as {
          amount: bigint; cliffDate: bigint; lockEndDate: bigint;
        };

        const onChainAmount = formatUnits(lock.amount, 18);
        expect(entry.amount, `${entry.address} amount`).toBe(onChainAmount);
        expect(entry.cliffDate, `${entry.address} cliffDate`).toBe(Number(lock.cliffDate));
        expect(entry.lockEndDate, `${entry.address} lockEndDate`).toBe(Number(lock.lockEndDate));
        verifiedCount++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes('NoLock') && !message.includes('0xd8216464')) {
          throw err;
        }
      }
    }

    expect(verifiedCount, 'at least one fixture wallet should have an on-chain lock').toBeGreaterThan(0);
  }, 90_000);
});
