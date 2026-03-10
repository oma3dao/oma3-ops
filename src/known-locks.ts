import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface KnownLockEntry {
  address: string;
  amount: string;
  cliffDate: number;
  lockEndDate: number;
  source: string;
}

export function getFixturePath(networkName: string): string {
  const projectRoot = resolve(__dirname, '..');
  return resolve(projectRoot, 'data', `${networkName}-known-locks.json`);
}

export function loadFixtures(path: string): KnownLockEntry[] {
  if (!existsSync(path)) {
    return [];
  }
  const raw = readFileSync(path, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Fixture file is not a JSON array: ${path}`);
  }
  return parsed as KnownLockEntry[];
}

export function saveFixtures(path: string, entries: KnownLockEntry[]): void {
  writeFileSync(path, JSON.stringify(entries, null, 2) + '\n', 'utf8');
}
