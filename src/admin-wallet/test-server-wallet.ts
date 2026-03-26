#!/usr/bin/env node
/**
 * Admin Server Wallet Smoke Test
 *
 * Verifies that the admin Thirdweb server wallet credentials work by:
 * 1. Authenticating with the secret key
 * 2. Confirming the wallet address matches config
 * 3. Checking the wallet's native token balance
 * 4. Sending a 0-value self-transfer to prove signing works
 *
 * Usage:
 *   npx tsx src/admin-wallet/test-server-wallet.ts --network omachainTestnet
 *   npx tsx src/admin-wallet/test-server-wallet.ts --network omachainTestnet --dry-run
 *
 * The secret key is prompted interactively (never stored on disk).
 */

import { createThirdwebClient, defineChain, prepareTransaction, Engine } from 'thirdweb';
import { eth_getBalance, getRpcClient } from 'thirdweb/rpc';
import { formatEther } from 'ethers';
import { parseCliArgs, getRequiredOption, getBooleanFlag, assertNoUnknownOptions } from '../cli-utils.js';
import { getAdminWalletConfig } from './config.js';
import { promptSecretKey } from './prompt-secret.js';

const ALLOWED_OPTIONS = new Set(['network', 'dry-run', 'help']);

function printUsage(): void {
  console.log(`
Usage: test-server-wallet --network <omachainTestnet|omachainMainnet> [--dry-run]

Options:
  --network    Target network (required)
  --dry-run    Only check balance, skip the test transaction
  --help       Show this help
`);
}

async function main(): Promise<void> {
  const { options } = parseCliArgs(process.argv.slice(2));

  if (getBooleanFlag(options, 'help')) {
    printUsage();
    return;
  }

  assertNoUnknownOptions(options, ALLOWED_OPTIONS);

  const network = getRequiredOption(options, 'network');
  const dryRun = getBooleanFlag(options, 'dry-run');
  const config = getAdminWalletConfig(network);

  console.log(`\n=== Admin Server Wallet Test ===`);
  console.log(`Network:  ${config.name}`);
  console.log(`Chain ID: ${config.chainId}`);
  console.log(`Wallet:   ${config.address}`);
  console.log(`RPC:      ${config.rpc}`);
  if (dryRun) console.log(`Mode:     DRY RUN (balance check only)`);
  console.log();

  // 1. Prompt for secret key
  const secretKey = await promptSecretKey();

  // 2. Initialize Thirdweb client and server wallet
  const client = createThirdwebClient({ secretKey });
  const chain = defineChain({ id: config.chainId, rpc: config.rpc });
  const serverWallet = Engine.serverWallet({
    client,
    address: config.address,
    executionOptions: { type: 'EOA', from: config.address },
  });

  // 3. Check balance
  console.log('Checking wallet balance...');
  const rpcRequest = getRpcClient({ client, chain });
  const balanceWei = await eth_getBalance(rpcRequest, { address: config.address as `0x${string}` });
  const balanceFormatted = formatEther(balanceWei);
  console.log(`Balance:  ${balanceFormatted} OMA`);

  if (balanceWei === 0n) {
    console.warn('\nWARNING: Wallet has zero balance. Fund it before running real transactions.');
  }

  if (dryRun) {
    console.log('\nDry run complete. Wallet is reachable and balance was checked.');
    return;
  }

  // 4. Send a 0-value self-transfer to prove signing works
  console.log('\nSending 0-value self-transfer to verify signing...');

  const tx = prepareTransaction({
    chain,
    client,
    to: config.address as `0x${string}`,
    value: 0n,
  });

  const { transactionId } = await serverWallet.enqueueTransaction({ transaction: tx });
  console.log(`Enqueued: ${transactionId}`);

  const { transactionHash } = await Engine.waitForTransactionHash({
    client,
    transactionId,
    timeoutInSeconds: 60,
  });
  console.log(`Confirmed: ${transactionHash}`);

  console.log('\n=== SUCCESS ===');
  console.log('Server wallet can authenticate and sign transactions.');
}

main().catch((error) => {
  console.error('\nFATAL:', error instanceof Error ? error.message : error);
  process.exit(1);
});
