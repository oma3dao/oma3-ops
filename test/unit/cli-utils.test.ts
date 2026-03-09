import { describe, it, expect } from 'vitest';
import {
  parseCliArgs,
  getRequiredOption,
  getPositiveIntOption,
  getBooleanFlag,
  assertNoUnknownOptions,
} from '../../src/cli-utils.js';

describe('parseCliArgs', () => {
  it('parses --key value pair', () => {
    const result = parseCliArgs(['--network', 'sepolia']);
    expect(result.options.get('network')).toBe('sepolia');
  });

  it('parses boolean flag', () => {
    const result = parseCliArgs(['--help']);
    expect(result.options.get('help')).toBe(true);
  });

  it('collects positional args', () => {
    const result = parseCliArgs(['0xabc', '0xdef']);
    expect(result.positionals).toEqual(['0xabc', '0xdef']);
  });

  it('mixed flags and positionals', () => {
    const result = parseCliArgs(['--network', 'sepolia', '0xabc']);
    expect(result.options.get('network')).toBe('sepolia');
    expect(result.positionals).toEqual(['0xabc']);
  });

  it('rejects bare --', () => {
    expect(() => parseCliArgs(['--'])).toThrow('Invalid option --');
  });
});

describe('getRequiredOption', () => {
  it('returns value', () => {
    const options = new Map<string, string | true>([['csv', 'file.csv']]);
    expect(getRequiredOption(options, 'csv')).toBe('file.csv');
  });

  it('throws on missing', () => {
    const options = new Map<string, string | true>();
    expect(() => getRequiredOption(options, 'csv')).toThrow('Missing required option');
  });

  it('throws on boolean flag', () => {
    const options = new Map<string, string | true>([['csv', true]]);
    expect(() => getRequiredOption(options, 'csv')).toThrow('Missing required option');
  });
});

describe('getPositiveIntOption', () => {
  it('returns default when absent', () => {
    const options = new Map<string, string | true>();
    expect(getPositiveIntOption(options, 'max', 200)).toBe(200);
  });

  it('parses valid int', () => {
    const options = new Map<string, string | true>([['max', '50']]);
    expect(getPositiveIntOption(options, 'max', 200)).toBe(50);
  });

  it('rejects zero', () => {
    const options = new Map<string, string | true>([['max', '0']]);
    expect(() => getPositiveIntOption(options, 'max', 200)).toThrow();
  });

  it('rejects negative', () => {
    const options = new Map<string, string | true>([['max', '-1']]);
    expect(() => getPositiveIntOption(options, 'max', 200)).toThrow();
  });

  it('rejects float', () => {
    const options = new Map<string, string | true>([['max', '1.5']]);
    expect(() => getPositiveIntOption(options, 'max', 200)).toThrow();
  });
});

describe('getBooleanFlag', () => {
  it('returns false when absent', () => {
    const options = new Map<string, string | true>();
    expect(getBooleanFlag(options, 'verbose')).toBe(false);
  });

  it('returns true for bare flag', () => {
    const options = new Map<string, string | true>([['verbose', true]]);
    expect(getBooleanFlag(options, 'verbose')).toBe(true);
  });

  it('parses "true"', () => {
    const options = new Map<string, string | true>([['verbose', 'true']]);
    expect(getBooleanFlag(options, 'verbose')).toBe(true);
  });

  it('parses "false"', () => {
    const options = new Map<string, string | true>([['verbose', 'false']]);
    expect(getBooleanFlag(options, 'verbose')).toBe(false);
  });

  it('rejects invalid value', () => {
    const options = new Map<string, string | true>([['verbose', 'maybe']]);
    expect(() => getBooleanFlag(options, 'verbose')).toThrow();
  });
});

describe('assertNoUnknownOptions', () => {
  it('passes with known options', () => {
    const options = new Map<string, string | true>([['network', 'sepolia']]);
    expect(() => assertNoUnknownOptions(options, new Set(['network']))).not.toThrow();
  });

  it('fails with unknown option', () => {
    const options = new Map<string, string | true>([
      ['network', 'sepolia'],
      ['foo', 'bar'],
    ]);
    expect(() => assertNoUnknownOptions(options, new Set(['network']))).toThrow(
      'Unknown option(s): --foo',
    );
  });
});
