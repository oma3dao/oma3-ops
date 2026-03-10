import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getFixturePath, loadFixtures, saveFixtures, type KnownLockEntry } from '../../src/known-locks.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'known-locks-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('getFixturePath', () => {
  it('returns path ending with data/{network}-known-locks.json', () => {
    const path = getFixturePath('sepolia');
    expect(path).toMatch(/data[/\\]sepolia-known-locks\.json$/);
  });

  it('returns different paths for different networks', () => {
    const sepoliaPath = getFixturePath('sepolia');
    const mainnetPath = getFixturePath('mainnet');
    expect(sepoliaPath).not.toBe(mainnetPath);
    expect(mainnetPath).toMatch(/data[/\\]mainnet-known-locks\.json$/);
  });
});

describe('loadFixtures', () => {
  it('returns empty array if file does not exist', () => {
    const path = join(tmpDir, 'nonexistent.json');
    const result = loadFixtures(path);
    expect(result).toEqual([]);
  });

  it('loads JSON array from file', () => {
    const entries: KnownLockEntry[] = [
      { address: '0x0000000000000000000000000000000000000001', amount: '100.0', cliffDate: 1000, lockEndDate: 2000, source: 'test' },
    ];
    const path = join(tmpDir, 'test.json');
    writeFileSync(path, JSON.stringify(entries), 'utf8');

    const result = loadFixtures(path);
    expect(result).toHaveLength(1);
    expect(result[0]!.address).toBe('0x0000000000000000000000000000000000000001');
    expect(result[0]!.amount).toBe('100.0');
    expect(result[0]!.source).toBe('test');
  });

  it('throws if file is not a JSON array', () => {
    const path = join(tmpDir, 'bad.json');
    writeFileSync(path, '{"not": "an array"}', 'utf8');

    expect(() => loadFixtures(path)).toThrow(/not a JSON array/);
  });
});

describe('saveFixtures', () => {
  it('writes entries as JSON array with trailing newline', () => {
    const entries: KnownLockEntry[] = [
      { address: '0x0000000000000000000000000000000000000001', amount: '100.0', cliffDate: 1000, lockEndDate: 2000, source: 'test' },
      { address: '0x0000000000000000000000000000000000000002', amount: '200.0', cliffDate: 1000, lockEndDate: 2000, source: 'test' },
    ];
    const path = join(tmpDir, 'output.json');

    saveFixtures(path, entries);

    const content = readFileSync(path, 'utf8');
    expect(content.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(content) as KnownLockEntry[];
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.address).toBe('0x0000000000000000000000000000000000000001');
    expect(parsed[1]!.address).toBe('0x0000000000000000000000000000000000000002');
  });

  it('round-trips through loadFixtures', () => {
    const entries: KnownLockEntry[] = [
      { address: '0x0000000000000000000000000000000000000001', amount: '100.0', cliffDate: 1000, lockEndDate: 2000, source: 'addLocks:abc' },
    ];
    const path = join(tmpDir, 'roundtrip.json');

    saveFixtures(path, entries);
    const loaded = loadFixtures(path);

    expect(loaded).toEqual(entries);
  });

  it('writes empty array', () => {
    const path = join(tmpDir, 'empty.json');

    saveFixtures(path, []);

    const loaded = loadFixtures(path);
    expect(loaded).toEqual([]);
  });
});
