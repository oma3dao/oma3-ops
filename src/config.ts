import { getAddress, parseUnits } from 'ethers';

export type NetworkName = 'sepolia' | 'mainnet';

/** Total OMA supply: 333,333,333 OMA. Used for threshold calculations. */
export const OMA_TOTAL_SUPPLY_WEI = parseUnits('333333333', 18);

export interface NetworkConfig {
  readonly name: NetworkName;
  readonly chainId: bigint;
  readonly omaToken: string;
  readonly omaLock: string;
}

const NETWORKS: Record<NetworkName, NetworkConfig> = {
  sepolia: {
    name: 'sepolia',
    chainId: 11_155_111n,
    omaToken: getAddress('0xd7ee0eADb283eFB6d6e628De5E31A284183f4EDf'),
    omaLock: getAddress('0xfD1410e3A80A0f311804a09C656d98a82B7c5d9f'),
  },
  mainnet: {
    name: 'mainnet',
    chainId: 1n,
    omaToken: getAddress('0x36a72D42468eAffd5990Ddbd5056A0eC615B0bd4'),
    omaLock: getAddress('0x249d2cc7B23546c3dE8655c03263466B77344ee7'),
  },
};

export function getNetworkConfig(name: string): NetworkConfig {
  if (name === 'sepolia' || name === 'mainnet') {
    return NETWORKS[name];
  }
  throw new Error(`Unsupported network '${name}'. Use one of: sepolia, mainnet.`);
}

export function getRpcUrl(network: NetworkName, explicit?: string): string {
  if (explicit && explicit.trim() !== '') {
    return explicit.trim();
  }

  const envKey = `OMA3_OPS_RPC_URL_${network.toUpperCase()}`;
  const envValue = process.env[envKey] ?? process.env.OMA3_OPS_RPC_URL;
  if (!envValue || envValue.trim() === '') {
    throw new Error(
      `Missing RPC URL. Provide --rpc-url or set ${envKey} (or OMA3_OPS_RPC_URL).`,
    );
  }
  return envValue.trim();
}
