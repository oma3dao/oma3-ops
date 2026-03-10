import { describe, it, expect } from 'vitest';
import { Interface } from 'ethers';
import {
  buildSafeTransaction,
  buildSlashTransaction,
  buildSlashStakeTransaction,
  buildSafeBatchFile,
  type ChunkPayload,
} from '../../src/safe-builder.js';

const LOCK_CONTRACT = '0x2f38D6cCB480d5C7e68d11b5a02f2c2451543F58';
const WALLET_1 = '0x0000000000000000000000000000000000000001';
const WALLET_2 = '0x0000000000000000000000000000000000000002';

const ADD_LOCKS_INTERFACE = new Interface([
  'function addLocks(address[] wallets_, uint96[] amounts_, uint40 cliffDate_, uint40 lockEndDate_)',
]);
const UPDATE_LOCKS_INTERFACE = new Interface([
  'function updateLocks(address[] wallets_, uint40 cliffDate_, uint40 lockEndDate_)',
]);
const SLASH_INTERFACE = new Interface([
  'function slash(address wallet_, address to_)',
]);
const SLASH_STAKE_INTERFACE = new Interface([
  'function slashStake(address wallet_, uint96 amount_, address to_)',
]);

const DESTINATION = '0x000000000000000000000000000000000000dEaD';

describe('buildSafeTransaction - addLocks', () => {
  const payload: ChunkPayload = {
    operation: 'addLocks',
    lockContract: LOCK_CONTRACT,
    wallets: [WALLET_1],
    amountsWei: [1000000000000000000n],
    cliffDate: 1767225600,
    lockEndDate: 1798761600,
  };

  it('correct function selector (spec: 0x2b6e1925; we assert via Interface to match implementation ABI)', () => {
    const tx = buildSafeTransaction(payload);
    const expected = ADD_LOCKS_INTERFACE.getFunction('addLocks')!.selector;
    expect(tx.data.startsWith(expected)).toBe(true);
  });

  it('wallets in calldata', () => {
    const tx = buildSafeTransaction({
      ...payload,
      wallets: [WALLET_1, WALLET_2],
      amountsWei: [1000000000000000000n, 2000000000000000000n],
    });
    const decoded = ADD_LOCKS_INTERFACE.decodeFunctionData('addLocks', tx.data);
    const wallets = decoded[0] as string[];
    expect(wallets.map((w) => w.toLowerCase())).toContain(WALLET_1.toLowerCase());
    expect(wallets.map((w) => w.toLowerCase())).toContain(WALLET_2.toLowerCase());
  });

  it('amounts in calldata', () => {
    const tx = buildSafeTransaction({
      ...payload,
      wallets: [WALLET_1, WALLET_2],
      amountsWei: [1000000000000000000n, 2000000000000000000n],
    });
    const decoded = ADD_LOCKS_INTERFACE.decodeFunctionData('addLocks', tx.data);
    const amounts = (decoded[1] as bigint[]).map((a) => a.toString());
    expect(amounts).toContain('1000000000000000000');
    expect(amounts).toContain('2000000000000000000');
  });

  it('cliff and lockEnd in calldata', () => {
    const tx = buildSafeTransaction(payload);
    const decoded = ADD_LOCKS_INTERFACE.decodeFunctionData('addLocks', tx.data);
    expect(Number(decoded[2])).toBe(1767225600);
    expect(Number(decoded[3])).toBe(1798761600);
  });
});

describe('buildSafeTransaction - updateLocks', () => {
  const payload: ChunkPayload = {
    operation: 'updateLocks',
    lockContract: LOCK_CONTRACT,
    wallets: [WALLET_1],
    amountsWei: [],
    cliffDate: 1767225600,
    lockEndDate: 1798761600,
  };

  it('correct function selector', () => {
    const tx = buildSafeTransaction(payload);
    const expected = UPDATE_LOCKS_INTERFACE.getFunction('updateLocks')!.selector;
    expect(tx.data.startsWith(expected)).toBe(true);
  });

  it('no amounts in calldata', () => {
    const tx = buildSafeTransaction({
      ...payload,
      wallets: [WALLET_1, WALLET_2],
    });
    // updateLocks signature has no amounts parameter
    expect(tx.contractInputsValues).not.toHaveProperty('amounts_');
  });

  it('wallets in calldata', () => {
    const tx = buildSafeTransaction({
      ...payload,
      wallets: [WALLET_1, WALLET_2],
    });
    const decoded = UPDATE_LOCKS_INTERFACE.decodeFunctionData('updateLocks', tx.data);
    const wallets = decoded[0] as string[];
    expect(wallets.map((w) => w.toLowerCase())).toContain(WALLET_1.toLowerCase());
    expect(wallets.map((w) => w.toLowerCase())).toContain(WALLET_2.toLowerCase());
  });
});

