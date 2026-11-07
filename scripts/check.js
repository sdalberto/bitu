// Checagem rápida antes de gerar o instalador: sintaxe de todos os .js e chaves de tradução.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
let errors = 0;

function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith('.js')) {
      try { execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' }); }
      catch (e) { errors++; console.error('✗', path.relative(root, p), '\n', e.stderr.toString()); }
    }
  }
}
walk(path.join(root, 'src'));

// todas as chaves usadas nas telas precisam existir em pt-BR
const i18n = require('../src/renderer/shared/i18n.js');
const used = new Set();
for (const dir of ['src/renderer', 'src/main']) {
  (function scan(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) scan(p);
      else if (/\.(js|html)$/.test(f.name) && !p.endsWith('i18n.js')) {
        const src = fs.readFileSync(p, 'utf8');
        for (const m of src.matchAll(/(?:\bt|I\.t|I\.pick)\(\s*(?:L\(\)\s*,\s*)?'([a-zA-Z.]+(?:\.[a-zA-Z]+)*)'/g)) used.add(m[1]);
        for (const m of src.matchAll(/data-i18n(?:-ph|-title)?="([^"]+)"/g)) used.add(m[1]);
      }
    }
  })(path.join(root, dir));
}
for (const k of used) {
  if (k.endsWith('.')) continue;
  if (i18n.t('pt-BR', k) === k) { errors++; console.error('✗ tradução faltando:', k); }
}

if (errors) { console.error(`\n${errors} problema(s).`); process.exit(1); }
console.log(`✓ ${used.size} textos e todo o código conferidos.`);
