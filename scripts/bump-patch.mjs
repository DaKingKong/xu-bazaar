/** Bump package.json patch version by 1 (semver). Used by husky pre-commit. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
if (typeof pkg.version !== 'string') {
  console.error('package.json missing version string');
  process.exit(1);
}

const parts = pkg.version.split('.').map((p) => Number(p));
if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
  console.error(`invalid semver in package.json: ${pkg.version}`);
  process.exit(1);
}

const maj = parts[0];
const min = parts[1];
const pat = parts[2];
pkg.version = `${maj}.${min}.${pat + 1}`;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`bumped version to ${pkg.version}`);
