#!/usr/bin/env node
import { runSlashCommand } from './run-slash-command.js';

async function main(): Promise<void> {
  try {
    await runSlashCommand('slashStake', process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  }
}

void main();
