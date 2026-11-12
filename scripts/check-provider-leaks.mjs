#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const sourceOnly = process.argv.includes('--source-only');
const FORBIDDEN = /flutterwave|\bflw\b|FLWPUBK|FLWSECK|ravepay|paystack|monnify|squad(?:co)?\b|opay|moniepoint/i;
const ALLOWED_SOURCE = [join('src', 'server', 'providers') + sep];
const BINARY = /\.(png|jpe?g|webp|gif|ico|woff2?|ttf|otf|map|mp4|pdf)$/i;

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const info = statSync(path);
    if (info.isDirectory()) yield* walk(path);
    else if (!BINARY.test(name)) yield path;
  }
}

const targets = [
  { dir: 'src', allowed: ALLOWED_SOURCE, label: 'source' },
  ...(sourceOnly
    ? []
    : [
        { dir: join('.next', 'static'), allowed: [], label: 'client bundle' },
        { dir: 'public', allowed: [], label: 'public assets' },
      ]),
];

const hits = [];

for (const { dir, allowed, label } of targets) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file);
    if (allowed.some((prefix) => rel.startsWith(prefix))) continue;
    const match = FORBIDDEN.exec(readFileSync(file, 'utf8'));
    if (match) hits.push(`${label}: ${rel} (found "${match[0]}")`);
  }
}

if (!sourceOnly) {
  for (const file of walk(join(ROOT, '.next', 'server', 'app'))) {
    if (!file.endsWith('.html') && !file.endsWith('.rsc')) continue;
    const match = FORBIDDEN.exec(readFileSync(file, 'utf8'));
    if (match) hits.push(`prerendered output: ${relative(ROOT, file)} (found "${match[0]}")`);
  }
}

if (hits.length) {
  console.error('Provider name leak detected:\n' + hits.map((hit) => `  - ${hit}`).join('\n'));
  console.error('\nProvider names may only appear under src/server/providers/.');
  process.exit(1);
}
console.log(`Provider leak check passed (${sourceOnly ? 'source only' : 'source + build output'}).`);
