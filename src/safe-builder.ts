import { Interface, getAddress } from 'ethers';

export type Operation = 'addLocks' | 'updateLocks' | 'slash' | 'slashStake';

const LOCK_INTERFACE = new Interface([
  'function addLocks(address[] wallets_, uint96[] amounts_, uint40 cliffDate_, uint40 lockEndDate_)',
  'function updateLocks(address[] wallets_, uint40 cliffDate_, uint40 lockEndDate_)',
  'function slash(address wallet_, address to_)',
  'function slashStake(address wallet_, uint96 amount_, address to_)',
]);

interface ContractMethodInput {
  readonly internalType: string;
  readonly name: string;
  readonly type: string;
}

interface ContractMethod {
  readonly name: string;
  readonly payable: false;
  readonly inputs: readonly ContractMethodInput[];
}

export interface SafeTransaction {
  readonly to: string;
  readonly value: '0';
  readonly data: string;
  readonly contractMethod: ContractMethod;
  readonly contractInputsValues: Record<string, string>;
}

export interface ChunkPayload {
  readonly operation: Operation;
  readonly lockContract: string;
  readonly wallets: string[];
  readonly amountsWei: bigint[];
  readonly cliffDate: number;
  readonly lockEndDate: number;
}

function contractMethodFor(operation: Operation): ContractMethod {
  if (operation === 'addLocks') {
    return {
      name: 'addLocks',
      payable: false,
      inputs: [
        { internalType: 'address[]', name: 'wallets_', type: 'address[]' },
        { internalType: 'uint96[]', name: 'amounts_', type: 'uint96[]' },
        { internalType: 'uint40', name: 'cliffDate_', type: 'uint40' },
        { internalType: 'uint40', name: 'lockEndDate_', type: 'uint40' },
      ],
    };
  }

  if (operation === 'slash') {
    return {
      name: 'slash',
      payable: false,
      inputs: [
        { internalType: 'address', name: 'wallet_', type: 'address' },
        { internalType: 'address', name: 'to_', type: 'address' },
      ],
    };
  }

  if (operation === 'slashStake') {
    return {
      name: 'slashStake',
      payable: false,
      inputs: [
        { internalType: 'address', name: 'wallet_', type: 'address' },
        { internalType: 'uint96', name: 'amount_', type: 'uint96' },
        { internalType: 'address', name: 'to_', type: 'address' },
      ],
    };
  }

  return {
    name: 'updateLocks',
    payable: false,
    inputs: [
      { internalType: 'address[]', name: 'wallets_', type: 'address[]' },
      { internalType: 'uint40', name: 'cliffDate_', type: 'uint40' },
      { internalType: 'uint40', name: 'lockEndDate_', type: 'uint40' },
    ],
  };
}

export function buildSafeTransaction(payload: ChunkPayload): SafeTransaction {
  const lockContract = getAddress(payload.lockContract);
  const wallets = payload.wallets.map((wallet) => getAddress(wallet));
  const cliff = payload.cliffDate;
  const lockEnd = payload.lockEndDate;

  if (payload.operation === 'addLocks') {
    const amounts = payload.amountsWei.map((value) => value.toString());
    const data = LOCK_INTERFACE.encodeFunctionData('addLocks', [
      wallets,
      payload.amountsWei,
      cliff,
      lockEnd,
    ]);

    return {
      to: lockContract,
      value: '0',
      data,
      contractMethod: contractMethodFor('addLocks'),
      contractInputsValues: {
        wallets_: JSON.stringify(wallets),
        amounts_: JSON.stringify(amounts),
        cliffDate_: cliff.toString(),
        lockEndDate_: lockEnd.toString(),
      },
    };
  }

  const data = LOCK_INTERFACE.encodeFunctionData('updateLocks', [wallets, cliff, lockEnd]);

  return {
    to: lockContract,
    value: '0',
    data,
    contractMethod: contractMethodFor('updateLocks'),
    contractInputsValues: {
      wallets_: JSON.stringify(wallets),
      cliffDate_: cliff.toString(),
      lockEndDate_: lockEnd.toString(),
    },
  };
}

export interface SlashPayload {
  readonly lockContract: string;
  readonly wallet: string;
  readonly to: string;
}

export function buildSlashTransaction(payload: SlashPayload): SafeTransaction {
  const lockContract = getAddress(payload.lockContract);
  const wallet = getAddress(payload.wallet);
  const to = getAddress(payload.to);

  const data = LOCK_INTERFACE.encodeFunctionData('slash', [wallet, to]);

  return {
    to: lockContract,
    value: '0',
    data,
    contractMethod: contractMethodFor('slash'),
    contractInputsValues: {
      wallet_: wallet,
      to_: to,
    },
  };
}

export interface SlashStakePayload {
  readonly lockContract: string;
  readonly wallet: string;
  readonly amountWei: bigint;
  readonly to: string;
}

export function buildSlashStakeTransaction(payload: SlashStakePayload): SafeTransaction {
  const lockContract = getAddress(payload.lockContract);
  const wallet = getAddress(payload.wallet);
  const to = getAddress(payload.to);

  const data = LOCK_INTERFACE.encodeFunctionData('slashStake', [
    wallet,
    payload.amountWei,
    to,
  ]);

  return {
    to: lockContract,
    value: '0',
    data,
    contractMethod: contractMethodFor('slashStake'),
    contractInputsValues: {
      wallet_: wallet,
      amount_: payload.amountWei.toString(),
      to_: to,
    },
  };
}

export interface SafeBatchFile {
  readonly version: '1.0';
  readonly chainId: string;
  readonly createdAt: 0;
  readonly meta: {
    readonly name: string;
    readonly description: string;
    readonly txBuilderVersion: string;
    readonly createdFromSafeAddress: '';
    readonly createdFromOwnerAddress: '';
  };
  readonly transactions: readonly SafeTransaction[];
}

export function buildSafeBatchFile(params: {
  readonly chainId: bigint;
  readonly operation: Operation;
  readonly shortFingerprint: string;
  readonly transactions: readonly SafeTransaction[];
}): SafeBatchFile {
  const CLI_COMMANDS: Record<Operation, string> = {
    addLocks: 'lock-add-locks',
    updateLocks: 'lock-update-locks',
    slash: 'lock-slash',
    slashStake: 'lock-slash-stake',
  };
  const cliCommand = CLI_COMMANDS[params.operation];
  return {
    version: '1.0',
    chainId: params.chainId.toString(),
    createdAt: 0,
    meta: {
      name: `OMA3 ${cliCommand} ${params.shortFingerprint.replace(/^0x/, '')}`,
      description: 'Generated by oma3-ops',
      txBuilderVersion: '1.x',
      createdFromSafeAddress: '',
      createdFromOwnerAddress: '',
    },
    transactions: params.transactions,
  };
}
