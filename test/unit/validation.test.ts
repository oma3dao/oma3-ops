import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseRows } from '../../src/run-lock-command.js';
import { parseAnchorDateUtc } from '../../src/date-utils.js';
import { assertNoUnknownOptions, getRequiredOption } from '../../src/cli-utils.js';

const ANCHOR = new Date('2025-01-31T00:00:00Z');
const DECIMALS = 18;

let tmpDir: string;
let outDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'validation-test-'));
  outDir = join(tmpDir, 'out');
  mkdirSync(outDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

/** Asserts the output directory remains empty (fail-closed principle). */
function assertNoOutputFiles(): void {
  if (existsSync(outDir)) {
    const files = readdirSync(outDir);
    expect(files, 'Output directory should be empty after validation failure').toHaveLength(0);
  }
}

function writeCsv(content: string): string {
  const path = join(tmpDir, 'test.csv');
  writeFileSync(path, content, 'utf8');
  return path;
}

function runParseRows(csvContent: string, opts?: { requireAmountWei?: boolean }) {
  const path = writeCsv(csvContent);
  return parseRows({
    csvPath: path,
    anchorDate: ANCHOR,
    decimals: DECIMALS,
    requireAmountWei: opts?.requireAmountWei ?? false,
  });
}

describe('validation: missing headers', () => {
  it('missing address header', () => {
    expect(() =>
      runParseRows('wallet,amount,cliffOffsetMonths,lockEndOffsetMonths\n0x01,100,6,12'),
    ).toThrow(/Missing required CSV header/);
    assertNoOutputFiles();
  });

  it('missing amount header', () => {
    expect(() =>
      runParseRows('address,cliffOffsetMonths,lockEndOffsetMonths\n0x01,6,12'),
    ).toThrow(/Missing required CSV header/);
    assertNoOutputFiles();
  });

  it('missing cliffOffsetMonths header', () => {
    expect(() =>
      runParseRows('address,amount,lockEndOffsetMonths\n0x01,100,12'),
    ).toThrow(/Missing required CSV header/);
    assertNoOutputFiles();
  });

  it('missing lockEndOffsetMonths header', () => {
    expect(() =>
      runParseRows('address,amount,cliffOffsetMonths\n0x01,100,6'),
    ).toThrow(/Missing required CSV header/);
    assertNoOutputFiles();
  });
});

describe('validation: field values', () => {
  it('blank address value', () => {
    expect(() =>
      runParseRows('address,amount,cliffOffsetMonths,lockEndOffsetMonths\n,100,6,12'),
    ).toThrow(/address is required/);
    assertNoOutputFiles();
  });

  it('blank amount value', () => {
    expect(() =>
      runParseRows(
        'address,amount,cliffOffsetMonths,lockEndOffsetMonths\n0x0000000000000000000000000000000000000001,,6,12',
      ),
    ).toThrow(/amount is required/);
    assertNoOutputFiles();
  });

  it('invalid EVM address', () => {
    expect(() =>
      runParseRows(
        'address,amount,cliffOffsetMonths,lockEndOffsetMonths\nnotanaddress,100,6,12',
      ),
    ).toThrow(/invalid EVM address/);
    assertNoOutputFiles();
  });

  it('duplicate address', () => {
    expect(() =>
      runParseRows(
        [
          'address,amount,cliffOffsetMonths,lockEndOffsetMonths',
          '0x0000000000000000000000000000000000000001,100,6,12',
          '0x0000000000000000000000000000000000000001,200,6,12',
        ].join('\n'),
      ),
    ).toThrow(/duplicate address/);
    assertNoOutputFiles();
  });

  it('duplicate address (case-insensitive)', () => {
    expect(() =>
      runParseRows(
        [
          'address,amount,cliffOffsetMonths,lockEndOffsetMonths',
          '0x000000000000000000000000000000000000000A,100,6,12',
          '0x000000000000000000000000000000000000000a,200,6,12',
        ].join('\n'),
      ),
    ).toThrow(/duplicate address/i);
    assertNoOutputFiles();
  });

  it('amount zero', () => {
    expect(() =>
      runParseRows(
        'address,amount,cliffOffsetMonths,lockEndOffsetMonths\n0x0000000000000000000000000000000000000001,0,6,12',
      ),
    ).toThrow(/amount must be positive/);
    assertNoOutputFiles();
  });

  it('amount negative', () => {
    expect(() =>
      runParseRows(
        'address,amount,cliffOffsetMonths,lockEndOffsetMonths\n0x0000000000000000000000000000000000000001,-100,6,12',
      ),
    ).toThrow();
    assertNoOutputFiles();
  });

  it('amount exceeds uint96', () => {
    const uint96 = '79228162514264337593543950336'; // 2^96
    expect(() =>
      runParseRows(
        `address,amount,cliffOffsetMonths,lockEndOffsetMonths\n0x0000000000000000000000000000000000000001,${uint96},6,12`,
      ),
    ).toThrow(/exceeds uint96 max/);
    assertNoOutputFiles();
  });
});

describe('validation: amountWei', () => {
  it('amountWei mismatch', () => {
    expect(() =>
      runParseRows(
        'address,amount,cliffOffsetMonths,lockEndOffsetMonths,amountWei\n0x0000000000000000000000000000000000000001,1,6,12,999',
      ),
    ).toThrow(/amountWei mismatch/);
    assertNoOutputFiles();
  });

  it('amountWei zero', () => {
    expect(() =>
      runParseRows(
        'address,amount,cliffOffsetMonths,lockEndOffsetMonths,amountWei\n0x0000000000000000000000000000000000000001,1,6,12,0',
      ),
    ).toThrow(/amountWei must be positive/);
    assertNoOutputFiles();
  });

  it('amountWei non-integer', () => {
    expect(() =>
      runParseRows(
        'address,amount,cliffOffsetMonths,lockEndOffsetMonths,amountWei\n0x0000000000000000000000000000000000000001,1,6,12,1.5',
      ),
    ).toThrow();
    assertNoOutputFiles();
  });

  it('amountWei must be unsigned integer (rejects non-numeric)', () => {
    expect(() =>
      runParseRows(
        'address,amount,cliffOffsetMonths,lockEndOffsetMonths,amountWei\n0x0000000000000000000000000000000000000001,1,6,12,abc',
      ),
    ).toThrow(/amountWei must be an unsigned integer/);
    assertNoOutputFiles();
  });
});

describe('validation: offsets', () => {
  it('cliffOffsetMonths non-integer', () => {
    expect(() =>
      runParseRows(
        'address,amount,cliffOffsetMonths,lockEndOffsetMonths\n0x0000000000000000000000000000000000000001,100,1.5,12',
      ),
    ).toThrow(/must be an integer/);
    assertNoOutputFiles();
  });

  it('cliffOffsetMonths negative', () => {
    expect(() =>
      runParseRows(
        'address,amount,cliffOffsetMonths,lockEndOffsetMonths\n0x0000000000000000000000000000000000000001,100,-1,12',
      ),
    ).toThrow(/must be >= 0/);
    assertNoOutputFiles();
  });

  it('lockEndOffsetMonths equal to cliffOffsetMonths', () => {
    expect(() =>
      runParseRows(
        'address,amount,cliffOffsetMonths,lockEndOffsetMonths\n0x0000000000000000000000000000000000000001,100,12,12',
      ),
    ).toThrow(/lockEndOffsetMonths must be > cliffOffsetMonths/);
    assertNoOutputFiles();
  });

  it('lockEndOffsetMonths less than cliffOffsetMonths', () => {
    expect(() =>
      runParseRows(
        'address,amount,cliffOffsetMonths,lockEndOffsetMonths\n0x0000000000000000000000000000000000000001,100,12,6',
      ),
    ).toThrow(/lockEndOffsetMonths must be > cliffOffsetMonths/);
    assertNoOutputFiles();
  });
});

describe('validation: anchor date', () => {
  it('missing --anchor-date-utc', () => {
    const options = new Map<string, string | true>();
    expect(() => getRequiredOption(options, 'anchor-date-utc')).toThrow(
      'Missing required option',
    );
  });

  it('anchor with +00:00 rejected', () => {
    expect(() => parseAnchorDateUtc('2025-01-31T00:00:00+00:00')).toThrow();
  });
});

describe('validation: timestamp overflow', () => {
  it('resolved cliffDate exceeds uint40', () => {
    // uint40 max is ~year 36812. Use large month offsets from 2025 to exceed it.
    const path = writeCsv(
      'address,amount,cliffOffsetMonths,lockEndOffsetMonths\n0x0000000000000000000000000000000000000001,100,420000,420001',
    );
    expect(() =>
      parseRows({
        csvPath: path,
        anchorDate: ANCHOR,
        decimals: DECIMALS,
        requireAmountWei: false,
      }),
    ).toThrow(/exceeds uint40 max/);
    assertNoOutputFiles();
  });
});

describe('validation: no data rows', () => {
  it('no data rows in CSV', () => {
    expect(() =>
      runParseRows('address,amount,cliffOffsetMonths,lockEndOffsetMonths\n'),
    ).toThrow(/no data rows/);
    assertNoOutputFiles();
  });
});

describe('validation: require-amount-wei', () => {
  it('--require-amount-wei but column absent', () => {
    expect(() =>
      runParseRows(
        'address,amount,cliffOffsetMonths,lockEndOffsetMonths\n0x0000000000000000000000000000000000000001,100,6,12',
        { requireAmountWei: true },
      ),
    ).toThrow();
    assertNoOutputFiles();
  });

  it('blank amountWei when column present', () => {
    expect(() =>
      runParseRows(
        'address,amount,cliffOffsetMonths,lockEndOffsetMonths,amountWei\n0x0000000000000000000000000000000000000001,1,6,12,',
      ),
    ).toThrow();
    assertNoOutputFiles();
  });
});

describe('validation: --input flag rejected', () => {
  it('--input flag is unknown', () => {
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
});
