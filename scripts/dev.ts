import { join } from 'node:path';

// Starts the extension dev server and the Rust server, which connects to the MongoDB
// named by MONGODB_URI in apps/server/.env. Ctrl-C, or either process exiting, stops both.
const root = join(import.meta.dir, '..');

const processes = [
  Bun.spawn(['bun', 'run', 'dev'], {
    cwd: join(root, 'apps/extension'),
    stdio: ['ignore', 'inherit', 'inherit'],
  }),
  Bun.spawn(['cargo', 'watch', '-x', 'run'], {
    cwd: join(root, 'apps/server'),
    stdio: ['ignore', 'inherit', 'inherit'],
  }),
];

const stop = () => {
  for (const child of processes) {
    child.kill();
  }
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const exitCode = await Promise.race(processes.map((child) => child.exited));
stop();
await Promise.all(processes.map((child) => child.exited));
process.exit(exitCode);
