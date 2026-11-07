'use strict';
/**
 * Instala e configura a IA local sozinho:
 *   1. Ollama (via winget ou instalador oficial)  -> roda os modelos no PC
 *   2. Baixa o modelo escolhido (com barra de progresso)
 *   3. (opcional) OpenClaw: instalador oficial, configuração com Ollama, liga a API de chat
 * Só funciona no Windows. Cada passo mostra o que está fazendo no log.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { download, IS_WIN } = require('./download');
const local = require('./local');

const OLLAMA = 'http://127.0.0.1:11434';
const OLLAMA_SETUP = 'https://ollama.com/download/OllamaSetup.exe';
const OPENCLAW_PS1 = 'https://openclaw.ai/install.ps1';

// BITU_INSTALLER_DEMO=1 simula a instalação (para testar a tela fora do Windows)
const DEMO = process.env.BITU_INSTALLER_DEMO === '1';

const MODELS = [
  { id: 'gemma4', label: 'gemma4 (recomendado)' },
  { id: 'qwen3.5:9b', label: 'qwen3.5:9b (mais forte, pede mais memória)' }
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// recarrega o PATH do usuário/sistema (programas recém-instalados aparecem sem reiniciar o Bitu)
const PS_PATH = "$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') + ';' + \"$env:USERPROFILE\\.openclaw\\bin;$env:APPDATA\\npm;$env:LOCALAPPDATA\\Programs\\Ollama\"; ";

/** Roda um comando PowerShell mostrando cada linha no log. */
function ps(command, onLine, timeoutMs = 20 * 60000, signal) {
  return new Promise((resolve) => {
    if (!IS_WIN) return resolve({ code: -1, out: 'Disponível só no Windows' });
    const p = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8; $ProgressPreference="SilentlyContinue"; ' + PS_PATH + command], { windowsHide: true });
    let out = '';
    let buf = '';
    const feed = (d) => {
      const s = d.toString('utf8');
      out += s; if (out.length > 40000) out = out.slice(-40000);
      buf += s;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const l of lines) if (l.trim()) onLine && onLine(l.replace(/\x1b\[[0-9;]*m/g, '').slice(0, 300));
    };
    p.stdout.on('data', feed);
    p.stderr.on('data', feed);
    const kill = () => { try { p.kill(); } catch { /* ok */ } };
    const timer = setTimeout(() => { onLine && onLine('[tempo esgotado]'); kill(); }, timeoutMs);
    if (signal) signal.addEventListener('abort', kill, { once: true });
    p.on('close', (code) => { clearTimeout(timer); if (buf.trim()) onLine && onLine(buf.trim()); resolve({ code, out }); });
    p.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, out: e.message }); });
  });
}

async function ollamaUp() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    return r.ok ? (await r.json()).models || [] : null;
  } catch { return null; }
}

function ollamaExe() {
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Ollama', 'ollama.exe')
  ];
  return candidates.find(c => c && fs.existsSync(c)) || null;
}

function openclawConfigured() {
  return fs.existsSync(local.openclawConfigPath());
}

/** Baixa um modelo no Ollama com progresso. */
async function pullModel(model, report, signal) {
  const res = await fetch(`${OLLAMA}/api/pull`, {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, stream: true })
  });
  if (!res.ok || !res.body) throw new Error(`Não consegui baixar o modelo (${res.status}). Confira o nome: ${model}`);
  let buf = '';
  let lastStatus = '';
  const dec = new TextDecoder();
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      if (ev.error) throw new Error(`Ollama: ${ev.error}`);
      const pct = ev.total ? Math.round((ev.completed || 0) / ev.total * 100) : null;
      const gb = (n) => (n / 1073741824).toFixed(2);
      report('model', pct, ev.total ? `${gb(ev.completed || 0)} de ${gb(ev.total)} GB` : ev.status, ev.status !== lastStatus ? ev.status : null);
      lastStatus = ev.status;
      if (ev.status === 'success') return true;
    }
  }
  return true;
}

