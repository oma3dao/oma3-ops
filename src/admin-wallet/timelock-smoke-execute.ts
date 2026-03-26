#!/usr/bin/env node
/**
 * Timelock Smoke Execute (Phase A Step 10 in deploy README)
 *
 * Executes the zero-value self-call proposal created by timelock-smoke-test.
 * Run this after the timelock delay has elapsed (24h testnet / 5 days mainnet).
 *
 * Usage:
 *   npm run admin:timelock-smoke-execute -- \
 *     --network omachainTestnet \
 *     --timelock 0x... \
 *     --operation-id 0x... \
 *     --salt 0x...
 *
 * The secret key is prompted interactively (never stored on disk).
 */

import { ethers } from 'ethers';
import { createThirdwebClient, defineChain, prepareTransaction, Engine } from 'thirdweb';
import { parseCliArgs, getRequiredOption, getBooleanFlag, assertNoUnknownOptions } from '../cli-utils.js';
import { getAdminWalletConfig } from './config.js';
import { promptSecretKey } from './prompt-secret.js';
import { TIMELOCK_ABI } from './timelock-abi.js';

const ALLOWED_OPTIONS = new Set(['network', 'timelock', 'operation-id', 'salt', 'help']);

function printUsage(): void {
  console.log(`
Usage: timelock-smoke-execute --network <omachainTestnet|omachainMainnet> --timelock <address> --operation-id <bytes32> --salt <bytes32>

Options:
  --network        Target network (required)
  --timelock       TimelockController contract address (required)
  --operation-id   Operation ID from timelock-smoke-test output (required)
  --salt           Salt from timelock-smoke-test output (required)
  --help           Show this help
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
  const timelockAddress = getRequiredOption(options, 'timelock');
  const operationId = getRequiredOption(options, 'operation-id');
  const salt = getRequiredOption(options, 'salt');
  const walletConfig = getAdminWalletConfig(network);

  console.log(`\n=== Timelock Smoke Execute ===`);
  console.log(`Network:      ${walletConfig.name}`);
  console.log(`Timelock:     ${timelockAddress}`);
  console.log(`Operation ID: ${operationId}`);
  console.log();

  const provider = new ethers.JsonRpcProvider(walletConfig.rpc);
  const timelock = new ethers.Contract(timelockAddress, TIMELOCK_ABI, provider);
  const call = (name: string, ...args: unknown[]) => timelock.getFunction(name)(...args);

  // Check operation status
  const [isOperation, isPending, isReady, isDone] = await Promise.all([
    call('isOperation', operationId),
    call('isOperationPending', operationId),
    call('isOperationReady', operationId),
    call('isOperationDone', operationId),
  ]);

  console.log(`Status: operation=${isOperation}, pending=${isPending}, ready=${isReady}, done=${isDone}`);

  if (isDone) {
    console.log('\n✅ Operation already executed. Nothing to do.');
    return;
  }

  if (!isOperation) {
    console.error('\n❌ Operation ID not found on the timelock. Check the ID and timelock address.');
    process.exit(1);
  }

  if (!isReady) {
    const minDelay = await call('getMinDelay');
    console.error(`\n❌ Operation is not ready yet. The ${Number(minDelay) / 3600}h delay has not elapsed.`);
    console.error('Wait for the delay to pass, then try again.');
    process.exit(1);
  }

  // Execute
  console.log('\nExecuting proposal via admin server wallet...');

  const secretKey = await promptSecretKey();
  const client = createThirdwebClient({ secretKey });
  const chain = defineChain({ id: walletConfig.chainId, rpc: walletConfig.rpc });
  const serverWallet = Engine.serverWallet({
    client,
    address: walletConfig.address,
    executionOptions: { type: 'EOA', from: walletConfig.address },
  });

  const predecessor = ethers.ZeroHash;
  const timelockIface = new ethers.Interface(TIMELOCK_ABI);
  const executeData = timelockIface.encodeFunctionData('execute', [
    timelockAddress, // target: self (same as what was scheduled)
    0,               // value: 0
    '0x',            // data: empty
    predecessor,
    salt,
  ]);

  const tx = prepareTransaction({
    chain,
    client,
    to: timelockAddress as `0x${string}`,
    value: 0n,
    data: executeData as `0x${string}`,
  });

  const { transactionId } = await serverWallet.enqueueTransaction({ transaction: tx });
  console.log(`Enqueued: ${transactionId}`);

  const { transactionHash } = await Engine.waitForTransactionHash({
    client,
    transactionId,
    timeoutInSeconds: 120,
  });
  console.log(`Confirmed: ${transactionHash}`);

  // Verify
  const doneNow = await call('isOperationDone', operationId);
  if (doneNow) {
    console.log('\n=== SMOKE EXECUTE PASSED ===');
    console.log('Full timelock round-trip verified: schedule → wait → execute.');
    console.log('The admin server wallet can propose and execute through the timelock.');
  } else {
    console.error('\n❌ Operation executed but isOperationDone returned false. Investigate.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\nFATAL:', error instanceof Error ? error.message : error);
  process.exit(1);
});