describe('contractInputsValues', () => {
  it('wallets are JSON stringified array', () => {
    const tx = buildSafeTransaction({
      operation: 'addLocks',
      lockContract: LOCK_CONTRACT,
      wallets: [WALLET_1, WALLET_2],
      amountsWei: [1000n, 2000n],
      cliffDate: 100,
      lockEndDate: 200,
    });
    const parsed = JSON.parse(tx.contractInputsValues.wallets_!) as string[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
  });

  it('amounts are JSON stringified string array', () => {
    const tx = buildSafeTransaction({
      operation: 'addLocks',
      lockContract: LOCK_CONTRACT,
      wallets: [WALLET_1, WALLET_2],
      amountsWei: [1000000000000000000n, 2000000000000000000n],
      cliffDate: 100,
      lockEndDate: 200,
    });
    const parsed = JSON.parse(tx.contractInputsValues.amounts_!) as string[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toBe('1000000000000000000');
    expect(parsed[1]).toBe('2000000000000000000');
  });
});

describe('contractMethod.inputs schema', () => {
  it('addLocks inputs match spec schema', () => {
    const tx = buildSafeTransaction({
      operation: 'addLocks',
      lockContract: LOCK_CONTRACT,
      wallets: [WALLET_1],
      amountsWei: [1000n],
      cliffDate: 100,
      lockEndDate: 200,
    });
    expect(tx.contractMethod.name).toBe('addLocks');
    expect(tx.contractMethod.payable).toBe(false);
    expect(tx.contractMethod.inputs).toEqual([
      { internalType: 'address[]', name: 'wallets_', type: 'address[]' },
      { internalType: 'uint96[]', name: 'amounts_', type: 'uint96[]' },
      { internalType: 'uint40', name: 'cliffDate_', type: 'uint40' },
      { internalType: 'uint40', name: 'lockEndDate_', type: 'uint40' },
    ]);
  });
});

describe('buildSafeBatchFile', () => {
  const baseTx = buildSafeTransaction({
    operation: 'addLocks',
    lockContract: LOCK_CONTRACT,
    wallets: [WALLET_1],
    amountsWei: [1000n],
    cliffDate: 100,
    lockEndDate: 200,
  });

  it('version is "1.0"', () => {
    const batch = buildSafeBatchFile({
      chainId: 11155111n,
      operation: 'addLocks',
      shortFingerprint: '0x9f2c1e4b7a21',
      transactions: [baseTx],
    });
    expect(batch.version).toBe('1.0');
  });

  it('chainId is string', () => {
    const batch = buildSafeBatchFile({
      chainId: 11155111n,
      operation: 'addLocks',
      shortFingerprint: '0x9f2c1e4b7a21',
      transactions: [baseTx],
    });
    expect(batch.chainId).toBe('11155111');
    expect(typeof batch.chainId).toBe('string');
  });

  it('createdAt is 0', () => {
    const batch = buildSafeBatchFile({
      chainId: 11155111n,
      operation: 'addLocks',
      shortFingerprint: '0x9f2c1e4b7a21',
      transactions: [baseTx],
    });
    expect(batch.createdAt).toBe(0);
  });

  it('meta.name format for addLocks', () => {
    const batch = buildSafeBatchFile({
      chainId: 11155111n,
      operation: 'addLocks',
      shortFingerprint: '0x9f2c1e4b7a21',
      transactions: [baseTx],
    });
    expect(batch.meta.name).toBe('OMA3 lock-add-locks 9f2c1e4b7a21');
  });

  it('meta.name for updateLocks', () => {
    const batch = buildSafeBatchFile({
      chainId: 11155111n,
      operation: 'updateLocks',
      shortFingerprint: '0x9f2c1e4b7a21',
      transactions: [baseTx],
    });
    expect(batch.meta.name).toMatch(/^OMA3 lock-update-locks/);
  });

  it('txBuilderVersion is "1.x"', () => {
    const batch = buildSafeBatchFile({
      chainId: 11155111n,
      operation: 'addLocks',
      shortFingerprint: '0x9f2c1e4b7a21',
      transactions: [baseTx],
    });
    expect(batch.meta.txBuilderVersion).toBe('1.x');
  });

  it('createdFromSafeAddress is empty', () => {
    const batch = buildSafeBatchFile({
      chainId: 11155111n,
      operation: 'addLocks',
      shortFingerprint: '0x9f2c1e4b7a21',
      transactions: [baseTx],
    });
    expect(batch.meta.createdFromSafeAddress).toBe('');
  });

  it('createdFromOwnerAddress is empty', () => {
    const batch = buildSafeBatchFile({
      chainId: 11155111n,
      operation: 'addLocks',
      shortFingerprint: '0x9f2c1e4b7a21',
      transactions: [baseTx],
    });
    expect(batch.meta.createdFromOwnerAddress).toBe('');
  });

  it('transaction to is lock contract address', () => {
    expect(baseTx.to.toLowerCase()).toBe(LOCK_CONTRACT.toLowerCase());
  });

  it('transaction value is "0"', () => {
    expect(baseTx.value).toBe('0');
  });
});

describe('buildSlashTransaction', () => {
  const payload = {
    lockContract: LOCK_CONTRACT,
    wallet: WALLET_1,
    to: DESTINATION,
  };

  it('correct function selector', () => {
    const tx = buildSlashTransaction(payload);
    const expected = SLASH_INTERFACE.getFunction('slash')!.selector;
    expect(tx.data.startsWith(expected)).toBe(true);
  });

  it('wallet and to in calldata', () => {
    const tx = buildSlashTransaction(payload);
    const decoded = SLASH_INTERFACE.decodeFunctionData('slash', tx.data);
    expect((decoded[0] as string).toLowerCase()).toBe(WALLET_1.toLowerCase());
    expect((decoded[1] as string).toLowerCase()).toBe(DESTINATION.toLowerCase());
  });

  it('contractInputsValues contains wallet_ and to_', () => {
    const tx = buildSlashTransaction(payload);
    expect(tx.contractInputsValues.wallet_!.toLowerCase()).toBe(WALLET_1.toLowerCase());
    expect(tx.contractInputsValues.to_!.toLowerCase()).toBe(DESTINATION.toLowerCase());
  });

  it('contractMethod.inputs match slash schema', () => {
    const tx = buildSlashTransaction(payload);
    expect(tx.contractMethod.name).toBe('slash');
    expect(tx.contractMethod.payable).toBe(false);
    expect(tx.contractMethod.inputs).toEqual([
      { internalType: 'address', name: 'wallet_', type: 'address' },
      { internalType: 'address', name: 'to_', type: 'address' },
    ]);
  });

  it('to is lock contract address', () => {
    const tx = buildSlashTransaction(payload);
    expect(tx.to.toLowerCase()).toBe(LOCK_CONTRACT.toLowerCase());
  });

  it('value is "0"', () => {
    const tx = buildSlashTransaction(payload);
    expect(tx.value).toBe('0');
  });
});

describe('buildSlashStakeTransaction', () => {
  const payload = {
    lockContract: LOCK_CONTRACT,
    wallet: WALLET_1,
    amountWei: 5000000000000000000n,
    to: DESTINATION,
  };

  it('correct function selector', () => {
    const tx = buildSlashStakeTransaction(payload);
    const expected = SLASH_STAKE_INTERFACE.getFunction('slashStake')!.selector;
    expect(tx.data.startsWith(expected)).toBe(true);
  });

  it('wallet, amount, and to in calldata', () => {
    const tx = buildSlashStakeTransaction(payload);
    const decoded = SLASH_STAKE_INTERFACE.decodeFunctionData('slashStake', tx.data);
    expect((decoded[0] as string).toLowerCase()).toBe(WALLET_1.toLowerCase());
    expect(decoded[1]).toBe(5000000000000000000n);
    expect((decoded[2] as string).toLowerCase()).toBe(DESTINATION.toLowerCase());
  });

  it('contractInputsValues contains wallet_, amount_, to_', () => {
    const tx = buildSlashStakeTransaction(payload);
    expect(tx.contractInputsValues.wallet_!.toLowerCase()).toBe(WALLET_1.toLowerCase());
    expect(tx.contractInputsValues.amount_).toBe('5000000000000000000');
    expect(tx.contractInputsValues.to_!.toLowerCase()).toBe(DESTINATION.toLowerCase());
  });

  it('contractMethod.inputs match slashStake schema', () => {
    const tx = buildSlashStakeTransaction(payload);
    expect(tx.contractMethod.name).toBe('slashStake');
    expect(tx.contractMethod.payable).toBe(false);
    expect(tx.contractMethod.inputs).toEqual([
      { internalType: 'address', name: 'wallet_', type: 'address' },
      { internalType: 'uint96', name: 'amount_', type: 'uint96' },
      { internalType: 'address', name: 'to_', type: 'address' },
    ]);
  });

  it('to is lock contract address', () => {
    const tx = buildSlashStakeTransaction(payload);
    expect(tx.to.toLowerCase()).toBe(LOCK_CONTRACT.toLowerCase());
  });

  it('value is "0"', () => {
    const tx = buildSlashStakeTransaction(payload);
    expect(tx.value).toBe('0');
  });
});

describe('buildSafeBatchFile - slash operations', () => {
  const slashTx = buildSlashTransaction({
    lockContract: LOCK_CONTRACT,
    wallet: WALLET_1,
    to: DESTINATION,
  });

  it('meta.name for slash', () => {
    const batch = buildSafeBatchFile({
      chainId: 11155111n,
      operation: 'slash',
      shortFingerprint: '0x9f2c1e4b7a21',
      transactions: [slashTx],
    });
    expect(batch.meta.name).toBe('OMA3 lock-slash 9f2c1e4b7a21');
  });

  it('meta.name for slashStake', () => {
    const batch = buildSafeBatchFile({
      chainId: 11155111n,
      operation: 'slashStake',
      shortFingerprint: '0x9f2c1e4b7a21',
      transactions: [slashTx],
    });
    expect(batch.meta.name).toBe('OMA3 lock-slash-stake 9f2c1e4b7a21');
  });
});
