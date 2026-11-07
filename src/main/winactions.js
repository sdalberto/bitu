'use strict';
/**
 * Ações no Windows: mouse, teclado, mídia, janela ativa.
 * Tudo via user32.dll chamado pelo PowerShell (sem dependências nativas para compilar).
 */
const { clipboard } = require('electron');
const { PSHost, IS_WIN } = require('./pshost');

const ps = new PSHost('actions');

const PRELUDE = `
if (-not ('BituInput' -as [type])) {
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class BituInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, int d, UIntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint f, UIntPtr e);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[BituInput]::SetProcessDPIAware() | Out-Null
}
`;

let preludeReady = null;
function ensurePrelude() {
  if (!IS_WIN) return Promise.reject(new Error('Disponível apenas no Windows'));
  if (!preludeReady) preludeReady = ps.run(PRELUDE, 30000).catch(e => { preludeReady = null; throw e; });
  return preludeReady;
}

async function run(script, timeout) {
  await ensurePrelude();
  return ps.run(script, timeout);
}

const VK = {
  ctrl: 0x11, control: 0x11, shift: 0x10, alt: 0x12, win: 0x5B, windows: 0x5B,
  enter: 0x0D, return: 0x0D, tab: 0x09, esc: 0x1B, escape: 0x1B, backspace: 0x08,
  delete: 0x2E, del: 0x2E, space: 0x20, espaco: 0x20, up: 0x26, down: 0x28, left: 0x25, right: 0x27,
  cima: 0x26, baixo: 0x28, esquerda: 0x25, direita: 0x27,
  home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22, insert: 0x2D, printscreen: 0x2C,
  playpause: 0xB3, next: 0xB0, prev: 0xB1, stop: 0xB2, mute: 0xAD, volumedown: 0xAE, volumeup: 0xAF
};
for (let i = 1; i <= 12; i++) VK['f' + i] = 0x6F + i;
for (let c = 65; c <= 90; c++) VK[String.fromCharCode(c + 32)] = c;
for (let n = 0; n <= 9; n++) VK[String(n)] = 0x30 + n;
const EXTENDED = new Set([0x25, 0x26, 0x27, 0x28, 0x2D, 0x2E, 0x24, 0x23, 0x21, 0x22]);

function comboToScript(combo) {
  const parts = String(combo).toLowerCase().replace(/\s+/g, '').split('+').filter(Boolean);
  const codes = parts.map(p => {
    const code = VK[p];
    if (code === undefined) throw new Error(`Tecla desconhecida: ${p}`);
    return code;
  });
  const down = codes.map(c => `[BituInput]::keybd_event(${c},0,${EXTENDED.has(c) ? 1 : 0},[UIntPtr]::Zero)`);
  const up = codes.slice().reverse().map(c => `[BituInput]::keybd_event(${c},0,${(EXTENDED.has(c) ? 1 : 0) | 2},[UIntPtr]::Zero)`);
  return [...down, 'Start-Sleep -Milliseconds 40', ...up].join('; ');
}

async function pressKeys(combo) {
  await run(comboToScript(combo));
  return `Teclas enviadas: ${combo}`;
}

async function moveMouse(x, y) {
  x = Math.round(Number(x)); y = Math.round(Number(y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Coordenadas inválidas');
  await run(`[BituInput]::SetCursorPos(${x},${y}) | Out-Null`);
  return `Mouse em ${x},${y}`;
}

async function click(button = 'esquerdo', double = false) {
  const map = { esquerdo: [0x02, 0x04], left: [0x02, 0x04], direito: [0x08, 0x10], right: [0x08, 0x10], meio: [0x20, 0x40], middle: [0x20, 0x40] };
  const [d, u] = map[button] || map.esquerdo;
  const one = `[BituInput]::mouse_event(${d},0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 30; [BituInput]::mouse_event(${u},0,0,0,[UIntPtr]::Zero)`;
  await run(double ? `${one}; Start-Sleep -Milliseconds 80; ${one}` : one);
  return double ? 'Clique duplo feito' : 'Clique feito';
}

async function scroll(amount) {
  const delta = Math.round(Number(amount) || 0) * 120;
  await run(`[BituInput]::mouse_event(0x0800,0,0,${delta},[UIntPtr]::Zero)`);
  return `Rolei ${amount}`;
}

/** Digita colando pela área de transferência (aceita acentos e emoji) e devolve o conteúdo anterior. */
async function typeText(text) {
  const previous = await clipboard.readText();
  await clipboard.writeText(String(text));
  await run(comboToScript('ctrl+v'));
  setTimeout(() => { clipboard.writeText(previous || ''); }, 600);
  return `Digitei ${String(text).length} caracteres`;
}

async function media(action) {
  const map = {
    play_pause: 'playpause', tocar: 'playpause', pausar: 'playpause',
    proxima: 'next', next: 'next', anterior: 'prev', previous: 'prev',
    volume_mais: 'volumeup', volume_menos: 'volumedown', mudo: 'mute', mute: 'mute', parar: 'stop'
  };
  const key = map[action];
  if (!key) throw new Error('Ação de mídia desconhecida');
  const times = key.startsWith('volume') ? 5 : 1;
  for (let i = 0; i < times; i++) await run(comboToScript(key));
  return `Mídia: ${action}`;
}

async function activeWindow() {
  const out = await run(`
$h = [BituInput]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 512
[BituInput]::GetWindowText($h, $sb, 512) | Out-Null
$procId = 0
[BituInput]::GetWindowThreadProcessId($h, [ref]$procId) | Out-Null
$p = Get-Process -Id $procId -ErrorAction SilentlyContinue
@{ title = $sb.ToString(); app = $p.ProcessName } | ConvertTo-Json -Compress`);
  try { return JSON.parse(out); } catch { return { title: '', app: '' }; }
}

/** Comando de terminal (só roda depois de confirmação explícita do usuário). */
async function runCommand(command, timeout = 60000) {
  if (!IS_WIN) throw new Error('Disponível apenas no Windows');
  const { spawn } = require('child_process');
  return new Promise((resolve) => {
    const p = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true });
    let out = '';
    const add = d => { out += d.toString('utf8'); if (out.length > 20000) out = out.slice(-20000); };
    p.stdout.on('data', add); p.stderr.on('data', add);
    const t = setTimeout(() => { try { p.kill(); } catch { /* ignore */ } out += '\n[tempo esgotado]'; }, timeout);
    p.on('close', code => { clearTimeout(t); resolve(`código de saída ${code}\n${out.trim().slice(-6000)}`); });
  });
}

function dispose() { ps.dispose(); }

module.exports = { pressKeys, moveMouse, click, scroll, typeText, media, activeWindow, runCommand, dispose, IS_WIN };
