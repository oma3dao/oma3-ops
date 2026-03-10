import { describe, it, expect } from 'vitest';
import { renderSummary, type SummaryParams } from '../../src/summary-builder.js';

const LOCK_CONTRACT = '0x2f38D6cCB480d5C7e68d11b5a02f2c2451543F58';
const OMA_TOKEN = '0xd7ee0eADb283eFB6d6e628De5E31A284183f4EDf';
const WALLET_1 = '0x0000000000000000000000000000000000000001';
const WALLET_2 = '0x0000000000000000000000000000000000000002';

function makeParams(overrides?: Partial<SummaryParams>): SummaryParams {
  return {
    transactionId: 'addLocks-9f2c1e4b7a21',
    operation: 'addLocks',
    networkName: 'sepolia',
    chainId: 11155111n,
    anchorDateUtc: '2025-01-31T00:00:00Z',
    lockContract: LOCK_CONTRACT,
    omaToken: OMA_TOKEN,
    inputCsv: '/tmp/input.csv',
    rowsParsed: 2,
    transactions: [
      {
        method: 'addLocks',
        cliffUnix: 1753920000,
        lockEndUnix: 1769472000,
        wallets: 2,
        totalWei: 3000000000000000000n,
        firstWallet: WALLET_1,
        lastWallet: WALLET_2,
        calldataHash: '0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432',
      },
    ],
    maxWalletsPerTx: 200,
    totalWallets: 2,
    totalWei: 3000000000000000000n,
    decimals: 18,
    jsonSha256: 'abc123',
    batchFingerprint: '0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432',
    amountWeiCheck: 'N/A',
    ...overrides,
  };
}

