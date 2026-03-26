#!/usr/bin/env node
/**
 * Timelock Smoke Test (Phase A Step 4 in deploy README)
 *
 * Verifies the admin server wallet can interact with the TimelockController:
 * 1. Checks PROPOSER_ROLE and EXECUTOR_ROLE are assigned to the admin wallet
 * 2. Verifies DEFAULT_ADMIN_ROLE is address(0) (self-managed)
 * 3. Negative test: confirms a random wallet cannot schedule
 * 4. Schedules a zero-value self-call via the admin server wallet
 * 5. Prints proposal ID and earliest execution time
 *
 * Usage:
 *   npm run admin:timelock-smoke-test -- --network omachainTestnet --timelock 0x... --admin 0x...
 *
 * The secret key is prompted interactively (never stored on disk).
 */

import { ethers } from 'ethers';
import { createThirdwebClient, defineChain, prepareTransaction, Engine } from 'thirdweb';
import { parseCliArgs, getRequiredOption, getBooleanFlag, assertNoUnknownOptions } from '../cli-utils.js';
import { getAdminWalletConfig } from './config.js';
import { promptSecretKey } from './prompt-secret.js';
import { TIMELOCK_ABI } from './timelock-abi.js';

const ALLOWED_OPTIONS = new Set(['network', 'timelock', 'admin', 'help']);

