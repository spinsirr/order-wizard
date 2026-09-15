import { fileURLToPath } from 'node:url';
import { createServer } from 'wxt';

const port = 3001;
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  webExt: { disabled: true },
  dev: { server: { host: '127.0.0.1', port } },
  filterEntrypoints: ['demo'],
});
await server.start();
console.info(`Frontend preview: http://127.0.0.1:${port}/src/entrypoints/demo/index.html`);
