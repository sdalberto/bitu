'use strict';
/**
 * Baixar e descompactar arquivos com barra de progresso.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');

const IS_WIN = process.platform === 'win32';

/**
 * Baixa url -> dest (grava em .part e renomeia no final).
 * onProgress({ received, total })
 */
async function download(url, dest, onProgress, signal) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(url, { redirect: 'follow', signal, headers: { 'user-agent': 'Bitu/1.2 (+https://github.com/sdalberto/bitu)' } });
  if (!res.ok || !res.body) throw new Error(`Download falhou (${res.status}) em ${new URL(url).host}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const part = dest + '.part';
  let received = 0;
  let last = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      const now = Date.now();
      if (onProgress && now - last > 200) { last = now; onProgress({ received, total }); }
      cb(null, chunk);
    }
  });
  try {
    await pipeline(Readable.fromWeb(res.body), counter, fs.createWriteStream(part), { signal });
  } catch (e) {
    try { fs.unlinkSync(part); } catch { /* ok */ }
    throw e;
  }
  if (onProgress) onProgress({ received, total: total || received });
  fs.renameSync(part, dest);
  return dest;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true, ...opts });
    let err = '';
    p.stderr && p.stderr.on('data', d => { err += d; });
    p.on('error', reject);
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} saiu com código ${code}: ${err.slice(-400)}`))));
  });
}

/** Descompacta .zip ou .tar.gz em destDir. */
async function extract(archive, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (/\.zip$/i.test(archive)) {
    if (IS_WIN) {
      // tar.exe vem no Windows 10+ e é bem mais rápido que Expand-Archive
      try { return await run('tar.exe', ['-xf', archive, '-C', destDir]); } catch { /* tenta PowerShell */ }
      return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -LiteralPath '${archive.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`]);
    }
    return run('unzip', ['-o', '-q', archive, '-d', destDir]);
  }
  return run(IS_WIN ? 'tar.exe' : 'tar', ['-xzf', archive, '-C', destDir]);
}

/** Procura um arquivo pelo nome dentro de uma pasta (recursivo). */
function findFile(dir, name) {
  if (!fs.existsSync(dir)) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isFile() && e.name.toLowerCase() === name.toLowerCase()) return p;
    if (e.isDirectory()) { const f = findFile(p, name); if (f) return f; }
  }
  return null;
}

module.exports = { download, extract, findFile, run, IS_WIN };
