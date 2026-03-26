/**
 * Direct contract call utility for devnet (no timelock).
 *
 * Loads the deployment key from ~/.ssh/test-evm-deployment-key and sends
 * the transaction directly to the target contract. Used when the network
 * has no TimelockController configured.
 */

import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { AdminWalletConfig } from './config.js';

export interface DirectCallParams {
  config: AdminWalletConfig;
  target: string;
  calldata: string;
  description: string;
}

function loadDeploymentKey(): string {
  const keyPath = process.env.DEPLOYMENT_KEY_PATH
    || path.join(process.env.HOME || '', '.ssh', 'test-evm-deployment-key');

  if (!fs.existsSync(keyPath)) {
    throw new Error(
      `Deployment key not found at ${keyPath}. ` +
      `Set DEPLOYMENT_KEY_PATH or create the key file.`
    );
  }

  const raw = fs.readFileSync(keyPath, 'utf8').trim();
  const match = raw.match(/^\s*PRIVATE_KEY\s*=\s*(.+)\s*$/);
  let key = match ? match[1]!.trim() : raw;
  key = key.replace(/^0x/i, '');

  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(`Invalid key format in ${keyPath}. Expected 64 hex chars.`);
  }

  return `0x${key}`;
}

export async function submitDirectCall(params: DirectCallParams): Promise<string> {
  const { config, target, calldata, description } = params;

  console.log(`\nDevnet mode: sending direct call (no timelock)`);
  console.log(`Description: ${description}`);

  const privateKey = loadDeploymentKey();
  const provider = new ethers.JsonRpcProvider(config.rpc);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log(`Sender: ${wallet.address}`);

  const tx = await wallet.sendTransaction({
    to: target,
    data: calldata,
    value: 0,
  });

  console.log(`Tx hash: ${tx.hash}`);
  const receipt = await tx.wait();

  if (receipt?.status === 1) {
    console.log(`\n=== DIRECT CALL SUCCEEDED ===`);
    console.log(`Transaction: ${tx.hash}`);
  } else {
    throw new Error(`Transaction reverted: ${tx.hash}`);
  }

  return tx.hash;
}
