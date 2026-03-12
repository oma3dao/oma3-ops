import { describe, it, expect } from 'vitest';

/**
 * Tests for lock-verify-json utility logic.
 *
 * The withVerifiedPrefix function is internal to lock-verify-json.ts.
 * We replicate the logic here to verify its behavior since it's not exported.
 */

function withVerifiedPrefix(source: string): string {
  return source.startsWith('verified:') ? source : `verified:${source}`;
}

describe('withVerifiedPrefix', () => {
  it('adds verified: prefix to plain source', () => {
    expect(withVerifiedPrefix('addLocks:abc123')).toBe('verified:addLocks:abc123');
  });

  it('does not double-prefix already verified source', () => {
    expect(withVerifiedPrefix('verified:addLocks:abc123')).toBe('verified:addLocks:abc123');
  });

  it('handles empty string', () => {
    expect(withVerifiedPrefix('')).toBe('verified:');
  });

  it('handles updateLocks source tag', () => {
    expect(withVerifiedPrefix('updateLocks:def456')).toBe('verified:updateLocks:def456');
  });

  it('preserves already-verified updateLocks source', () => {
    expect(withVerifiedPrefix('verified:updateLocks:def456')).toBe('verified:updateLocks:def456');
  });

  it('handles source with multiple colons', () => {
    expect(withVerifiedPrefix('addLocks:abc:extra')).toBe('verified:addLocks:abc:extra');
  });

  it('handles verified: as the entire string', () => {
    expect(withVerifiedPrefix('verified:')).toBe('verified:');
  });
});
