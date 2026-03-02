import { readFileSync } from 'node:fs';

export interface CsvRow {
  readonly lineNumber: number;
  readonly values: Record<string, string>;
}

export interface ParsedCsv {
  readonly headers: string[];
  readonly rows: CsvRow[];
}

function parseCsvMatrix(input: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  const flushCell = (): void => {
    currentRow.push(currentCell);
    currentCell = '';
  };

  const flushRow = (): void => {
    flushCell();
    rows.push(currentRow);
    currentRow = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        const next = input[i + 1];
        if (next === '"') {
          currentCell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      flushCell();
      continue;
    }

    if (char === '\n') {
      flushRow();
      continue;
    }

    if (char === '\r') {
      const next = input[i + 1];
      if (next === '\n') {
        continue;
      }
      flushRow();
      continue;
    }

    currentCell += char;
  }

  if (inQuotes) {
    throw new Error('Invalid CSV: unmatched quote in input.');
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    flushRow();
  }

  return rows;
}

export function parseCsvFile(path: string): ParsedCsv {
  const raw = readFileSync(path, 'utf8');
  const matrix = parseCsvMatrix(raw);
  if (matrix.length === 0) {
    throw new Error('CSV is empty.');
  }

  const rawHeaders = matrix[0] ?? [];
  const headers = rawHeaders.map((header, index) => {
    const trimmed = header.trim();
    if (index === 0) {
      return trimmed.replace(/^\uFEFF/, '');
    }
    return trimmed;
  });

  const rows: CsvRow[] = [];

  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
    const source = matrix[rowIndex] ?? [];

    const valuesByHeader: Record<string, string> = {};
    let hasNonEmptyValue = false;

    for (let colIndex = 0; colIndex < headers.length; colIndex += 1) {
      const header = headers[colIndex] ?? '';
      const value = (source[colIndex] ?? '').trim();
      valuesByHeader[header] = value;
      if (value !== '') {
        hasNonEmptyValue = true;
      }
    }

    if (!hasNonEmptyValue) {
      continue;
    }

    rows.push({
      lineNumber: rowIndex + 1,
      values: valuesByHeader,
    });
  }

  return { headers, rows };
}

export function requireHeaders(headers: string[], required: string[]): void {
  const present = new Set(headers);
  const missing = required.filter((header) => !present.has(header));
  if (missing.length > 0) {
    throw new Error(`Missing required CSV header(s): ${missing.join(', ')}`);
  }
}
