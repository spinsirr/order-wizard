import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const failures = [];

const requiredFiles = [
  'components.json',
  'DESIGN.md',
  'src/components/ui/alert-dialog.tsx',
  'src/components/ui/alert.tsx',
  'src/components/ui/button.tsx',
  'src/components/ui/card.tsx',
  'src/components/ui/checkbox.tsx',
  'src/components/ui/dropdown-menu.tsx',
  'src/components/ui/input.tsx',
  'src/components/ui/label.tsx',
  'src/components/ui/select.tsx',
  'src/components/ui/skeleton.tsx',
  'src/components/ui/slider.tsx',
  'src/components/ui/textarea.tsx',
  'src/components/ui/toggle-group.tsx',
];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) failures.push(`missing canonical file: ${file}`);
}

const configPath = join(root, 'components.json');
if (existsSync(configPath)) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  if (config.style !== 'new-york') failures.push('components.json must use the shadcn new-york style');
  if (config.aliases?.ui !== '@/components/ui') {
    failures.push('components.json must install UI primitives into @/components/ui');
  }
}

const stylesheetPath = join(root, 'src/entrypoints/sidepanel/index.css');
if (existsSync(stylesheetPath)) {
  const stylesheet = readFileSync(stylesheetPath, 'utf8');
  for (const requiredImport of ['@import "tailwindcss";', '@import "tw-animate-css";']) {
    if (!stylesheet.includes(requiredImport)) {
      failures.push(`sidepanel stylesheet missing ${requiredImport}`);
    }
  }

  const requiredTypeTokens = ['micro', 'caption', 'body', 'title', 'heading'];
  for (const token of requiredTypeTokens) {
    if (!stylesheet.includes(`--text-${token}:`)) {
      failures.push(`sidepanel stylesheet missing --text-${token}`);
    }
    if (!stylesheet.includes(`--text-${token}--line-height:`)) {
      failures.push(`sidepanel stylesheet missing --text-${token}--line-height`);
    }
  }
}

function sourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      if (path === join(root, 'src/components/ui')) continue;
      files.push(...sourceFiles(path));
    } else if (/\.(tsx|jsx)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

const featureRoots = [join(root, 'src/components'), join(root, 'src/options')];
const rawControlPattern = /<(button|input|select|textarea|dialog)\b/g;
const retiredApiPattern = /(variant=["'](?:filled|tonal|text|icon)["']|\belevation=)/g;
const nativeDialogPattern = /\bwindow\.(alert|confirm|prompt)\s*\(/g;
const retiredTypographyPatternSource =
  String.raw`\btext-(?:xs|sm|base|lg|xl|[2-9]xl|\[(?:\d*\.?\d+)(?:px|rem)\])(?![\w-])`;

function findRetiredTypographyClasses(source) {
  return [...source.matchAll(new RegExp(retiredTypographyPatternSource, 'g'))].map((match) => ({
    className: match[0],
    index: match.index ?? 0,
  }));
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split('\n').length;
}

const arbitrarySizeClass = ['text', '[11px]'].join('-');
const legacyAliasClass = ['text', 'sm'].join('-');
const arbitraryColorClass = ['text', '[#fff]'].join('-');
const typographyGuardSamples = [
  { source: `<p className="${arbitrarySizeClass}" />`, expected: arbitrarySizeClass },
  { source: `<p className="${legacyAliasClass}" />`, expected: legacyAliasClass },
];

for (const sample of typographyGuardSamples) {
  const detected = findRetiredTypographyClasses(sample.source).some(
    ({ className }) => className === sample.expected,
  );
  if (!detected) failures.push(`typography guard self-test missed ${sample.expected}`);
}

if (findRetiredTypographyClasses(`<p className="${arbitraryColorClass}" />`).length > 0) {
  failures.push('typography guard self-test misclassified an arbitrary color');
}

for (const featureRoot of featureRoots) {
  for (const file of sourceFiles(featureRoot)) {
    const source = readFileSync(file, 'utf8');
    const displayPath = relative(root, file);
    for (const match of source.matchAll(rawControlPattern)) {
      failures.push(`${displayPath} renders raw <${match[1]}> instead of components/ui`);
    }
    for (const match of source.matchAll(nativeDialogPattern)) {
      failures.push(`${displayPath} uses window.${match[1]} instead of a components/ui dialog`);
    }
    if (retiredApiPattern.test(source)) failures.push(`${displayPath} uses the retired primitive API`);
  }
}

const typographyRoots = [
  ...featureRoots,
  join(root, 'src/components/ui'),
  join(root, 'src/entrypoints'),
];

for (const typographyRoot of typographyRoots) {
  for (const file of sourceFiles(typographyRoot)) {
    const source = readFileSync(file, 'utf8');
    const displayPath = relative(root, file);
    for (const match of findRetiredTypographyClasses(source)) {
      failures.push(
        `${displayPath}:${lineNumberAt(source, match.index)} uses ${match.className}; use text-micro, text-caption, text-body, text-title, or text-heading`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error('Design-system guard failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Design-system guard passed.');
