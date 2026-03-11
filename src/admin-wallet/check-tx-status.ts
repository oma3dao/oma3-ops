#!/usr/bin/env node
/**
 * Check the status of a Thirdweb Engine transaction by ID.
 *
 * Usage:
 *   ADMIN_THIRDWEB_SECRET_KEY=xxx npx tsx src/admin-wallet/check-tx-status.ts <transactionId>
 */

import { createThirdwebClient, Engine } from 'thirdweb';

const transactionId = process.argv[2];
if (!transactionId) {
  console.error('Usage: check-tx-status.ts <transactionId>');
  process.exit(1);
}

const secretKey = process.env.ADMIN_THIRDWEB_SECRET_KEY;
if (!secretKey) {
  console.error('Set ADMIN_THIRDWEB_SECRET_KEY env var');
  process.exit(1);
}

const client = createThirdwebClient({ secretKey });

const result = await Engine.getTransactionStatus({ client, transactionId });
console.log(JSON.stringify(result, null, 2));
