/**
 * Interactive secret key prompt
 *
 * Reads the admin secret key from stdin with echo disabled.
 * Matches the behavior of SSH password prompts (nothing displayed while typing).
 *
 * Falls back to ADMIN_THIRDWEB_SECRET_KEY env var for non-interactive contexts.
 */

import { execSync } from 'node:child_process';

export async function promptSecretKey(): Promise<string> {
  // Allow env var override for non-interactive contexts (CI, testing)
  const envKey = process.env.ADMIN_THIRDWEB_SECRET_KEY;
  if (envKey && envKey.trim() !== '') {
    console.log('Using ADMIN_THIRDWEB_SECRET_KEY from environment.');
    return envKey.trim();
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      'No TTY available for interactive prompt. Set ADMIN_THIRDWEB_SECRET_KEY env var instead.',
    );
  }

  // Use stty to disable echo (same mechanism SSH uses), then read a line.
  // This works reliably regardless of how node was launched (npx, npm run, etc).
  process.stderr.write('Enter your Bitwarden admin secret key: ');

  try {
    // stty -echo disables terminal echo; read reads one line; stty echo restores it.
    // The shell handles all TTY manipulation so node's stdin buffering doesn't matter.
    const result = execSync(
      'stty -echo 2>/dev/null; read -r secret; stty echo 2>/dev/null; echo "$secret"',
      { stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' },
    );
    process.stderr.write('\n');

    const trimmed = result.trim();
    if (trimmed === '') {
      throw new Error('No secret key provided.');
    }
    return trimmed;
  } catch (error) {
    // Restore echo in case of Ctrl+C or other interruption
    try { execSync('stty echo 2>/dev/null', { stdio: 'ignore' }); } catch { /* ignore */ }
    process.stderr.write('\n');
    throw error;
  }
}
