import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseCsvFile, requireHeaders } from '../../src/csv-utils.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'csv-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeCsv(name: string, content: string): string {
  const path = join(tmpDir, name);
  writeFileSync(path, content, 'utf8');
  return path;
}

describe('parseCsvFile', () => {
  it('parses valid CSV with header row', () => {
    const path = writeCsv('valid.csv', [
      'address,amount,cliffOffsetMonths,lockEndOffsetMonths',
      '0x0000000000000000000000000000000000000001,100,6,12',
      '0x0000000000000000000000000000000000000002,200,6,12',
      '0x0000000000000000000000000000000000000003,300,6,12',
    ].join('\n'));

    const result = parseCsvFile(path);

    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]!.values.address).toBe('0x0000000000000000000000000000000000000001');
    expect(result.rows[0]!.values.amount).toBe('100');
    expect(result.rows[0]!.lineNumber).toBe(2);
    expect(result.rows[1]!.values.amount).toBe('200');
    expect(result.rows[1]!.lineNumber).toBe(3);
    expect(result.rows[2]!.values.amount).toBe('300');
    expect(result.rows[2]!.lineNumber).toBe(4);
  });

  it('parses by header name, not position', () => {
    const path = writeCsv('reordered.csv', [
      'lockEndOffsetMonths,amount,cliffOffsetMonths,address',
      '12,100,6,0x0000000000000000000000000000000000000001',
    ].join('\n'));

    const result = parseCsvFile(path);

    expect(result.rows[0]!.values.address).toBe('0x0000000000000000000000000000000000000001');
    expect(result.rows[0]!.values.amount).toBe('100');
    expect(result.rows[0]!.values.cliffOffsetMonths).toBe('6');
    expect(result.rows[0]!.values.lockEndOffsetMonths).toBe('12');
  });

  it('handles BOM in first header', () => {
    const path = writeCsv('bom.csv', '\uFEFFaddress,amount\n0x01,100\n');

    const result = parseCsvFile(path);

    expect(result.headers[0]).toBe('address');
    expect(result.rows[0]!.values.address).toBe('0x01');
  });

  it('handles quoted fields with commas', () => {
    const path = writeCsv('quoted.csv', 'a,b\n"value,with,commas",simple\n');

    const result = parseCsvFile(path);

    expect(result.rows[0]!.values.a).toBe('value,with,commas');
    expect(result.rows[0]!.values.b).toBe('simple');
  });

  it('handles escaped quotes', () => {
    const path = writeCsv('escaped.csv', 'a,b\n"value""with""quotes",ok\n');

    const result = parseCsvFile(path);

    expect(result.rows[0]!.values.a).toBe('value"with"quotes');
  });

  it('handles CR-only line endings (old Mac style)', () => {
    const path = writeCsv('cr-only.csv', 'a,b\r0x01,100\r0x02,200\r');

    const result = parseCsvFile(path);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.values.a).toBe('0x01');
    expect(result.rows[1]!.values.a).toBe('0x02');
  });

  it('skips blank rows', () => {
    const path = writeCsv('blanks.csv', [
      'address,amount',
      '',
      '0x01,100',
      '',
      '0x02,200',
      '',
    ].join('\n'));

    const result = parseCsvFile(path);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.values.address).toBe('0x01');
    expect(result.rows[1]!.values.address).toBe('0x02');
  });

  it('rejects unmatched quote', () => {
    const path = writeCsv('unmatched.csv', 'a,b\n"unclosed,value\n');

    expect(() => parseCsvFile(path)).toThrow('unmatched quote');
  });

  it('rejects empty CSV', () => {
    const path = writeCsv('empty.csv', '');

    expect(() => parseCsvFile(path)).toThrow('CSV is empty');
  });

  it('extra columns are ignored', () => {
    const path = writeCsv('extra.csv', [
      'address,amount,cliffOffsetMonths,lockEndOffsetMonths,notes',
      '0x01,100,6,12,some note',
    ].join('\n'));

    const result = parseCsvFile(path);

    expect(result.headers).toContain('notes');
    expect(result.rows[0]!.values.notes).toBe('some note');
    expect(result.rows[0]!.values.address).toBe('0x01');
  });
});

describe('requireHeaders', () => {
  it('passes with all required headers', () => {
    expect(() => {
      requireHeaders(['address', 'amount'], ['address', 'amount']);
    }).not.toThrow();
  });

  it('fails on missing header', () => {
    expect(() => {
      requireHeaders(['address'], ['address', 'amount']);
    }).toThrow('amount');
  });
});
