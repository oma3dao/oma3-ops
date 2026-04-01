import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const RPC_URL = process.env.OMA3_OPS_RPC_URL_SEPOLIA;

// Skip all tests if no RPC URL is configured
const describeIf = RPC_URL ? describe : describe.skip;

// NOTE: Like lock-status.test.ts, this test shells out via execFileSync because
// lock-verify-json.ts is a CLI entry point with no exported functions.
const tsxPath = resolve(process.cwd(), 'node_modules', '.bin', 'tsx');
const scriptPath = resolve(process.cwd(), 'src', 'lock-verify-json.ts');
const fixturePath = resolve(process.cwd(), 'data', 'sepolia-known-locks.json');

interface ExecError {
  stderr?: string;
  stdout?: string;
  message?: string;
  status?: number;
}

function runVerifyJson(args: string[], env?: Record<string, string>): string {
  return execFileSync(tsxPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, OMA3_OPS_RPC_URL_SEPOLIA: RPC_URL, ...env },
    timeout: 60000,
    shell: true,
  });
}

function runVerifyJsonExpectError(args: string[]): string {
  try {
    execFileSync(tsxPath, [scriptPath, ...args], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, OMA3_OPS_RPC_URL_SEPOLIA: RPC_URL },
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });
    throw new Error('Expected command to fail');
  } catch (err: unknown) {
    const error = err as ExecError;
    const output = (error.stderr ?? '') + (error.stdout ?? '');
    return output || (error.message ?? '');
  }
}

