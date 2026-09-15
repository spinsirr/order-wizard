import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argument = process.argv[2];
const check = argument === '--check' || argument === '--check-staged';
const read = async (path: string): Promise<string> => {
  if (argument !== '--check-staged') {
    return readFile(resolve(repositoryRoot, path), 'utf8');
  }
  const result = Bun.spawnSync(['git', 'show', `:${path}`], {
    cwd: repositoryRoot,
    stderr: 'inherit',
  });
  if (result.exitCode !== 0) {
    throw new Error(`Cannot read staged ${path}`);
  }
  return result.stdout.toString();
};

const packageText = await read('package.json');
const cargoText = await read('Cargo.toml');
const VersionSchema = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
const packageJson = z.object({ version: VersionSchema }).loose().parse(JSON.parse(packageText));
const cargo = z
  .object({ workspace: z.object({ package: z.object({ version: VersionSchema }) }) })
  .parse(Bun.TOML.parse(cargoText));
if (check) {
  const lock = z
    .object({ package: z.array(z.object({ name: z.string(), version: z.string() })) })
    .parse(Bun.TOML.parse(await read('Cargo.lock')));
  const versions = ['server', 'ordercue-cli'].map(
    (name) => lock.package.find((pkg) => pkg.name === name)?.version,
  );
  if (
    cargo.workspace.package.version !== packageJson.version ||
    versions.some((version) => version !== packageJson.version)
  ) {
    throw new Error(
      'Release versions disagree. Run just bump <version>, then stage the intended files.',
    );
  }
  console.info(`Release versions match: ${packageJson.version}`);
} else {
  if (!VersionSchema.safeParse(argument).success) {
    throw new Error(
      'Usage: bun scripts/set-version.ts <major.minor.patch> | --check | --check-staged',
    );
  }
  const pattern = /(\[workspace\.package\][\s\S]*?^version\s*=\s*")[^"]+("\s*$)/m;
  if (!pattern.test(cargoText)) {
    throw new Error('Cargo.toml is missing [workspace.package].version');
  }
  const version = VersionSchema.parse(argument);
  packageJson.version = version;
  await writeFile(
    resolve(repositoryRoot, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  await writeFile(
    resolve(repositoryRoot, 'Cargo.toml'),
    cargoText.replace(pattern, `$1${version}$2`),
  );
  const metadata = Bun.spawnSync(['cargo', 'metadata', '--format-version', '1', '--no-deps'], {
    cwd: repositoryRoot,
    stdout: 'ignore',
    stderr: 'inherit',
  });
  if (metadata.exitCode !== 0) {
    throw new Error('Failed to refresh Cargo.lock');
  }
  console.info(`Bumped OrderCue to ${version}`);
}
