'use strict';
/**
 * Voz e microfone 100% offline.
 *  - Fala: Piper (https://github.com/rhasspy/piper) com vozes em pt-BR, inglês e espanhol
 *  - Ouvido: whisper.cpp (https://github.com/ggml-org/whisper.cpp) com o modelo multilíngue
 * Tudo é baixado só quando o usuário ativa, para a pasta de dados do Bitu.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { download, extract, findFile, IS_WIN } = require('./download');

const HF_PIPER = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';
const PIPER_ZIP = IS_WIN
  ? 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip'
  : 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz';
const WHISPER_ZIP = 'https://github.com/ggml-org/whisper.cpp/releases/latest/download/whisper-bin-x64.zip';
const WHISPER_MODEL = (id) => `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${id}.bin`;

// vozes do Piper por idioma (id = pasta no repositório de vozes)
const VOICES = [
  { id: 'pt_BR-faber-medium', lang: 'pt-BR', name: 'Faber', mb: 63 },
  { id: 'pt_BR-cadu-medium', lang: 'pt-BR', name: 'Cadu', mb: 63 },
  { id: 'pt_BR-jeff-medium', lang: 'pt-BR', name: 'Jeff', mb: 63 },
  { id: 'pt_BR-edresson-low', lang: 'pt-BR', name: 'Edresson (leve)', mb: 63 },
  { id: 'en_US-amy-medium', lang: 'en', name: 'Amy', mb: 63 },
  { id: 'en_US-lessac-medium', lang: 'en', name: 'Lessac', mb: 63 },
  { id: 'es_ES-davefx-medium', lang: 'es', name: 'Davefx', mb: 63 },
  { id: 'es_MX-claude-high', lang: 'es', name: 'Claude (MX)', mb: 114 }
];

const STT_MODELS = [
  { id: 'tiny', name: 'Rápido (tiny)', mb: 75 },
  { id: 'base', name: 'Equilibrado (base)', mb: 142 },
  { id: 'small', name: 'Mais preciso (small)', mb: 466 }
];

function voiceUrl(id) {
  const [loc, name, quality] = id.split('-');
  const lang = loc.split('_')[0];
  return `${HF_PIPER}/${lang}/${loc}/${name}/${quality}/${id}.onnx`;
}

/** Em teste dá pra apontar tudo para um espelho local. */
function src(url) {
  const mirror = process.env.BITU_VOICE_MIRROR;
  return mirror ? `${mirror.replace(/\/+$/, '')}/${url.split('/').pop()}` : url;
}

class LocalVoice {
  constructor(baseDir) {
    this.dir = path.join(baseDir, 'voice');
    this.piperDir = path.join(this.dir, 'piper');
    this.whisperDir = path.join(this.dir, 'whisper');
    this.voicesDir = path.join(this.dir, 'voices');
    this.modelsDir = path.join(this.dir, 'models');
    this.tmp = path.join(os.tmpdir(), 'bitu-voice');
    fs.mkdirSync(this.tmp, { recursive: true });
    this.busy = false;
    this._piperExe = null;
    this._whisperExe = null;
  }

  piperExe() {
    if (this._piperExe && fs.existsSync(this._piperExe)) return this._piperExe;
    this._piperExe = findFile(this.piperDir, IS_WIN ? 'piper.exe' : 'piper');
    return this._piperExe;
  }

  whisperExe() {
    if (this._whisperExe && fs.existsSync(this._whisperExe)) return this._whisperExe;
    this._whisperExe = findFile(this.whisperDir, IS_WIN ? 'whisper-cli.exe' : 'whisper-cli')
      || findFile(this.whisperDir, IS_WIN ? 'main.exe' : 'main');
    return this._whisperExe;
  }

  voicePath(id) { return path.join(this.voicesDir, id + '.onnx'); }
  modelPath(id) { return path.join(this.modelsDir, `ggml-${id}.bin`); }

  status() {
    return {
      supported: IS_WIN || Boolean(process.env.BITU_VOICE_MIRROR),
      tts: Boolean(this.piperExe()),
      stt: Boolean(this.whisperExe()),
      voices: VOICES.filter(v => fs.existsSync(this.voicePath(v.id)) && fs.existsSync(this.voicePath(v.id) + '.json')).map(v => v.id),
      sttModels: STT_MODELS.filter(m => fs.existsSync(this.modelPath(m.id))).map(m => m.id),
      catalog: { voices: VOICES, sttModels: STT_MODELS },
      busy: this.busy
    };
  }

