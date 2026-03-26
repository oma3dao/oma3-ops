#!/usr/bin/env node
/**
 * Execute a pending timelock proposal after the delay has elapsed.
 *
 * This is the generic execute script — it works for any proposal submitted
 * by the propose-* scripts or timelock-smoke-test.
 *
 * Usage:
 *   npm run admin:execute-proposal -- \
 *     --network omachainTestnet \
 *     --target 0x... \
 *     --calldata 0x... \
 *     --salt 0x...
 */

import { ethers } from 'ethers';
import { createThirdwebClient, defineChain, prepareTransaction, Engine } from 'thirdweb';
import { parseCliArgs, getRequiredOption, getBooleanFlag, assertNoUnknownOptions } from '../cli-utils.js';
import { getAdminWalletConfig, requireTimelock } from './config.js';
import { promptSecretKey } from './prompt-secret.js';
import { TIMELOCK_ABI } from './timelock-abi.js';

const ALLOWED_OPTIONS = new Set(['network', 'target', 'calldata', 'salt', 'help']);

function printUsage(): void {
  console.log(`
Usage: execute-proposal --network <network> --target <address> --calldata <hex> --salt <bytes32>

Executes a pending timelock proposal after the delay has elapsed.

Options:
  --network       Target network (required)
  --target        Target contract address from the proposal (required)
  --calldata      Encoded function call from the proposal (required)
  --salt          Salt from the proposal output (required)
  --help          Show this help
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
  const target = getRequiredOption(options, 'target');
  const calldata = getRequiredOption(options, 'calldata');
  const salt = getRequiredOption(options, 'salt');
  const config = getAdminWalletConfig(network);
  const timelockAddress = requireTimelock(config);

  const predecessor = ethers.ZeroHash;

  console.log(`\n=== Execute Timelock Proposal ===`);
  console.log(`Network:  ${config.name}`);
  console.log(`Timelock: ${timelockAddress}`);
  console.log(`Target:   ${target}`);
  console.log();

  const provider = new ethers.JsonRpcProvider(config.rpc);
  const timelock = new ethers.Contract(timelockAddress, TIMELOCK_ABI, provider);
  const call = (name: string, ...args: unknown[]) => timelock.getFunction(name)(...args);

  // Compute operation ID from parameters
  const operationId = await call('hashOperation', target, 0, calldata, predecessor, salt);
  console.log(`Operation ID: ${operationId}`);

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
    console.error('\n❌ Operation ID not found on the timelock. Check the parameters.');
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
  const chain = defineChain({ id: config.chainId, rpc: config.rpc });
  const serverWallet = Engine.serverWallet({
    client,
    address: config.address,
    executionOptions: { type: 'EOA', from: config.address },
  });

  const timelockIface = new ethers.Interface(TIMELOCK_ABI);
  const executeData = timelockIface.encodeFunctionData('execute', [
    target,
    0,          // value: 0
    calldata,
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
    console.log('\n=== EXECUTION SUCCESSFUL ===');
    console.log(`Operation ${operationId} executed on-chain.`);
  } else {
    console.error('\n❌ Operation executed but isOperationDone returned false. Investigate.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\nFATAL:', error instanceof Error ? error.message : error);
  process.exit(1);
});
