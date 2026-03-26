#!/usr/bin/env node
/**
 * Propose enabling or disabling the dataUrl attestation requirement.
 *
 * Usage:
 *   npm run admin:propose-registry-set-require-attestation -- \
 *     --network omachainTestnet --require true
 */

import { ethers } from 'ethers';
import { parseCliArgs, getRequiredOption, getBooleanFlag, assertNoUnknownOptions } from '../cli-utils.js';
import { getAdminWalletConfig, requireContract } from './config.js';
import { submitTimelockProposal } from './timelock-propose.js';
import { submitDirectCall } from './direct-call.js';
import { REGISTRY_ABI } from './contract-abis.js';

const ALLOWED_OPTIONS = new Set(['network', 'require', 'direct-call', 'help']);

function printUsage(): void {
  console.log(`
Usage: propose-registry-set-require-attestation --network <network> --require <true|false>

Proposes enabling or disabling the dataUrl attestation requirement
on the registry via the timelock.

Options:
  --network       Target network (required)
  --require       true to enable, false to disable (required)
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
  const requireValue = getRequiredOption(options, 'require');
  const directCall = getBooleanFlag(options, 'direct-call');
  const config = getAdminWalletConfig(network);
  const registryAddress = requireContract(config, 'registry');

  const enabled = requireValue.toLowerCase() === 'true';
  if (requireValue.toLowerCase() !== 'true' && requireValue.toLowerCase() !== 'false') {
    throw new Error(`--require must be 'true' or 'false', got '${requireValue}'`);
  }

  // Print contract owner so operator can see if timelock-controlled or not
  const provider = new ethers.JsonRpcProvider(config.rpc);
  const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, provider);
  const owner = await registry.getFunction('owner')();

  console.log(`\n=== Propose Set Require Attestation ===`);
  console.log(`Network:  ${config.name}`);
  console.log(`Registry: ${registryAddress}`);
  console.log(`Owner:    ${owner}`);
  console.log(`Require:  ${enabled}`);

  const iface = new ethers.Interface(REGISTRY_ABI);
  const calldata = iface.encodeFunctionData('setRequireDataUrlAttestation', [enabled]);

  if (config.timelock) {
    await submitTimelockProposal({
      network,
      config,
      target: registryAddress,
      calldata,
      description: `set-require-attestation-${enabled}`,
    });
  } else if (directCall) {
    console.log('\n⚠️  No timelock configured. Using --direct-call to bypass governance.');
    await submitDirectCall({
      config,
      target: registryAddress,
      calldata,
      description: `set-require-attestation-${enabled}`,
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
