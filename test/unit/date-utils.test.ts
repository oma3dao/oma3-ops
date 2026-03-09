import { describe, it, expect } from 'vitest';
import {
  parseAnchorDateUtc,
  addUtcCalendarMonths,
  unixSeconds,
  formatAnchorUtc,
} from '../../src/date-utils.js';

describe('parseAnchorDateUtc', () => {
  it('parses valid Z-suffix datetime', () => {
    const result = parseAnchorDateUtc('2025-01-31T00:00:00Z');
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe('2025-01-31T00:00:00.000Z');
  });

  it('rejects +00:00 offset', () => {
    expect(() => parseAnchorDateUtc('2025-01-31T00:00:00+00:00')).toThrow();
  });

  it('rejects +05:30 offset', () => {
    expect(() => parseAnchorDateUtc('2025-01-31T00:00:00+05:30')).toThrow();
  });

  it('rejects no timezone', () => {
    expect(() => parseAnchorDateUtc('2025-01-31T00:00:00')).toThrow();
  });

  it('rejects invalid date', () => {
    expect(() => parseAnchorDateUtc('not-a-date')).toThrow();
  });
});

describe('addUtcCalendarMonths', () => {
  it('normal case: +1 month', () => {
    const anchor = new Date('2025-01-15T00:00:00Z');
    const result = addUtcCalendarMonths(anchor, 1);
    expect(result.toISOString()).toBe('2025-02-15T00:00:00.000Z');
  });

  it('clamp to month end (spec vector): Jan 31 + 1 month', () => {
    const anchor = new Date('2025-01-31T00:00:00Z');
    const result = addUtcCalendarMonths(anchor, 1);
    expect(result.toISOString()).toBe('2025-02-28T00:00:00.000Z');
  });

  it('leap year: Jan 31 + 1 month in 2024', () => {
    const anchor = new Date('2024-01-31T00:00:00Z');
    const result = addUtcCalendarMonths(anchor, 1);
    expect(result.toISOString()).toBe('2024-02-29T00:00:00.000Z');
  });

  it('preserves time-of-day', () => {
    const anchor = new Date('2025-01-15T14:30:00Z');
    const result = addUtcCalendarMonths(anchor, 1);
    expect(result.toISOString()).toBe('2025-02-15T14:30:00.000Z');
  });

  it('zero months', () => {
    const anchor = new Date('2025-06-15T00:00:00Z');
    const result = addUtcCalendarMonths(anchor, 0);
    expect(result.toISOString()).toBe('2025-06-15T00:00:00.000Z');
  });

  it('cross year boundary: Nov 30 + 3 months', () => {
    const anchor = new Date('2025-11-30T00:00:00Z');
    const result = addUtcCalendarMonths(anchor, 3);
    expect(result.toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });

  it('12 months: Mar 31 + 12', () => {
    const anchor = new Date('2025-03-31T00:00:00Z');
    const result = addUtcCalendarMonths(anchor, 12);
    expect(result.toISOString()).toBe('2026-03-31T00:00:00.000Z');
  });

  it('large offset: 48 months', () => {
    const anchor = new Date('2025-01-31T00:00:00Z');
    const result = addUtcCalendarMonths(anchor, 48);
    expect(result.toISOString()).toBe('2029-01-31T00:00:00.000Z');
  });
});

describe('unixSeconds', () => {
  it('returns integer seconds', () => {
    const date = new Date('2025-01-15T00:00:00Z');
    const result = unixSeconds(date);
    expect(result).toBe(Math.floor(date.getTime() / 1000));
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe('formatAnchorUtc', () => {
  it('strips .000Z', () => {
    const date = new Date('2025-01-15T00:00:00.000Z');
    const result = formatAnchorUtc(date);
    expect(result).toBe('2025-01-15T00:00:00Z');
    expect(result).not.toContain('.000Z');
  });
});
