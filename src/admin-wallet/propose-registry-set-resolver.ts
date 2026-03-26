#!/usr/bin/env node
/**
 * Propose setting a resolver address on the registry.
 *
 * Supports all three resolver slots: ownership, dataurl, registration.
 *
 * Usage:
 *   npm run admin:propose-registry-set-resolver -- \
 *     --network omachainTestnet --type ownership --resolver 0x...
 */

import { ethers } from 'ethers';
import { parseCliArgs, getRequiredOption, getBooleanFlag, assertNoUnknownOptions } from '../cli-utils.js';
import { getAdminWalletConfig, requireContract } from './config.js';
import { submitTimelockProposal } from './timelock-propose.js';
import { submitDirectCall } from './direct-call.js';
import { REGISTRY_ABI } from './contract-abis.js';

const ALLOWED_OPTIONS = new Set(['network', 'type', 'resolver', 'direct-call', 'help']);

const RESOLVER_FUNCTIONS: Record<string, string> = {
  'ownership': 'setOwnershipResolver',
  'dataurl': 'setDataUrlResolver',
  'registration': 'setRegistrationResolver',
};

function printUsage(): void {
  console.log(`
Usage: propose-registry-set-resolver --network <network> --type <type> --resolver <address>

Proposes setting a resolver address on the registry via the timelock.

Options:
  --network       Target network (required)
  --type          Resolver type: ownership, dataurl, or registration (required)
  --resolver      New resolver contract address (required)
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
  const type = getRequiredOption(options, 'type');
  const resolverAddress = getRequiredOption(options, 'resolver');
  const directCall = getBooleanFlag(options, 'direct-call');
  const config = getAdminWalletConfig(network);
  const registryAddress = requireContract(config, 'registry');

  const functionName = RESOLVER_FUNCTIONS[type.toLowerCase()];
  if (!functionName) {
    throw new Error(`Invalid resolver type '${type}'. Must be: ${Object.keys(RESOLVER_FUNCTIONS).join(', ')}`);
  }

  if (!ethers.isAddress(resolverAddress)) {
    throw new Error(`Invalid resolver address: ${resolverAddress}`);
  }

  // Print contract owner so operator can see if timelock-controlled or not
  const provider = new ethers.JsonRpcProvider(config.rpc);
  const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, provider);
  const owner = await registry.getFunction('owner')();

  console.log(`\n=== Propose Set Resolver ===`);
  console.log(`Network:  ${config.name}`);
  console.log(`Registry: ${registryAddress}`);
  console.log(`Owner:    ${owner}`);
  console.log(`Type:     ${type} (${functionName})`);
  console.log(`Resolver: ${resolverAddress}`);

  const iface = new ethers.Interface(REGISTRY_ABI);
  const calldata = iface.encodeFunctionData(functionName, [resolverAddress]);

  if (config.timelock) {
    await submitTimelockProposal({
      network,
      config,
      target: registryAddress,
      calldata,
      description: `set-${type}-resolver-${resolverAddress}`,
    });
  } else if (directCall) {
    console.log('\n⚠️  No timelock configured. Using --direct-call to bypass governance.');
    await submitDirectCall({
      config,
      target: registryAddress,
      calldata,
      description: `set-${type}-resolver-${resolverAddress}`,
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
