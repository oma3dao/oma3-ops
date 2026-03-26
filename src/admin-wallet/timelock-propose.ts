/**
 * Shared utility for submitting timelock proposals via the admin server wallet.
 *
 * Encodes a contract call, wraps it in a TimelockController.schedule() call,
 * submits via the Thirdweb server wallet, and prints the operation details
 * needed for later execution.
 */

import { ethers } from 'ethers';
import { createThirdwebClient, defineChain, prepareTransaction, Engine } from 'thirdweb';
import { AdminWalletConfig, requireTimelock } from './config.js';
import { promptSecretKey } from './prompt-secret.js';
import { TIMELOCK_ABI } from './timelock-abi.js';

export interface ProposeParams {
  /** Network name (for display in execute instructions) */
  network: string;
  /** Network config */
  config: AdminWalletConfig;
  /** Target contract address */
  target: string;
  /** ABI-encoded function call data */
  calldata: string;
  /** Human-readable description (used in salt for uniqueness) */
  description: string;
}

export interface ProposeResult {
  operationId: string;
  salt: string;
  transactionHash: string;
  earliestExecute: string;
}

export async function submitTimelockProposal(params: ProposeParams): Promise<ProposeResult> {
  const { network, config, target, calldata, description } = params;
  const timelockAddress = requireTimelock(config);

  const provider = new ethers.JsonRpcProvider(config.rpc);
  const timelock = new ethers.Contract(timelockAddress, TIMELOCK_ABI, provider);
  const call = (name: string, ...args: unknown[]) => timelock.getFunction(name)(...args);

  // Get timelock delay
  const minDelay = await call('getMinDelay');
  console.log(`Timelock delay: ${minDelay}s (${Number(minDelay) / 3600}h)`);

  // Generate unique salt from description + timestamp
  const salt = ethers.id(`${description}-${Date.now()}`);
  const predecessor = ethers.ZeroHash;

  // Prompt for secret key and set up server wallet
  const secretKey = await promptSecretKey();
  const client = createThirdwebClient({ secretKey });
  const chain = defineChain({ id: config.chainId, rpc: config.rpc });
  const serverWallet = Engine.serverWallet({
    client,
    address: config.address,
    executionOptions: { type: 'EOA', from: config.address },
  });

  // Encode the schedule() call
  const timelockIface = new ethers.Interface(TIMELOCK_ABI);
  const scheduleData = timelockIface.encodeFunctionData('schedule', [
    target,
    0,          // value: 0
    calldata,
    predecessor,
    salt,
    minDelay,
  ]);

  // Submit via server wallet
  console.log('Submitting timelock proposal...');
  const tx = prepareTransaction({
    chain,
    client,
    to: timelockAddress as `0x${string}`,
    value: 0n,
    data: scheduleData as `0x${string}`,
  });

  const { transactionId } = await serverWallet.enqueueTransaction({ transaction: tx });
  console.log(`Enqueued: ${transactionId}`);

  const { transactionHash } = await Engine.waitForTransactionHash({
    client,
    transactionId,
    timeoutInSeconds: 120,
  });
  console.log(`Confirmed: ${transactionHash}`);

  // Compute operation ID and execution time
  const operationId = await call('hashOperation', target, 0, calldata, predecessor, salt);
  const isPending = await call('isOperationPending', operationId);
  const block = await provider.getBlock('latest');
  const executionTime = Number(block!.timestamp) + Number(minDelay);
  const earliestExecute = new Date(executionTime * 1000).toISOString();

  if (!isPending) {
    throw new Error('Operation was not registered as pending. Something went wrong.');
  }

  console.log(`\n=== PROPOSAL SUBMITTED ===`);
  console.log(`Operation ID:     ${operationId}`);
  console.log(`Salt:             ${salt}`);
  console.log(`Target:           ${target}`);
  console.log(`Calldata:         ${calldata}`);
  console.log(`Earliest execute: ${earliestExecute}`);
  console.log(`\nTo execute after the delay:`);
  console.log(`  npm run admin:execute-proposal -- \\`);
  console.log(`    --network ${network} \\`);
  console.log(`    --target ${target} \\`);
  console.log(`    --calldata ${calldata} \\`);
  console.log(`    --salt ${salt}`);

  return { operationId, salt, transactionHash, earliestExecute };
}
