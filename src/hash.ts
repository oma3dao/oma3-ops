#!/usr/bin/env node
import { assertNoUnknownOptions, parseCliArgs } from './cli-utils.js';
import { keccakHexBytes } from './hash-utils.js';

function printUsage(): void {
  console.log('Usage:\n  hash <hex-string>');
}

function main(): void {
  try {
    const parsed = parseCliArgs(process.argv.slice(2));
    assertNoUnknownOptions(parsed.options, new Set(['help']));
    if (parsed.options.has('help')) {
      printUsage();
      return;
    }

    if (parsed.positionals.length !== 1) {
      throw new Error('hash requires exactly one positional argument: <hex-string>.');
    }

    const [input] = parsed.positionals;
    if (!input) {
      throw new Error('Missing <hex-string>.');
    }

    const digest = keccakHexBytes(input);
    console.log(digest);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  }
}

main();