describe('renderSummary', () => {
  it('starts with OMA3 OPS TRANSACTION SUMMARY', () => {
    const result = renderSummary(makeParams());
    const firstLine = result.split('\n')[0];
    expect(firstLine).toBe('OMA3 OPS TRANSACTION SUMMARY');
  });

  it('all required header fields present in order', () => {
    const result = renderSummary(makeParams());
    const lines = result.split('\n');

    const requiredFieldsInOrder = [
      'Transaction ID:',
      'Operation:',
      'Network Name:',
      'Chain ID:',
      'Anchor Date UTC:',
      'OMALock Contract:',
      'OMA Token Contract:',
      'Input CSV:',
      'Rows Parsed:',
      'Validation:',
      'Transactions:',
      'Max Wallets Per Tx:',
      'Total Wallets:',
      'Total OMA (human):',
      'Total OMA (wei):',
      'JSON SHA256:',
      'Batch Fingerprint:',
    ];

    let lastIndex = -1;
    for (const field of requiredFieldsInOrder) {
      const index = lines.findIndex((line, i) => i > lastIndex && line.startsWith(field));
      expect(index).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });

  it('Validation: PASS always present', () => {
    const result = renderSummary(makeParams());
    expect(result).toContain('Validation: PASS');
  });

  it('TRANSACTIONS section present with tx lines', () => {
    const params = makeParams({
      transactions: [
        {
          method: 'addLocks',
          cliffUnix: 1753920000,
          lockEndUnix: 1769472000,
          wallets: 1,
          totalWei: 1000n,
          firstWallet: WALLET_1,
          lastWallet: WALLET_1,
          calldataHash: '0x56570de287d73cd1cb6092bb8fdee6173974955fdef345ae579ee9f475ea7432',
        },
        {
          method: 'addLocks',
          cliffUnix: 1753920000,
          lockEndUnix: 1769472000,
          wallets: 1,
          totalWei: 2000n,
          firstWallet: WALLET_2,
          lastWallet: WALLET_2,
          calldataHash: '0x800d501693feda2226878e1ec7869eef8919dbc5bd10c2bcd031b94d73492860',
        },
      ],
    });

    const result = renderSummary(params);
    expect(result).toContain('TRANSACTIONS');
    expect(result).toContain('- tx 1:');
    expect(result).toContain('- tx 2:');
  });

  it('transaction line includes all required fields', () => {
    const result = renderSummary(makeParams());
    const txLine = result.split('\n').find((line) => line.startsWith('- tx 1:'))!;

    expect(txLine).toContain('method=');
    expect(txLine).toContain('cliffUnix=');
    expect(txLine).toContain('cliffUtc=');
    expect(txLine).toContain('lockEndUnix=');
    expect(txLine).toContain('lockEndUtc=');
    expect(txLine).toContain('wallets=');
    expect(txLine).toContain('totalWei=');
    expect(txLine).toContain('firstWallet=');
    expect(txLine).toContain('lastWallet=');
    expect(txLine).toContain('calldataHash=');
  });

  it('VALIDATION section present', () => {
    const result = renderSummary(makeParams());
    expect(result).toContain('VALIDATION');
    expect(result).toContain('amountWei cross-check:');
    expect(result).toContain('duplicate addresses:');
    expect(result).toContain('offset resolution:');
    expect(result).toContain('timestamp format:');
  });

  it('VALIDATION section lines appear in spec order', () => {
    const result = renderSummary(makeParams());
    const lines = result.split('\n');
    const validationStart = lines.findIndex((l) => l === 'VALIDATION');
    expect(validationStart).toBeGreaterThanOrEqual(0);

    // Only check lines between VALIDATION and WARNINGS sections
    const warningsStart = lines.findIndex((l, i) => i > validationStart && l === 'WARNINGS');
    const sectionEnd = warningsStart > 0 ? warningsStart : lines.length;
    const validationLines = lines.slice(validationStart + 1, sectionEnd).filter((l) => l.startsWith('- '));
    const expectedOrder = [
      'amountWei cross-check:',
      'duplicate addresses:',
      'offset resolution:',
      'timestamp format:',
    ];
    expect(validationLines.length).toBe(expectedOrder.length);
    expectedOrder.forEach((prefix, i) => {
      expect(validationLines[i]).toContain(prefix);
    });
  });

  it('amountWei cross-check: N/A when no amountWei column', () => {
    const result = renderSummary(makeParams({ amountWeiCheck: 'N/A' }));
    expect(result).toContain('- amountWei cross-check: N/A');
  });

  it('amountWei cross-check: pass when amountWei present', () => {
    const result = renderSummary(makeParams({ amountWeiCheck: 'pass' }));
    expect(result).toContain('- amountWei cross-check: pass');
  });

  it('Batch Fingerprint includes short form', () => {
    const result = renderSummary(makeParams());
    const fpLine = result.split('\n').find((line) => line.startsWith('Batch Fingerprint:'))!;
    expect(fpLine).toMatch(/Batch Fingerprint: 0x[0-9a-f]+ \(short 0x[0-9a-f]{12}\)/);
  });

  it('Total OMA (human) uses correct decimals', () => {
    const result = renderSummary(
      makeParams({
        totalWei: 1000000000000000000n,
        decimals: 18,
      }),
    );
    expect(result).toContain('Total OMA (human): 1.0');
  });

  it('WARNINGS section present', () => {
    const result = renderSummary(makeParams());
    expect(result).toContain('WARNINGS');
  });

  it('WARNINGS section shows "- None" when no warnings', () => {
    const result = renderSummary(makeParams());
    const lines = result.split('\n');
    const warningsStart = lines.findIndex((l) => l === 'WARNINGS');
    expect(warningsStart).toBeGreaterThanOrEqual(0);
    const warningLines = lines.slice(warningsStart + 1).filter((l) => l.startsWith('- '));
    expect(warningLines).toHaveLength(1);
    expect(warningLines[0]).toBe('- None');
  });

  it('WARNINGS section shows --max-total-pct override', () => {
    const result = renderSummary(makeParams({ maxTotalPct: 25 }));
    expect(result).toContain('WARNING: --max-total-pct set to 25');
    expect(result).toContain('default: 10');
  });

  it('WARNINGS section shows --warn-wallet-pct override', () => {
    const result = renderSummary(makeParams({ warnWalletPct: 5 }));
    expect(result).toContain('WARNING: --warn-wallet-pct set to 5');
    expect(result).toContain('default: 1');
  });

  it('WARNINGS section does not warn when using default thresholds', () => {
    const result = renderSummary(makeParams({ maxTotalPct: 10, warnWalletPct: 1 }));
    const lines = result.split('\n');
    const warningsStart = lines.findIndex((l) => l === 'WARNINGS');
    const warningLines = lines.slice(warningsStart + 1).filter((l) => l.startsWith('- '));
    expect(warningLines).toHaveLength(1);
    expect(warningLines[0]).toBe('- None');
  });

  it('WARNINGS section shows per-wallet warnings', () => {
    const result = renderSummary(makeParams({
      walletWarnings: [
        { address: WALLET_1, amountHuman: '5000000.0', pctOfSupply: '1.50' },
      ],
    }));
    expect(result).toContain(`${WALLET_1}: allocated 5000000.0 OMA (1.50% of total supply)`);
    expect(result).not.toContain('- None');
  });

  it('WARNINGS section shows both threshold overrides and wallet warnings', () => {
    const result = renderSummary(makeParams({
      maxTotalPct: 20,
      warnWalletPct: 0,
      walletWarnings: [
        { address: WALLET_1, amountHuman: '5000000.0', pctOfSupply: '1.50' },
        { address: WALLET_2, amountHuman: '3000000.0', pctOfSupply: '0.90' },
      ],
    }));
    expect(result).toContain('WARNING: --max-total-pct set to 20');
    expect(result).toContain(`${WALLET_1}: allocated 5000000.0 OMA`);
    expect(result).toContain(`${WALLET_2}: allocated 3000000.0 OMA`);
    expect(result).not.toContain('- None');
  });
});
