import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!version || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  console.error('Usage: bun scripts/set-version.ts <major.minor.patch>');
  process.exit(2);
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = resolve(repositoryRoot, 'package.json');
const cargoPath = resolve(repositoryRoot, 'Cargo.toml');

const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as Record<string, unknown>;
packageJson.version = version;
await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const cargoToml = await readFile(cargoPath, 'utf8');
const versionPattern = /(\[workspace\.package\][\s\S]*?^version\s*=\s*")[^"]+("\s*$)/m;
if (!versionPattern.test(cargoToml)) {
  throw new Error('Cargo.toml is missing [workspace.package].version');
}
await writeFile(cargoPath, cargoToml.replace(versionPattern, `$1${version}$2`));

const lockUpdate = Bun.spawnSync(
  ['cargo', 'update', '--workspace'],
  { cwd: repositoryRoot, stdout: 'ignore', stderr: 'inherit' },
);
if (lockUpdate.exitCode !== 0) {
  throw new Error('Failed to refresh Cargo.lock');
}

console.log(`Bumped Order Wizard to ${version}`);
