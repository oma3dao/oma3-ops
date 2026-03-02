import { keccak256 } from 'ethers';
import { createHash } from 'node:crypto';

export function normalizeHexInput(input: string): string {
  const raw = input.trim();
  const withoutPrefix = raw.startsWith('0x') || raw.startsWith('0X') ? raw.slice(2) : raw;
  if (withoutPrefix.length === 0) {
    throw new Error('Hex input is empty.');
  }
  if (withoutPrefix.length % 2 !== 0) {
    throw new Error('Hex input must have even length (whole bytes).');
  }
  if (!/^[0-9a-fA-F]+$/.test(withoutPrefix)) {
    throw new Error('Hex input contains non-hex characters.');
  }
  return withoutPrefix.toLowerCase();
}

export function keccakHexBytes(input: string): string {
  const normalized = normalizeHexInput(input);
  return keccak256(`0x${normalized}`);
}

export function sha256Hex(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

export function batchFingerprint(calldataHashes: string[]): string {
  if (calldataHashes.length === 0) {
    throw new Error('Cannot compute batch fingerprint with zero transactions.');
  }

  const digests = calldataHashes.map((hash) => {
    const normalized = normalizeHexInput(hash);
    if (normalized.length !== 64) {
      throw new Error(`Per-transaction hash must be 32 bytes: '${hash}'.`);
    }
    return Buffer.from(normalized, 'hex');
  });

  const concatenated = Buffer.concat(digests);
  return keccak256(`0x${concatenated.toString('hex')}`);
}

export function shortFingerprint(fullFingerprint: string): string {
  const normalized = normalizeHexInput(fullFingerprint);
  return `0x${normalized.slice(0, 12)}`;
}

export function formatUtcSeconds(unixSeconds: number): string {
  const iso = new Date(unixSeconds * 1000).toISOString();
  return iso.endsWith('.000Z') ? iso.replace('.000Z', 'Z') : iso;
}
