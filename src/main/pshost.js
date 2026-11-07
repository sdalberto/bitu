'use strict';
/**
 * Um PowerShell que fica aberto em segundo plano (escondido) para responder rápido.
 * Cada script vai em Base64 e é executado no mesmo processo, então funções e tipos
 * carregados uma vez ficam disponíveis nas próximas chamadas.
 */
const { spawn } = require('child_process');

const IS_WIN = process.platform === 'win32';

class PSHost {
  constructor(name = 'ps') {
    this.name = name;
    this.proc = null;
    this.queue = [];
    this.current = null;
    this.buffer = '';
    this.seq = 0;
  }

  _start() {
    if (!IS_WIN) return;
    this.proc = spawn('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'
    ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stderr.setEncoding('utf8');
    this.proc.stdout.on('data', d => this._onData(d));
    this.proc.stderr.on('data', d => { if (this.current) this.current.err += d; });
    this.proc.on('exit', () => {
      this.proc = null;
      if (this.current) { this.current.reject(new Error('PowerShell encerrou')); this.current = null; }
      // recomeça a fila se tiver algo pendente
      if (this.queue.length) setTimeout(() => this._next(), 500);
    });
    this.proc.stdin.write('[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n');
    this.proc.stdin.write("$ErrorActionPreference = 'Stop'\n");
  }

  _onData(chunk) {
    this.buffer += chunk;
    if (!this.current) { this.buffer = ''; return; }
    const marker = `<<<BITU_END_${this.current.id}>>>`;
    const idx = this.buffer.indexOf(marker);
    if (idx === -1) return;
    const out = this.buffer.slice(0, idx).replace(/\r/g, '').trim();
    this.buffer = this.buffer.slice(idx + marker.length);
    const job = this.current;
    this.current = null;
    clearTimeout(job.timer);
    const errMatch = out.match(/<<<BITU_ERR>>>([\s\S]*)$/);
    if (errMatch) job.reject(new Error(errMatch[1].trim() || 'erro no PowerShell'));
    else job.resolve(out);
    this._next();
  }

  _next() {
    if (this.current || !this.queue.length) return;
    if (!this.proc) this._start();
    if (!this.proc) {
      const job = this.queue.shift();
      job.reject(new Error('Disponível apenas no Windows'));
      return this._next();
    }
    const job = this.queue.shift();
    this.current = job;
    const b64 = Buffer.from(job.script, 'utf8').toString('base64');
    const line =
      `try { . ([ScriptBlock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}')))) | Out-String -Width 4096 | Write-Output } ` +
      `catch { Write-Output ('<<<BITU_ERR>>>' + $_.Exception.Message) }; Write-Output '<<<BITU_END_${job.id}>>>'\n`;
    job.timer = setTimeout(() => {
      if (this.current === job) {
        this.current = null;
        job.reject(new Error('Tempo esgotado'));
        try { this.proc.kill(); } catch { /* ignore */ }
      }
    }, job.timeout);
    this.proc.stdin.write(line);
  }

  run(script, timeout = 15000) {
    return new Promise((resolve, reject) => {
      this.queue.push({ id: ++this.seq, script, timeout, resolve, reject, err: '' });
      this._next();
    });
  }

  dispose() {
    try { this.proc && this.proc.kill(); } catch { /* ignore */ }
    this.proc = null;
  }
}

module.exports = { PSHost, IS_WIN };
