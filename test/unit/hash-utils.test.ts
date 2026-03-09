import { describe, it, expect } from 'vitest';
import {
  normalizeHexInput,
  keccakHexBytes,
  batchFingerprint,
  shortFingerprint,
} from '../../src/hash-utils.js';

describe('normalizeHexInput', () => {
  it('strips 0x prefix', () => {
    expect(normalizeHexInput('0xabcdef')).toBe('abcdef');
  });

  it('strips 0X prefix', () => {
    expect(normalizeHexInput('0Xabcdef')).toBe('abcdef');
  });

  it('no prefix passthrough', () => {
    expect(normalizeHexInput('abcdef')).toBe('abcdef');
  });

  it('lowercases', () => {
    expect(normalizeHexInput('0xABCDEF')).toBe('abcdef');
  });

  it('rejects empty (0x only)', () => {
    expect(() => normalizeHexInput('0x')).toThrow();
  });

  it('rejects odd length', () => {
    expect(() => normalizeHexInput('0xabc')).toThrow();
  });

  it('rejects non-hex chars', () => {
    expect(() => normalizeHexInput('0xgggg')).toThrow();
  });
});

describe('keccakHexBytes', () => {
  it('spec vector 1: 0x1234', () => {
    expect(keccakHexBytes('0x1234')).toBe(
      '0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432',
    );
  });

  it('spec vector 2: 0xabcdef', () => {
    expect(keccakHexBytes('0xabcdef')).toBe(
      '0x800d501693feda2226878e1ec7869eef8919dbc5bd10c2bcd031b94d73492860',
    );
  });

  it('spec vector 3: 0x6a627842', () => {
    expect(keccakHexBytes('0x6a627842')).toBe(
      '0x654347b7dc147d586800b07bed0ef8d31b06de26b3210a3e014f9445ad4bf8da',
    );
  });

  it('output is lowercase with 0x prefix', () => {
    const result = keccakHexBytes('0x1234');
    expect(result).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe('batchFingerprint', () => {
  it('single tx: keccak256 of that 32-byte digest', () => {
    const hash = keccakHexBytes('0x1234');
    const result = batchFingerprint([hash]);
    expect(result).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('two txs: keccak256 of concatenated digests', () => {
    const hash1 = keccakHexBytes('0x1234');
    const hash2 = keccakHexBytes('0xabcdef');
    const result = batchFingerprint([hash1, hash2]);
    expect(result).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('order matters', () => {
    const hashA = keccakHexBytes('0x1234');
    const hashB = keccakHexBytes('0xabcdef');
    const resultAB = batchFingerprint([hashA, hashB]);
    const resultBA = batchFingerprint([hashB, hashA]);
    expect(resultAB).not.toBe(resultBA);
  });

  it('rejects empty array', () => {
    expect(() => batchFingerprint([])).toThrow();
  });

  it('rejects non-32-byte hash', () => {
    expect(() => batchFingerprint(['0xabcd'])).toThrow();
  });
});

describe('shortFingerprint', () => {
  it('extracts first 12 hex chars', () => {
    const full = '0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432';
    expect(shortFingerprint(full)).toBe('0x56570de287d7');
  });
});
