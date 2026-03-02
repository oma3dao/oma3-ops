export interface ParsedCli {
  readonly options: Map<string, string | true>;
  readonly positionals: string[];
}

export function parseCliArgs(argv: string[]): ParsedCli {
  const options = new Map<string, string | true>();
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token) continue;

    if (token.startsWith('--')) {
      const key = token.slice(2);
      if (key.length === 0) {
        throw new Error('Invalid option --');
      }

      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        options.set(key, next);
        i += 1;
      } else {
        options.set(key, true);
      }
      continue;
    }

    positionals.push(token);
  }

  return { options, positionals };
}

export function getRequiredOption(options: Map<string, string | true>, key: string): string {
  const value = options.get(key);
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required option --${key}.`);
  }
  return value.trim();
}

export function getOptionalString(
  options: Map<string, string | true>,
  key: string,
): string | undefined {
  const value = options.get(key);
  if (value === undefined || value === true) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export function getBooleanFlag(options: Map<string, string | true>, key: string): boolean {
  const value = options.get(key);
  if (value === undefined) {
    return false;
  }
  if (value === true) {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  throw new Error(`Invalid boolean value for --${key}: '${value}'.`);
}

export function getPositiveIntOption(
  options: Map<string, string | true>,
  key: string,
  defaultValue: number,
): number {
  const raw = getOptionalString(options, key);
  if (raw === undefined) {
    return defaultValue;
  }
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Option --${key} must be a positive integer.`);
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Option --${key} must be a positive safe integer.`);
  }
  return value;
}

export function assertNoUnknownOptions(
  options: Map<string, string | true>,
  allowed: ReadonlySet<string>,
): void {
  const unknown: string[] = [];
  for (const key of options.keys()) {
    if (!allowed.has(key)) {
      unknown.push(key);
    }
  }
  if (unknown.length > 0) {
    throw new Error(`Unknown option(s): ${unknown.map((key) => `--${key}`).join(', ')}`);
  }
}
