#!/usr/bin/env node
/**
 * Check the status of a Thirdweb Engine transaction by ID.
 *
 * Usage:
 *   npx tsx src/admin-wallet/check-tx-status.ts --tx-id <transactionId>
 */

import { createThirdwebClient, Engine } from 'thirdweb';
import { parseCliArgs, getRequiredOption, getBooleanFlag, assertNoUnknownOptions } from '../cli-utils.js';
import { promptSecretKey } from './prompt-secret.js';

const ALLOWED_OPTIONS = new Set(['tx-id', 'help']);

function printUsage(): void {
  console.log(`
Usage: check-tx-status --tx-id <transactionId>

Checks the status of a Thirdweb Engine transaction.

Options:
  --tx-id   Thirdweb transaction ID (required)
  --help    Show this help
`);
}

async function main(): Promise<void> {
  const { options } = parseCliArgs(process.argv.slice(2));

  if (getBooleanFlag(options, 'help')) {
    printUsage();
    return;
  }

  assertNoUnknownOptions(options, ALLOWED_OPTIONS);

  const transactionId = getRequiredOption(options, 'tx-id');

  const secretKey = await promptSecretKey();
  const client = createThirdwebClient({ secretKey });

  const result = await Engine.getTransactionStatus({ client, transactionId });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error('\nFATAL:', error instanceof Error ? error.message : error);
  process.exit(1);
});
