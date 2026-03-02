import { Interface, JsonRpcProvider, getAddress } from 'ethers';
import { getNetworkConfig, getRpcUrl, type NetworkConfig, type NetworkName } from './config.js';

const OMA_LOCK_ABI = ['function omaToken() view returns (address)'] as const;
const OMA_TOKEN_ABI = ['function decimals() view returns (uint8)'] as const;
const LOCK_INTERFACE = new Interface(OMA_LOCK_ABI);
const TOKEN_INTERFACE = new Interface(OMA_TOKEN_ABI);

export interface ChainContext {
  readonly network: NetworkConfig;
  readonly rpcUrl: string;
  readonly lockContract: string;
  readonly omaToken: string;
  readonly decimals: number;
}

export interface ChainContextOptions {
  readonly networkName: NetworkName;
  readonly rpcUrl?: string;
  readonly lockContractOverride?: string;
  readonly omaTokenOverride?: string;
  readonly allowAddressOverride: boolean;
}

function resolveAddressOverrides(
  defaults: NetworkConfig,
  lockContractOverride: string | undefined,
  omaTokenOverride: string | undefined,
  allowAddressOverride: boolean,
): { lockContract: string; omaToken: string } {
  if ((lockContractOverride || omaTokenOverride) && !allowAddressOverride) {
    throw new Error(
      'Address override requested but --allow-address-override was not provided.',
    );
  }

  const lockContract = lockContractOverride
    ? getAddress(lockContractOverride)
    : defaults.omaLock;
  const omaToken = omaTokenOverride ? getAddress(omaTokenOverride) : defaults.omaToken;

  return { lockContract, omaToken };
}

export async function loadChainContext(options: ChainContextOptions): Promise<ChainContext> {
  const network = getNetworkConfig(options.networkName);
  const rpcUrl = getRpcUrl(network.name, options.rpcUrl);

  const { lockContract, omaToken } = resolveAddressOverrides(
    network,
    options.lockContractOverride,
    options.omaTokenOverride,
    options.allowAddressOverride,
  );

  const provider = new JsonRpcProvider(rpcUrl);
  const providerNetwork = await provider.getNetwork();
  if (providerNetwork.chainId !== network.chainId) {
    throw new Error(
      `RPC chain ID mismatch. Expected ${network.chainId.toString()} for ${network.name}, got ${providerNetwork.chainId.toString()}.`,
    );
  }

  const omaTokenCallData = LOCK_INTERFACE.encodeFunctionData('omaToken', []);
  const omaTokenCallResult = await provider.call({
    to: lockContract,
    data: omaTokenCallData,
  });
  const decodedOmaToken = LOCK_INTERFACE.decodeFunctionResult(
    'omaToken',
    omaTokenCallResult,
  );
  const onChainOmaTokenRaw = decodedOmaToken[0];
  if (typeof onChainOmaTokenRaw !== 'string') {
    throw new Error('Unexpected omaToken() return type.');
  }
  const onChainOmaToken = getAddress(onChainOmaTokenRaw);
  if (onChainOmaToken !== omaToken) {
    throw new Error(
      `OMALock->omaToken mismatch. Lock points to ${onChainOmaToken}, configured OMA token is ${omaToken}.`,
    );
  }

  const decimalsCallData = TOKEN_INTERFACE.encodeFunctionData('decimals', []);
  const decimalsCallResult = await provider.call({
    to: omaToken,
    data: decimalsCallData,
  });
  const decodedDecimals = TOKEN_INTERFACE.decodeFunctionResult(
    'decimals',
    decimalsCallResult,
  );
  const decimalsRaw = decodedDecimals[0];
  if (typeof decimalsRaw !== 'bigint') {
    throw new Error('Unexpected decimals() return type.');
  }
  const decimals = Number(decimalsRaw);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error(`Invalid token decimals '${decimals}'.`);
  }

  return {
    network,
    rpcUrl,
    lockContract,
    omaToken,
    decimals,
  };
}