function printUsage(): void {
  console.log(`
Usage: timelock-smoke-test --network <omachainTestnet|omachainMainnet> --timelock <address> --admin <address>

Options:
  --network    Target network (required)
  --timelock   TimelockController contract address (required)
  --admin      Admin server wallet address (required, must match config)
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
  const timelockAddress = getRequiredOption(options, 'timelock');
  const adminAddress = getRequiredOption(options, 'admin');
  const walletConfig = getAdminWalletConfig(network);

  // Sanity: admin address should match config
  if (adminAddress.toLowerCase() !== walletConfig.address.toLowerCase()) {
    console.warn(`WARNING: --admin ${adminAddress} does not match config address ${walletConfig.address}`);
  }

  console.log(`\n=== Timelock Smoke Test ===`);
  console.log(`Network:   ${walletConfig.name}`);
  console.log(`Chain ID:  ${walletConfig.chainId}`);
  console.log(`Timelock:  ${timelockAddress}`);
  console.log(`Admin:     ${adminAddress}`);
  console.log();

  const provider = new ethers.JsonRpcProvider(walletConfig.rpc);
  const timelock = new ethers.Contract(timelockAddress, TIMELOCK_ABI, provider);
  // Helper to call typed contract functions (ethers v6 string ABI doesn't auto-type)
  const call = (name: string, ...args: unknown[]) => timelock.getFunction(name)(...args);

  // ── Step 1: Check roles ──────────────────────────────────────────────
  console.log('1. Checking timelock roles...');

  const [proposerRole, executorRole, adminRole] = await Promise.all([
    call('PROPOSER_ROLE'),
    call('EXECUTOR_ROLE'),
    call('DEFAULT_ADMIN_ROLE'),
  ]);

  const [hasProposer, hasExecutor, timelockIsSelfAdmin, zeroIsNotAdmin] = await Promise.all([
    call('hasRole', proposerRole, adminAddress),
    call('hasRole', executorRole, adminAddress),
    call('hasRole', adminRole, timelockAddress),
    call('hasRole', adminRole, ethers.ZeroAddress),
  ]);

  console.log(`   PROPOSER_ROLE: ${hasProposer ? '✅' : '❌'}`);
  console.log(`   EXECUTOR_ROLE: ${hasExecutor ? '✅' : '❌'}`);
  console.log(`   DEFAULT_ADMIN = timelock itself: ${timelockIsSelfAdmin ? '✅' : '❌'}`);
  console.log(`   No external admin (address(0) has no role): ${!zeroIsNotAdmin ? '✅' : '❌'}`);

  if (!hasProposer || !hasExecutor) {
    console.error('\nFATAL: Admin wallet is missing required roles. Check deploy-timelock output.');
    process.exit(1);
  }
  if (!timelockIsSelfAdmin) {
    console.warn('\nWARNING: Timelock does not hold DEFAULT_ADMIN_ROLE on itself. Role management may not work.');
  }

  const minDelay = await call('getMinDelay');
  console.log(`   Min delay: ${minDelay}s (${Number(minDelay) / 3600}h)`);

  // ── Step 2: Negative test ────────────────────────────────────────────
  console.log('\n2. Negative test: confirming non-proposer cannot schedule...');

  const randomWallet = ethers.Wallet.createRandom().connect(provider);
  const timelockAsRandom = new ethers.Contract(timelockAddress, TIMELOCK_ABI, randomWallet);

  // Build the same zero-value self-call we'll use for the real test
  const salt = ethers.id(`smoke-test-${Date.now()}`);
  const predecessor = ethers.ZeroHash;

  try {
    // staticCall simulates without sending — no gas needed
    const scheduleFn = timelockAsRandom.getFunction('schedule');
    await scheduleFn.staticCall(
      timelockAddress, // target: self
      0,               // value: 0
      '0x',            // data: empty (no-op)
      predecessor,
      salt,
      minDelay,
    );
    console.error('   ❌ UNEXPECTED: random wallet was able to schedule. Roles may be misconfigured.');
    process.exit(1);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('AccessControl')) {
      console.log('   ✅ Correctly reverted with AccessControl error');
    } else {
      console.error(`   ❌ Reverted with unexpected error: ${msg.slice(0, 120)}`);
      console.error('   Expected AccessControl revert. This may indicate an ABI mismatch, wrong address, or RPC issue.');
      process.exit(1);
    }
  }

  // ── Step 3: Schedule via admin server wallet ─────────────────────────
  console.log('\n3. Scheduling zero-value self-call via admin server wallet...');

  const secretKey = await promptSecretKey();
  const client = createThirdwebClient({ secretKey });
  const chain = defineChain({ id: walletConfig.chainId, rpc: walletConfig.rpc });
  const serverWallet = Engine.serverWallet({
    client,
    address: walletConfig.address,
    executionOptions: { type: 'EOA', from: walletConfig.address },
  });

  // Encode the schedule() call
  const timelockIface = new ethers.Interface(TIMELOCK_ABI);
  const scheduleData = timelockIface.encodeFunctionData('schedule', [
    timelockAddress, // target: self
    0,               // value: 0
    '0x',            // data: empty (no-op)
    predecessor,
    salt,
    minDelay,
  ]);

  const tx = prepareTransaction({
    chain,
    client,
    to: timelockAddress as `0x${string}`,
    value: 0n,
    data: scheduleData as `0x${string}`,
  });

  const { transactionId } = await serverWallet.enqueueTransaction({ transaction: tx });
  console.log(`   Enqueued: ${transactionId}`);

  const { transactionHash } = await Engine.waitForTransactionHash({
    client,
    transactionId,
    timeoutInSeconds: 120,
  });
  console.log(`   Confirmed: ${transactionHash}`);

  // ── Step 4: Compute proposal ID and execution time ───────────────────
  const operationId = await call('hashOperation',
    timelockAddress,
    0,
    '0x',
    predecessor,
    salt,
  );

  const isPending = await call('isOperationPending', operationId);
  const block = await provider.getBlock('latest');
  const executionTime = Number(block!.timestamp) + Number(minDelay);
  const executionDate = new Date(executionTime * 1000).toISOString();

  console.log(`\n=== SMOKE TEST PROPOSAL ===`);
  console.log(`Operation ID:     ${operationId}`);
  console.log(`Status:           ${isPending ? 'PENDING ✅' : 'NOT PENDING ❌'}`);
  console.log(`Salt:             ${salt}`);
  console.log(`Earliest execute: ${executionDate}`);
  console.log(`\nSave these values for Phase A Step 10 (timelock-smoke-execute):`);
  console.log(`  --operation-id ${operationId}`);
  console.log(`  --salt ${salt}`);

  if (!isPending) {
    console.error('\nFATAL: Operation was not registered as pending. Something went wrong.');
    process.exit(1);
  }

  console.log('\n=== SMOKE TEST PASSED ===');
  console.log('Roles verified, negative test passed, proposal scheduled.');
  console.log(`Execute after ${executionDate} using timelock-smoke-execute.`);
}

main().catch((error) => {
  console.error('\nFATAL:', error instanceof Error ? error.message : error);
  process.exit(1);
});
