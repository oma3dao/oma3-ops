const ISO_ZULU_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

export function parseAnchorDateUtc(input: string): Date {
  const value = input.trim();
  if (!ISO_ZULU_REGEX.test(value)) {
    throw new Error(
      'Invalid --anchor-date-utc. Expected ISO-8601 UTC with Z suffix, for example 2025-01-31T00:00:00Z.',
    );
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid --anchor-date-utc datetime '${input}'.`);
  }
  return parsed;
}

export function addUtcCalendarMonths(anchor: Date, months: number): Date {
  const startYear = anchor.getUTCFullYear();
  const startMonth = anchor.getUTCMonth();
  const startDay = anchor.getUTCDate();

  const absoluteMonth = startMonth + months;
  const targetYear = startYear + Math.floor(absoluteMonth / 12);
  const targetMonth = ((absoluteMonth % 12) + 12) % 12;

  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(startDay, daysInTargetMonth);

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      targetDay,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
}

export function unixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

export function formatAnchorUtc(date: Date): string {
  const iso = date.toISOString();
  return iso.endsWith('.000Z') ? iso.replace('.000Z', 'Z') : iso;
}
