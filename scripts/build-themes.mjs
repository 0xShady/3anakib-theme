#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const THEMES_DIR = path.join(ROOT, 'themes');
export const VARIANTS_DIR = path.join(THEMES_DIR, 'variants');
export const BASE_THEME = '3anakib theme-color-theme.json';

const lower = (map = {}) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));

function recolor(value, ...maps) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) return value;
  const rgb = value.slice(0, 7).toLowerCase();
  const alpha = value.slice(7);
  for (const map of maps) {
    const to = map[rgb];
    if (to) return to.length === 9 ? to : to + alpha;
  }
  return value;
}

function recolorDeep(node, ...maps) {
  if (Array.isArray(node)) return node.map((n) => recolorDeep(n, ...maps));
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, recolorDeep(v, ...maps)]));
  }
  return recolor(node, ...maps);
}

export function buildVariant(specFile) {
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
  const base = JSON.parse(fs.readFileSync(path.join(THEMES_DIR, BASE_THEME), 'utf8'));
  const remap = lower(spec.remap);
  const syntaxRemap = lower(spec.syntaxRemap);

  const theme = {
    $generated: `Built from ${BASE_THEME} + variants/${path.basename(specFile)}. Edit those, not this file.`,
    name: spec.name,
    type: base.type,
    semanticHighlighting: base.semanticHighlighting,
    colors: { ...recolorDeep(base.colors, remap), ...spec.colors },
    semanticTokenColors: {
      ...recolorDeep(base.semanticTokenColors ?? {}, syntaxRemap, remap),
      ...spec.semanticTokenColors
    },
    tokenColors: [...recolorDeep(base.tokenColors, syntaxRemap, remap), ...(spec.tokenColors ?? [])]
  };

  const out = path.join(THEMES_DIR, spec.output);
  fs.writeFileSync(out, JSON.stringify(theme, null, '\t') + '\n');
  return spec.output;
}

export function buildAll() {
  return fs.readdirSync(VARIANTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => buildVariant(path.join(VARIANTS_DIR, f)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const out of buildAll()) console.log('built', out);
}
