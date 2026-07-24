/**
 * Windows Git Bash often starts Node with a lowercase drive letter (d:\...).
 * Vitest keys suites by absolute path and then fails describe/it with
 * "Cannot read properties of undefined (reading 'config')" when that casing
 * disagrees with other resolved paths. Spawn Vitest with a consistent
 * uppercase drive letter on both cwd and the CLI path.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function withUppercaseDrive(p) {
  return process.platform === 'win32'
    ? p.replace(/^([a-zA-Z]):/, (_, d) => `${d.toUpperCase()}:`)
    : p;
}

const root = withUppercaseDrive(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const vitestCli = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const cwd = withUppercaseDrive(process.cwd());

const result = spawnSync(process.execPath, [vitestCli, ...process.argv.slice(2)], {
  cwd,
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status ?? 1);
