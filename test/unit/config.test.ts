import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getNetworkConfig, getRpcUrl, type NetworkName } from '../../src/config.js';

const ENV_KEYS = [
  'OMA3_OPS_RPC_URL_SEPOLIA',
  'OMA3_OPS_RPC_URL_MAINNET',
  'OMA3_OPS_RPC_URL',
];

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value !== undefined) {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
});

describe('getNetworkConfig', () => {
  it('returns sepolia config', () => {
    const config = getNetworkConfig('sepolia');
    expect(config.name).toBe('sepolia');
    expect(config.chainId).toBe(11_155_111n);
    expect(config.omaToken).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(config.omaLock).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('returns mainnet config', () => {
    const config = getNetworkConfig('mainnet');
    expect(config.name).toBe('mainnet');
    expect(config.chainId).toBe(1n);
    expect(config.omaToken).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(config.omaLock).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('throws for unsupported network', () => {
    expect(() => getNetworkConfig('polygon')).toThrow(
      "Unsupported network 'polygon'. Use one of: sepolia, mainnet.",
    );
  });

  it('throws for empty string', () => {
    expect(() => getNetworkConfig('')).toThrow(/Unsupported network/);
  });
});

describe('getRpcUrl', () => {
  it('returns explicit URL when provided', () => {
    const url = getRpcUrl('sepolia', 'https://custom-rpc.example.com');
    expect(url).toBe('https://custom-rpc.example.com');
  });

  it('trims explicit URL', () => {
    const url = getRpcUrl('sepolia', '  https://rpc.example.com  ');
    expect(url).toBe('https://rpc.example.com');
  });

  it('throws when explicit is empty string', () => {
    expect(() => getRpcUrl('sepolia', '')).toThrow(/Missing RPC URL/);
  });

  it('throws when explicit is whitespace only', () => {
    expect(() => getRpcUrl('sepolia', '   ')).toThrow(/Missing RPC URL/);
  });

  it('uses OMA3_OPS_RPC_URL_SEPOLIA when no explicit URL', () => {
    process.env.OMA3_OPS_RPC_URL_SEPOLIA = 'https://sepolia.env.example.com';
    const url = getRpcUrl('sepolia');
    expect(url).toBe('https://sepolia.env.example.com');
  });

  it('uses OMA3_OPS_RPC_URL_MAINNET for mainnet', () => {
    process.env.OMA3_OPS_RPC_URL_MAINNET = 'https://mainnet.env.example.com';
    const url = getRpcUrl('mainnet');
    expect(url).toBe('https://mainnet.env.example.com');
  });

  it('falls back to OMA3_OPS_RPC_URL when network-specific not set', () => {
    process.env.OMA3_OPS_RPC_URL = 'https://fallback.example.com';
    const url = getRpcUrl('sepolia');
    expect(url).toBe('https://fallback.example.com');
  });

  it('trims env URL', () => {
    process.env.OMA3_OPS_RPC_URL_SEPOLIA = '  https://trimmed.example.com  ';
    const url = getRpcUrl('sepolia');
    expect(url).toBe('https://trimmed.example.com');
  });

  it('throws when no RPC URL available', () => {
    expect(() => getRpcUrl('sepolia')).toThrow(
      /Missing RPC URL.*OMA3_OPS_RPC_URL_SEPOLIA/,
    );
  });

  it('throws when env value is empty string', () => {
    process.env.OMA3_OPS_RPC_URL_SEPOLIA = '';
    expect(() => getRpcUrl('sepolia')).toThrow(/Missing RPC URL/);
  });

  it('throws when env value is whitespace only', () => {
    process.env.OMA3_OPS_RPC_URL_SEPOLIA = '   ';
    expect(() => getRpcUrl('sepolia')).toThrow(/Missing RPC URL/);
  });
});
