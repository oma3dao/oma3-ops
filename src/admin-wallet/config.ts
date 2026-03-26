/**
 * Admin wallet configuration
 *
 * Wallet addresses and contract addresses are public and safe to commit.
 * Secret keys are NEVER stored on disk — they are prompted interactively
 * or passed via environment variable for CI (not recommended for production).
 */

export interface AdminWalletConfig {
  /** Human-readable label */
  readonly name: string;
  /** Thirdweb server wallet address */
  readonly address: string;
  /** Chain ID */
  readonly chainId: number;
  /** RPC endpoint */
  readonly rpc: string;
  /** TimelockController address (undefined if not yet deployed) */
  readonly timelock?: string;
  /** Contract addresses for this network */
  readonly contracts: {
    readonly registry?: string;
    readonly metadata?: string;
    readonly resolver?: string;
  };
}

export const ADMIN_WALLETS: Record<string, AdminWalletConfig> = {
  'omachainTestnet': {
    name: 'Admin Wallet (OMAchain Testnet)',
    address: '0x8e6aB187BD083b54156c6cF3a54351Eec4742319',
    chainId: 66238,
    rpc: 'https://rpc.testnet.chain.oma3.org/',
    timelock: '0x8A4434930ef47bCaDE48e45a9979540FA839D18E',
    contracts: {
      registry: '0xB752303DECf6b2c5B12818e50Dd8A20EBe0F5F97',
      metadata: '0x9a530e23370C7d820FbaB2E0a884c58be5E4e919',
      resolver: '0xDc120C00E62822329A4d8C7808f5a43C9CbfC1f8',
    },
  },
  'omachainMainnet': {
    name: 'Admin Wallet (OMAchain Mainnet)',
    address: '0xb7Fed03367a3c37a6e04E5f9AEF753916A538cdc',
    chainId: 6623,
    rpc: 'https://rpc.chain.oma3.org/',
    // timelock: not yet deployed
    contracts: {
      // Not yet deployed
    },
  },
};

export function getAdminWalletConfig(network: string): AdminWalletConfig {
  const config = ADMIN_WALLETS[network];
  if (!config) {
    const available = Object.keys(ADMIN_WALLETS).join(', ');
    throw new Error(`Unknown network '${network}'. Available: ${available}`);
  }
  if (config.address.startsWith('<')) {
    throw new Error(`Admin wallet address not configured for '${network}'. Update admin-wallet/config.ts.`);
  }
  return config;
}

export function requireTimelock(config: AdminWalletConfig): string {
  if (!config.timelock) {
    throw new Error(`TimelockController not configured for '${config.name}'. Update admin-wallet/config.ts.`);
  }
  return config.timelock;
}

export function requireContract(config: AdminWalletConfig, name: keyof AdminWalletConfig['contracts']): string {
  const address = config.contracts[name];
  if (!address) {
    throw new Error(`Contract '${name}' not configured for '${config.name}'. Update admin-wallet/config.ts.`);
  }
  return address;
}
