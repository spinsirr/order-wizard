import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const config = JSON.parse(readFileSync(resolve(root, 'components.json'), 'utf8'));
if (config.style !== 'new-york' || config.aliases?.ui !== '@/components/ui') {
  failures.push('Use the canonical shadcn registry and components/ui directory.');
}
for (const name of [
  'alert-dialog',
  'alert',
  'button',
  'card',
  'checkbox',
  'dialog',
  'dropdown-menu',
  'input',
  'label',
  'select',
  'skeleton',
  'slider',
  'textarea',
]) {
  if (!existsSync(resolve(root, `src/components/ui/${name}.tsx`))) {
    failures.push(`Missing shared ${name} primitive`);
  }
}
const css = readFileSync(resolve(root, 'src/entrypoints/sidepanel/index.css'), 'utf8');
for (const value of [
  '@import "tailwindcss";',
  '@import "tw-animate-css";',
  ...['micro', 'caption', 'body', 'title', 'heading'].flatMap((token) => [
    `--text-${token}:`,
    `--text-${token}--line-height:`,
  ]),
]) {
  if (!css.includes(value)) {
    failures.push(`Missing design token/import: ${value}`);
  }
}
// Product-specific checks only. Biome owns import parsing and UI dependency boundaries.
const typeSize = /\btext-(?:xs|sm|base|lg|xl|[2-9]xl|\[(?:\d*\.?\d+)(?:px|rem)\])(?![\w-])/g;
const controls =
  /<(button|input|select|textarea|dialog)\b|\bwindow\.(alert|confirm|prompt)\s*\(|variant=["'](?:filled|tonal|text|icon)["']|\belevation=/g;
for (const entry of readdirSync(resolve(root, 'src'), { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !/\.[jt]sx$/.test(entry.name)) {
    continue;
  }
  const file = resolve(entry.parentPath, entry.name);
  const path = relative(root, file).replaceAll('\\', '/');
  if (/\/(__tests__|stories)\//.test(path)) {
    continue;
  }
  const source = readFileSync(file, 'utf8');
  const checks = path.startsWith('src/components/ui/') ? [typeSize] : [typeSize, controls];
  for (const pattern of checks) {
    for (const match of source.matchAll(pattern)) {
      const line = source.slice(0, match.index).split('\n').length;
      failures.push(
        `${path}:${line}: use shared UI and semantic typography instead of ${match[0]}`,
      );
    }
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.info('Design-system guard passed.');
