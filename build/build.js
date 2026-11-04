#!/usr/bin/env node
/* Assemble src/ into a single self-contained HTML file: dist/strata-lotpack.html
   Every <link rel="stylesheet" href="..."> and <script src="..."> in src/index.html
   is replaced by the file's content, inline. */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');
const out = path.join(root, 'dist', 'strata-lotpack.html');

const read = (rel) => {
  const file = path.join(src, rel);
  if (!fs.existsSync(file)) throw new Error(`Missing source file: src/${rel}`);
  return fs.readFileSync(file, 'utf8');
};

let html = read('index.html');
const used = [];

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, rel) => {
  used.push(rel);
  return `<style>/* ${rel} */\n${read(rel).replace(/<\/style/gi, '<\\/style')}</style>`;
});

html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, rel) => {
  used.push(rel);
  return `<script>/* ${rel} */\n${read(rel).replace(/<\/script/gi, '<\\/script')}</script>`;
});

if (/<(script|link)[^>]+(src|href)="(?!#)/.test(html)) {
  throw new Error('An external script or stylesheet was left in the output.');
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`Built ${path.relative(root, out)} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB) from ${used.length} files:`);
used.forEach((u) => console.log(`  - src/${u}`));
