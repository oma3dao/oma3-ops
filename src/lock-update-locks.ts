#!/usr/bin/env node
import { runLockCommand } from './run-lock-command.js';

async function main(): Promise<void> {
  try {
    await runLockCommand('updateLocks', process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  }
}

void main();