  /**
   * Baixa e instala o que faltar.
   * want: { voice: 'pt_BR-faber-medium', sttModel: 'base', tts: true, stt: true }
   * progress({ step, pct, text })
   */
  async install(want, progress) {
    if (this.busy) throw new Error('Já estou instalando, espera terminar.');
    if (!this.status().supported) throw new Error('A voz offline está disponível só no Windows por enquanto.');
    this.busy = true;
    const say = (step, pct, text) => progress && progress({ step, pct, text });
    const bytes = (label) => ({ received, total }) => {
      const mb = (n) => (n / 1048576).toFixed(0);
      say(label, total ? Math.round((received / total) * 100) : null, total ? `${mb(received)} de ${mb(total)} MB` : `${mb(received)} MB`);
    };
    try {
      if (want.tts !== false) {
        if (!this.piperExe()) {
          const archive = path.join(this.tmp, path.basename(PIPER_ZIP));
          await download(src(PIPER_ZIP), archive, bytes('piper'));
          say('piper', 100, 'descompactando…');
          fs.rmSync(this.piperDir, { recursive: true, force: true });
          await extract(archive, this.piperDir);
          fs.rmSync(archive, { force: true });
          this._piperExe = null;
          if (!this.piperExe()) throw new Error('Não encontrei o piper depois de descompactar.');
          if (!IS_WIN) fs.chmodSync(this.piperExe(), 0o755);
        }
        const v = want.voice || 'pt_BR-faber-medium';
        if (!VOICES.some(x => x.id === v)) throw new Error('Voz desconhecida: ' + v);
        if (!fs.existsSync(this.voicePath(v) + '.json')) {
          await download(src(voiceUrl(v) + '.json'), this.voicePath(v) + '.json', null);
        }
        if (!fs.existsSync(this.voicePath(v))) {
          await download(src(voiceUrl(v)), this.voicePath(v), bytes('voice'));
        }
      }
      if (want.stt !== false) {
        if (!this.whisperExe()) {
          if (!IS_WIN && !process.env.BITU_VOICE_MIRROR) throw new Error('O microfone offline está disponível só no Windows.');
          const archive = path.join(this.tmp, 'whisper-bin-x64.zip');
          await download(src(WHISPER_ZIP), archive, bytes('whisper'));
          say('whisper', 100, 'descompactando…');
          fs.rmSync(this.whisperDir, { recursive: true, force: true });
          await extract(archive, this.whisperDir);
          fs.rmSync(archive, { force: true });
          this._whisperExe = null;
          if (!this.whisperExe()) throw new Error('Não encontrei o whisper-cli depois de descompactar.');
          if (!IS_WIN) fs.chmodSync(this.whisperExe(), 0o755);
        }
        const m = want.sttModel || 'base';
        if (!STT_MODELS.some(x => x.id === m)) throw new Error('Modelo desconhecido: ' + m);
        if (!fs.existsSync(this.modelPath(m))) {
          await download(src(WHISPER_MODEL(m)), this.modelPath(m), bytes('model'));
        }
      }
      say('done', 100, '');
      return this.status();
    } finally {
      this.busy = false;
    }
  }

  uninstall() {
    fs.rmSync(this.dir, { recursive: true, force: true });
    this._piperExe = null;
    this._whisperExe = null;
    return this.status();
  }

  /** Texto -> WAV (Buffer). rate: 1 = normal, 1.2 = 20% mais rápido */
  async speak(text, voiceId, rate = 1) {
    const exe = this.piperExe();
    const model = this.voicePath(voiceId);
    if (!exe) throw new Error('A voz offline não está instalada.');
    if (!fs.existsSync(model)) throw new Error('Essa voz ainda não foi baixada.');
    const out = path.join(this.tmp, `fala-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.wav`);
    const lengthScale = Math.max(0.5, Math.min(2, 1 / (Number(rate) || 1))).toFixed(2);
    await new Promise((resolve, reject) => {
      const p = spawn(exe, ['--model', model, '--output_file', out, '--length_scale', lengthScale, '--sentence_silence', '0.15'],
        { cwd: path.dirname(exe), windowsHide: true });
      let err = '';
      p.stderr.on('data', d => { err += d; });
      p.on('error', reject);
      const timer = setTimeout(() => { try { p.kill(); } catch { /* ok */ } reject(new Error('A voz demorou demais')); }, 60000);
      p.on('close', code => { clearTimeout(timer); code === 0 && fs.existsSync(out) ? resolve() : reject(new Error('Piper falhou: ' + err.slice(-300))); });
      p.stdin.end(Buffer.from(String(text).replace(/\s*\n+\s*/g, ' ').trim() + '\n', 'utf8'));
    });
    const buf = fs.readFileSync(out);
    fs.rmSync(out, { force: true });
    return buf;
  }

  /** WAV 16 kHz mono -> texto */
  async transcribe(wavBuffer, lang, modelId) {
    const exe = this.whisperExe();
    const model = this.modelPath(modelId) && fs.existsSync(this.modelPath(modelId))
      ? this.modelPath(modelId)
      : STT_MODELS.map(m => this.modelPath(m.id)).find(p => fs.existsSync(p));
    if (!exe || !model) throw new Error('O microfone offline não está instalado.');
    const base = path.join(this.tmp, `ouvido-${Date.now()}`);
    fs.writeFileSync(base + '.wav', Buffer.from(wavBuffer));
    const threads = String(Math.max(1, Math.min(8, (os.cpus() || []).length - 1)));
    const language = String(lang || 'pt').slice(0, 2);
    try {
      await new Promise((resolve, reject) => {
        const p = spawn(exe, ['-m', model, '-f', base + '.wav', '-l', language, '-t', threads, '-nt', '-np', '-otxt', '-of', base],
          { cwd: path.dirname(exe), windowsHide: true });
        let err = '';
        p.stderr.on('data', d => { err += d; });
        p.on('error', reject);
        const timer = setTimeout(() => { try { p.kill(); } catch { /* ok */ } reject(new Error('Transcrição demorou demais')); }, 120000);
        p.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Whisper falhou: ' + err.slice(-300))); });
      });
      const text = fs.existsSync(base + '.txt') ? fs.readFileSync(base + '.txt', 'utf8') : '';
      return text.replace(/\[(?:BLANK_AUDIO|MUSIC|Música|música)[^\]]*\]/gi, ' ').replace(/\s+/g, ' ').trim();
    } finally {
      for (const ext of ['.wav', '.txt']) fs.rmSync(base + ext, { force: true });
    }
  }
}

module.exports = { LocalVoice, VOICES, STT_MODELS, voiceUrl };
