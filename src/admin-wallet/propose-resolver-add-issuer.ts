#!/usr/bin/env node
/**
 * Propose adding an authorized issuer to the resolver.
 *
 * On testnet/mainnet: submits a timelock proposal via the admin server wallet.
 * On devnet: calls the contract directly (no timelock).
 *
 * Usage:
 *   npm run admin:propose-resolver-add-issuer -- --network omachainTestnet --issuer 0x...
 */

import { ethers } from 'ethers';
import { parseCliArgs, getRequiredOption, getBooleanFlag, assertNoUnknownOptions } from '../cli-utils.js';
import { getAdminWalletConfig, requireContract } from './config.js';
import { submitTimelockProposal } from './timelock-propose.js';
import { submitDirectCall } from './direct-call.js';
import { RESOLVER_ABI } from './contract-abis.js';

const ALLOWED_OPTIONS = new Set(['network', 'issuer', 'direct-call', 'help']);

function printUsage(): void {
  console.log(`
Usage: propose-resolver-add-issuer --network <network> --issuer <address>

Proposes adding an authorized issuer to the resolver via the timelock.

Options:
  --network       Target network (required)
  --issuer        Address to authorize as issuer (required)
  --direct-call   Bypass timelock and call contract directly (devnet only)
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
  const issuer = getRequiredOption(options, 'issuer');
  const directCall = getBooleanFlag(options, 'direct-call');
  const config = getAdminWalletConfig(network);
  const resolverAddress = requireContract(config, 'resolver');

  if (!ethers.isAddress(issuer)) {
    throw new Error(`Invalid issuer address: ${issuer}`);
  }

  // Print contract owner so operator can see if timelock-controlled or not
  const provider = new ethers.JsonRpcProvider(config.rpc);
  const resolver = new ethers.Contract(resolverAddress, RESOLVER_ABI, provider);
  const owner = await resolver.getFunction('owner')();

  console.log(`\n=== Propose Add Issuer ===`);
  console.log(`Network:  ${config.name}`);
  console.log(`Resolver: ${resolverAddress}`);
  console.log(`Owner:    ${owner}`);
  console.log(`Issuer:   ${issuer}`);

  // Check if already authorized
  const isAlready = await resolver.getFunction('isIssuer')(issuer);
  if (isAlready) {
    console.log('\n⚠️  Address is already an authorized issuer. Nothing to do.');
    return;
  }

  // Encode the addAuthorizedIssuer call
  const iface = new ethers.Interface(RESOLVER_ABI);
  const calldata = iface.encodeFunctionData('addAuthorizedIssuer', [issuer]);

  if (config.timelock) {
    await submitTimelockProposal({
      network,
      config,
      target: resolverAddress,
      calldata,
      description: `add-issuer-${issuer}`,
    });
  } else if (directCall) {
    console.log('\n⚠️  No timelock configured. Using --direct-call to bypass governance.');
    await submitDirectCall({
      config,
      target: resolverAddress,
      calldata,
      description: `add-issuer-${issuer}`,
    });
  } else {
    throw new Error(
      'No timelock configured for this network. ' +
      'Pass --direct-call to bypass governance (devnet only).'
    );
  }
}

main().catch((error) => {
  console.error('\nFATAL:', error instanceof Error ? error.message : error);
  process.exit(1);
});
