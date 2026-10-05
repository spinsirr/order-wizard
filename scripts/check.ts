import { join } from 'node:path';
import { $ } from 'bun';

// Every local and CI validation step, in order. CI adds builds and the Mongo regression.
const root = join(import.meta.dir, '..');
const extension = join(root, 'apps/extension');

const steps: [name: string, run: () => Promise<unknown>][] = [
  ['Version consistency', () => $`bun scripts/set-version.ts --check`.cwd(root)],
  ['Extension typecheck', () => $`bun run typecheck`.cwd(extension)],
  ['Extension lint', () => $`bun run lint`.cwd(extension)],
  ['Extension design conventions', () => $`bun run check:design`.cwd(extension)],
  ['Extension tests', () => $`bun run test`.cwd(extension)],
  ['Rust format', () => $`cargo fmt --all --check`.cwd(root)],
  ['Rust lint', () => $`cargo clippy --workspace --all-targets --locked -- -D warnings`.cwd(root)],
  ['Rust tests', () => $`cargo test --workspace --locked`.cwd(root)],
];

for (const [name, run] of steps) {
  console.info(`\n▶ ${name}`);
  try {
    await run();
  } catch (error) {
    if (!(error instanceof $.ShellError)) {
      throw error;
    }
    console.error(`\n✖ ${name} failed`);
    process.exit(error.exitCode);
  }
}
console.info('\n✔ All checks passed');
