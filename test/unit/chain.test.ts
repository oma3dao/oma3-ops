import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AbiCoder } from 'ethers';
import { loadChainContext } from '../../src/chain.js';

const { mockGetNetwork, mockCall } = vi.hoisted(() => ({
  mockGetNetwork: vi.fn(),
  mockCall: vi.fn(),
}));

const SEPOLIA_LOCK = '0xfD1410e3A80A0f311804a09C656d98a82B7c5d9f';
const SEPOLIA_OMA = '0xd7ee0eADb283eFB6d6e628De5E31A284183f4EDf';
const coder = AbiCoder.defaultAbiCoder();

const encodedOmaToken = coder.encode(['address'], [SEPOLIA_OMA]);
const encodedDecimals = coder.encode(['uint8'], [18]);

vi.mock('ethers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ethers')>();
  class MockJsonRpcProvider {
    getNetwork = mockGetNetwork;
    call = mockCall;
  }
  return {
    ...actual,
    JsonRpcProvider: MockJsonRpcProvider,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetNetwork.mockResolvedValue({ chainId: 11_155_111n });
  mockCall
    .mockResolvedValueOnce(encodedOmaToken)
    .mockResolvedValueOnce(encodedDecimals);
});

describe('loadChainContext', () => {
  it('returns chain context for sepolia with explicit RPC', async () => {
    const result = await loadChainContext({
      networkName: 'sepolia',
      rpcUrl: 'https://sepolia.example.com',
      allowAddressOverride: false,
    });

    expect(result.network.chainId).toBe(11_155_111n);
    expect(result.rpcUrl).toBe('https://sepolia.example.com');
    expect(result.lockContract.toLowerCase()).toBe(SEPOLIA_LOCK.toLowerCase());
    expect(result.omaToken.toLowerCase()).toBe(SEPOLIA_OMA.toLowerCase());
    expect(result.decimals).toBe(18);
    expect(mockCall).toHaveBeenCalledTimes(2);
  });

  it('throws on chain ID mismatch', async () => {
    mockGetNetwork.mockResolvedValue({ chainId: 1n });

    await expect(
      loadChainContext({
        networkName: 'sepolia',
        rpcUrl: 'https://rpc.example.com',
        allowAddressOverride: false,
      }),
    ).rejects.toThrow(/RPC chain ID mismatch.*Expected 11155111.*got 1/);
  });

  it('throws when address override requested without allowAddressOverride', async () => {
    await expect(
      loadChainContext({
        networkName: 'sepolia',
        rpcUrl: 'https://rpc.example.com',
        lockContractOverride: '0x0000000000000000000000000000000000000001',
        allowAddressOverride: false,
      }),
    ).rejects.toThrow(/Address override requested but --allow-address-override was not provided/);
  });

  it('throws when omaToken override requested without allowAddressOverride', async () => {
    await expect(
      loadChainContext({
        networkName: 'sepolia',
        rpcUrl: 'https://rpc.example.com',
        omaTokenOverride: '0x0000000000000000000000000000000000000001',
        allowAddressOverride: false,
      }),
    ).rejects.toThrow(/Address override requested but --allow-address-override was not provided/);
  });

  it('uses lock contract override when allowAddressOverride', async () => {
    const customLock = '0x0000000000000000000000000000000000000001';
    mockCall
      .mockReset()
      .mockResolvedValueOnce(coder.encode(['address'], [SEPOLIA_OMA]))
      .mockResolvedValueOnce(encodedDecimals);

    const result = await loadChainContext({
      networkName: 'sepolia',
      rpcUrl: 'https://rpc.example.com',
      lockContractOverride: customLock,
      allowAddressOverride: true,
    });

    expect(result.lockContract.toLowerCase()).toBe(customLock.toLowerCase());
  });

  it('throws on omaToken mismatch', async () => {
    const otherToken = '0x0000000000000000000000000000000000000002';
    mockCall
      .mockReset()
      .mockResolvedValueOnce(coder.encode(['address'], [otherToken]))
      .mockResolvedValueOnce(encodedDecimals);

    await expect(
      loadChainContext({
        networkName: 'sepolia',
        rpcUrl: 'https://rpc.example.com',
        allowAddressOverride: false,
      }),
    ).rejects.toThrow(/OMALock->omaToken mismatch/);
  });
});