describeIf('lock-verify-json integration', () => {
  let tmpDir: string;
  let tmpFixturePath: string;
  let originalFixtureContent: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'verify-json-test-'));
    // Save original fixture content so we can restore after tests that modify it
    originalFixtureContent = readFileSync(fixturePath, 'utf8');
    tmpFixturePath = join(tmpDir, 'sepolia-known-locks.json');
  });

  afterEach(() => {
    // Restore original fixture if it was modified
    writeFileSync(fixturePath, originalFixtureContent, 'utf8');
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('all entries match on-chain (dry-run)', () => {
    const output = runVerifyJson([
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
      '--dry-run',
    ]);

    expect(output).toContain('OK');
    expect(output).not.toContain('MISMATCH');
    expect(output).not.toContain('MISSING');

    // Fixture file should be unchanged
    const afterContent = readFileSync(fixturePath, 'utf8');
    expect(afterContent).toBe(originalFixtureContent);
  });

  it('rejects both --auto-fix and --dry-run', () => {
    const output = runVerifyJsonExpectError([
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
      '--auto-fix',
      '--dry-run',
    ]);

    expect(output).toContain('Cannot specify both');
  });

  it('RPC chain ID mismatch', () => {
    const mainnetFixturePath = resolve(process.cwd(), 'data', 'mainnet-known-locks.json');
    const savedMainnet = readFileSync(mainnetFixturePath, 'utf8');
    try {
      writeFileSync(mainnetFixturePath, JSON.stringify([{
        address: '0x0000000000000000000000000000000000000001',
        amount: '1.0', cliffDate: 1700000000, lockEndDate: 1800000000, source: 'test',
      }]) + '\n', 'utf8');

      const output = runVerifyJsonExpectError([
        '--network', 'mainnet',
        '--rpc-url', RPC_URL!,
      ]);

      expect(output.toLowerCase()).toContain('chain id mismatch');
    } finally {
      writeFileSync(mainnetFixturePath, savedMainnet, 'utf8');
    }
  });

  it('empty fixture file exits cleanly', () => {
    // Write empty array to the fixture file
    writeFileSync(fixturePath, '[]', 'utf8');

    const output = runVerifyJson([
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
      '--dry-run',
    ]);

    expect(output).toContain('empty');
  });

  it('mismatch detection in dry-run mode', () => {
    // Modify a fixture entry to have a wrong cliffDate
    const entries = JSON.parse(originalFixtureContent) as Array<Record<string, unknown>>;
    entries[0]!.cliffDate = 9999999;
    writeFileSync(fixturePath, JSON.stringify(entries, null, 2) + '\n', 'utf8');

    const output = runVerifyJson([
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
      '--dry-run',
    ]);

    expect(output).toContain('MISMATCH');
    expect(output).toContain('cliffDate');
    // Dry-run should not modify the fixture
    expect(output).toContain('Dry-run');

    const afterContent = readFileSync(fixturePath, 'utf8');
    const afterEntries = JSON.parse(afterContent) as Array<Record<string, unknown>>;
    expect(afterEntries[0]!.cliffDate).toBe(9999999);
  });

  it('mismatch auto-fix updates fixture', () => {
    const entries = JSON.parse(originalFixtureContent) as Array<Record<string, unknown>>;
    const originalCliffDate = entries[0]!.cliffDate;
    entries[0]!.cliffDate = 9999999;
    writeFileSync(fixturePath, JSON.stringify(entries, null, 2) + '\n', 'utf8');

    const output = runVerifyJson([
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
      '--auto-fix',
    ]);

    expect(output).toContain('MISMATCH');
    expect(output).toContain('Fixture updated');

    // Fixture should be corrected with on-chain value
    const afterContent = readFileSync(fixturePath, 'utf8');
    const afterEntries = JSON.parse(afterContent) as Array<Record<string, unknown>>;
    expect(afterEntries[0]!.cliffDate).toBe(originalCliffDate);
    // Source should be prefixed with 'verified:'
    expect(afterEntries[0]!.source).toMatch(/^verified:/);
  });

  it('missing lock detection in dry-run mode', () => {
    // Add a fake wallet with no on-chain lock
    const entries = JSON.parse(originalFixtureContent) as Array<Record<string, unknown>>;
    entries.push({
      address: '0x0000000000000000000000000000000000000001',
      amount: '1.0',
      cliffDate: 1700000000,
      lockEndDate: 1800000000,
      source: 'test',
    });
    writeFileSync(fixturePath, JSON.stringify(entries, null, 2) + '\n', 'utf8');

    const output = runVerifyJson([
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
      '--dry-run',
    ]);

    expect(output).toContain('MISSING');
    // Dry-run should preserve the entry
    const afterEntries = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[];
    expect(afterEntries).toHaveLength(entries.length);
  });

  it('missing lock auto-fix removes entry', () => {
    const entries = JSON.parse(originalFixtureContent) as Array<Record<string, unknown>>;
    const originalCount = entries.length;
    entries.push({
      address: '0x0000000000000000000000000000000000000001',
      amount: '1.0',
      cliffDate: 1700000000,
      lockEndDate: 1800000000,
      source: 'test',
    });
    writeFileSync(fixturePath, JSON.stringify(entries, null, 2) + '\n', 'utf8');

    const output = runVerifyJson([
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
      '--auto-fix',
    ]);

    expect(output).toContain('MISSING');
    expect(output).toContain('Fixture updated');

    const afterEntries = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown[];
    expect(afterEntries).toHaveLength(originalCount);
  });

  it('default mode on sepolia behaves as auto-fix', () => {
    // Modify a fixture entry
    const entries = JSON.parse(originalFixtureContent) as Array<Record<string, unknown>>;
    entries[0]!.cliffDate = 9999999;
    writeFileSync(fixturePath, JSON.stringify(entries, null, 2) + '\n', 'utf8');

    const output = runVerifyJson([
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
    ]);

    // Default on sepolia should auto-fix
    expect(output).toContain('Mode: auto-fix');
    expect(output).toContain('MISMATCH');
    expect(output).toContain('Fixture updated');
  });

  it('prints summary counts', () => {
    const output = runVerifyJson([
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
      '--dry-run',
    ]);

    expect(output).toMatch(/Results: \d+ OK, \d+ mismatch, \d+ missing/);
  });

  it('amount mismatch detected', () => {
    const entries = JSON.parse(originalFixtureContent) as Array<Record<string, unknown>>;
    entries[0]!.amount = '999999.0';
    writeFileSync(fixturePath, JSON.stringify(entries, null, 2) + '\n', 'utf8');

    const output = runVerifyJson([
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
      '--dry-run',
    ]);

    expect(output).toContain('MISMATCH');
    expect(output).toContain('amount');
  });

  it('lockEndDate mismatch detected', () => {
    const entries = JSON.parse(originalFixtureContent) as Array<Record<string, unknown>>;
    entries[0]!.lockEndDate = 8888888;
    writeFileSync(fixturePath, JSON.stringify(entries, null, 2) + '\n', 'utf8');

    const output = runVerifyJson([
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
      '--dry-run',
    ]);

    expect(output).toContain('MISMATCH');
    expect(output).toContain('lockEndDate');
  });

  it('multiple mismatches in one entry', () => {
    const entries = JSON.parse(originalFixtureContent) as Array<Record<string, unknown>>;
    entries[0]!.cliffDate = 9999999;
    entries[0]!.lockEndDate = 8888888;
    writeFileSync(fixturePath, JSON.stringify(entries, null, 2) + '\n', 'utf8');

    const output = runVerifyJson([
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
      '--dry-run',
    ]);

    expect(output).toContain('MISMATCH');
    expect(output).toContain('cliffDate');
    expect(output).toContain('lockEndDate');
  });

  it('auto-fix preserves entry order', () => {
    const entries = JSON.parse(originalFixtureContent) as Array<Record<string, unknown>>;
    const entryCount = entries.length;
    expect(entryCount).toBeGreaterThanOrEqual(3);

    const middleIndex = Math.floor(entryCount / 2);
    entries[middleIndex]!.cliffDate = 9999999;
    writeFileSync(fixturePath, JSON.stringify(entries, null, 2) + '\n', 'utf8');

    runVerifyJson([
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
      '--auto-fix',
    ]);

    const afterEntries = JSON.parse(readFileSync(fixturePath, 'utf8')) as Array<Record<string, unknown>>;

    const okEntries = afterEntries.filter((_, i) => i !== middleIndex);
    const originalOkEntries = JSON.parse(originalFixtureContent)
      .filter((_: unknown, i: number) => i !== middleIndex) as Array<Record<string, unknown>>;

    for (let i = 0; i < okEntries.length; i++) {
      expect(okEntries[i]!.address, `entry ${i} address preserved`).toBe(originalOkEntries[i]!.address);
    }
  });

  it('auto-fix removes missing and updates mismatched in one pass', () => {
    const entries = JSON.parse(originalFixtureContent) as Array<Record<string, unknown>>;
    const originalCount = entries.length;

    entries[0]!.cliffDate = 9999999;

    entries.push({
      address: '0x0000000000000000000000000000000000000099',
      amount: '1.0',
      cliffDate: 1700000000,
      lockEndDate: 1800000000,
      source: 'test:fake',
    });
    writeFileSync(fixturePath, JSON.stringify(entries, null, 2) + '\n', 'utf8');

    const output = runVerifyJson([
      '--network', 'sepolia',
      '--rpc-url', RPC_URL!,
      '--auto-fix',
    ]);

    expect(output).toContain('MISMATCH');
    expect(output).toContain('MISSING');
    expect(output).toContain('Fixture updated');

    const afterEntries = JSON.parse(readFileSync(fixturePath, 'utf8')) as Array<Record<string, unknown>>;
    expect(afterEntries).toHaveLength(originalCount);

    expect(afterEntries[0]!.source).toMatch(/^verified:/);

    const fakeAddr = afterEntries.find(
      (e) => (e.address as string).toLowerCase() === '0x0000000000000000000000000000000000000099',
    );
    expect(fakeAddr, 'fake missing entry should be removed').toBeUndefined();
  });
});