class Installer {
  constructor({ onProgress, connect }) {
    this.onProgress = onProgress; // ({ step, pct, text, log, done, error })
    this.connect = connect;       // async (cfg) => { ok }
    this.running = false;
    this.abort = null;
  }

  info() {
    return {
      supported: IS_WIN || DEMO,
      ramGB: Math.round(os.totalmem() / 1073741824),
      models: MODELS,
      running: this.running,
      openclawConfigured: openclawConfigured()
    };
  }

  cancel() { if (this.abort) this.abort.abort(); }

  async _demo(withOpenClaw) {
    this.running = true;
    const p = (o) => this.onProgress(o);
    p({ step: 'ollama', pct: null, text: 'Instalando o Ollama…', log: 'winget install --id Ollama.Ollama' });
    await sleep(800);
    p({ step: 'ollama', pct: 100, text: 'Ollama pronto', log: 'Ollama respondendo em 127.0.0.1:11434' });
    for (let i = 0; i <= 100; i += 20) { p({ step: 'model', pct: i, text: `${(4.9 * i / 100).toFixed(2)} de 4.90 GB`, log: i ? null : 'pulling manifest' }); await sleep(250); }
    if (withOpenClaw) { p({ step: 'openclaw', pct: null, text: 'Configurando o OpenClaw com o Ollama…', log: 'openclaw onboard --non-interactive --auth-choice ollama' }); await sleep(1500); }
    this.running = false;
    p({ step: 'error', error: 'Modo demonstração: nada foi instalado.', done: true });
    return { ok: false, error: 'demo' };
  }

