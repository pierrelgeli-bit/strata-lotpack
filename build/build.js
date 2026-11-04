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

// Official lotpack, cleaned by tools/make-template.py, used as the PDF background
const templatePath = path.join(src, 'assets', 'lotpack-template.pdf');
const templateB64 = fs.readFileSync(templatePath).toString('base64');

html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, rel) => {
  used.push(rel);
  let js = read(rel);
  if (js.includes("'__TEMPLATE_PDF_BASE64__'")) {
    js = js.replace("'__TEMPLATE_PDF_BASE64__'", `'${templateB64}'`);
    used.push('assets/lotpack-template.pdf (embedded)');
  }
  // Keep third-party licences next to their code
  const lic = rel.replace(/\.min\.js$|\.js$/, '.LICENSE.md');
  const header = rel.startsWith('vendor/') && fs.existsSync(path.join(src, lic))
    ? `/*!\n${read(lic).replace(/\*\//g, '* /')}\n*/\n` : '';
  return `<script>/* ${rel} */\n${header}${js.replace(/<\/script/gi, '<\\/script')}</script>`;
});

if (/<(script|link)[^>]+(src|href)="(?!#)/.test(html)) {
  throw new Error('An external script or stylesheet was left in the output.');
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`Built ${path.relative(root, out)} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB) from ${used.length} files:`);
used.forEach((u) => console.log(`  - src/${u}`));
