/**
 * Admin wallet configuration
 *
 * Wallet addresses are public and safe to commit.
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
}

export const ADMIN_WALLETS: Record<string, AdminWalletConfig> = {
  'testnet': {
    name: 'Admin Wallet (OMAchain Testnet)',
    address: '0x8e6aB187BD083b54156c6cF3a54351Eec4742319',
    chainId: 66238,
    rpc: 'https://rpc.testnet.chain.oma3.org/',
  },
  // 'mainnet': {
  //   name: 'Admin Wallet (OMAchain Mainnet)',
  //   address: '<ADMIN_WALLET_ADDRESS>',
  //   chainId: 6623,
  //   rpc: 'https://rpc.chain.oma3.org/',
  // },
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