  async run({ withOpenClaw = false, model = 'gemma4' } = {}) {
    if (this.running) throw new Error('A instalação já está rodando.');
    if (DEMO) return this._demo(withOpenClaw);
    if (!IS_WIN) throw new Error('A instalação automática funciona só no Windows.');
    model = String(model || 'gemma4').trim();
    if (!/^[\w.:\-/]+$/.test(model)) throw new Error('Nome de modelo inválido.');
    this.running = true;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    const report = (step, pct, text, log) => this.onProgress({ step, pct, text, log });
    const log = (step) => (line) => this.onProgress({ step, log: line });

    try {
      // ---------------------------------------------------------- 1. Ollama
      report('ollama', null, 'Procurando o Ollama…');
      let models = await ollamaUp();
      if (!models) {
        if (!ollamaExe()) {
          report('ollama', null, 'Instalando o Ollama…', 'Tentando pelo winget…');
          const w = await ps('winget install --id Ollama.Ollama -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity', log('ollama'), 15 * 60000, signal);
          if (signal.aborted) throw new Error('Cancelado');
          if (!ollamaExe()) {
            report('ollama', 0, 'Baixando o instalador do Ollama…', w.code === 0 ? null : 'winget indisponível, baixando o instalador oficial…');
            const setup = path.join(os.tmpdir(), 'OllamaSetup.exe');
            await download(OLLAMA_SETUP, setup, ({ received, total }) =>
              report('ollama', total ? Math.round(received / total * 100) : null, `${(received / 1048576).toFixed(0)} MB`), signal);
            report('ollama', null, 'Instalando o Ollama…');
            await ps(`Start-Process -FilePath '${setup.replace(/'/g, "''")}' -ArgumentList '/VERYSILENT','/NORESTART','/SUPPRESSMSGBOXES' -Wait`, log('ollama'), 15 * 60000, signal);
            fs.rmSync(setup, { force: true });
          }
          if (!ollamaExe()) throw new Error('Não consegui instalar o Ollama. Baixe em ollama.com/download e clique em instalar de novo.');
        }
        report('ollama', null, 'Ligando o Ollama…');
        const exe = ollamaExe();
        spawn(exe, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
        for (let i = 0; i < 60 && !models; i++) { await sleep(1000); models = await ollamaUp(); if (signal.aborted) throw new Error('Cancelado'); }
        if (!models) throw new Error('O Ollama foi instalado, mas não respondeu. Abra o Ollama pelo menu Iniciar e tente de novo.');
      }
      report('ollama', 100, 'Ollama pronto', 'Ollama respondendo em 127.0.0.1:11434');

      // ---------------------------------------------------------- 2. Modelo
      const has = models.some(m => m.name === model || m.name === `${model}:latest` || m.model === model);
      if (has) report('model', 100, `${model} já estava baixado`);
      else {
        report('model', 0, `Baixando ${model}… (pode demorar, são alguns GB)`);
        await pullModel(model, (step, pct, text, line) => report(step, pct, text, line), signal);
        report('model', 100, `${model} pronto`);
      }

      // ---------------------------------------------------------- 3. OpenClaw (opcional)
      if (withOpenClaw) {
        report('openclaw', null, 'Procurando o OpenClaw…');
        let check = await ps('(Get-Command openclaw -ErrorAction SilentlyContinue).Source', null, 60000, signal);
        if (!check.out.trim()) {
          report('openclaw', null, 'Instalando o OpenClaw (instalador oficial)…');
          const r = await ps(`& ([scriptblock]::Create((iwr -useb ${OPENCLAW_PS1}))) -NoOnboard`, log('openclaw'), 25 * 60000, signal);
          if (signal.aborted) throw new Error('Cancelado');
          check = await ps('(Get-Command openclaw -ErrorAction SilentlyContinue).Source', null, 60000, signal);
          if (!check.out.trim()) throw new Error(`Não consegui instalar o OpenClaw (código ${r.code}). Veja o log acima.`);
        }
        report('openclaw', null, 'OpenClaw instalado', check.out.trim());

        if (!openclawConfigured()) {
          report('openclaw', null, 'Configurando o OpenClaw com o Ollama…');
          const r = await ps(`openclaw onboard --non-interactive --accept-risk --skip-health --auth-choice ollama --custom-base-url "${OLLAMA}" --custom-model-id "${model}" --install-daemon`, log('openclaw'), 15 * 60000, signal);
          if (r.code !== 0) throw new Error('A configuração do OpenClaw falhou. Veja o log acima.');
        } else {
          report('openclaw', null, 'O OpenClaw já estava configurado; mantive a sua configuração.');
        }

        report('openclaw', null, 'Ligando a conexão para outros apps…');
        await ps('openclaw config set gateway.http.endpoints.chatCompletions.enabled true', log('openclaw'), 120000, signal);
        const rs = await ps('openclaw gateway restart', log('openclaw'), 180000, signal);
        if (rs.code !== 0) await ps('openclaw gateway install --force', log('openclaw'), 300000, signal);

        report('openclaw', null, 'Esperando o OpenClaw responder…');
        let ready = null;
        for (let i = 0; i < 45 && !ready; i++) {
          const d = await local.detect();
          ready = d.find(x => x.kind === 'openclaw' && x.state === 'ready');
          if (!ready) await sleep(2000);
          if (signal.aborted) throw new Error('Cancelado');
        }
        if (!ready) throw new Error('O OpenClaw foi instalado, mas não respondeu. Abra o OpenClaw e clique em Procurar no meu PC.');
        const c = await this.connect({ kind: 'openclaw', baseUrl: ready.baseUrl });
        if (!c || !c.ok) throw new Error('OpenClaw pronto, mas não consegui conectar: ' + ((c && c.error) || '?'));
      } else {
        const c = await this.connect({ kind: 'ollama', baseUrl: `${OLLAMA}/v1`, model });
        if (!c || !c.ok) throw new Error('Ollama pronto, mas não consegui conectar: ' + ((c && c.error) || '?'));
      }

      this.onProgress({ step: 'done', pct: 100, done: true, text: 'Tudo pronto!' });
      return { ok: true };
    } catch (e) {
      this.onProgress({ step: 'error', error: e.message, done: true });
      return { ok: false, error: e.message };
    } finally {
      this.running = false;
      this.abort = null;
    }
  }
}

module.exports = { Installer, MODELS, pullModel };
