'use strict';
/**
 * Armazenamento 100% local.
 *  - settings.json  -> preferências (sem nada sensível)
 *  - vault.bin      -> chaves de API (criptografadas pelo Windows via safeStorage/DPAPI)
 *  - memory.bin     -> conversas, anotações e lembretes (também criptografados)
 * Nada disso sai do computador, exceto as mensagens que você envia para a IA escolhida.
 */
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const DEFAULTS = {
  version: 1,
  onboarded: false,
  lang: 'pt-BR',
  userName: '',
  assistantName: 'Bitu',
  provider: 'anthropic',
  models: { anthropic: '', openai: '' },
  avatar: {
    kind: 'builtin', // builtin | image | pack
    shape: 'gota',
    color: '#FF8A3D',
    eyes: 'normal',
    accessory: 'fone',
    cheeks: true,
    file: '',
    packDir: '',
    scale: 1
  },
  voice: {
    enabled: true,
    engine: 'system', // system | openai
    systemVoice: '',
    openaiVoice: 'coral',
    rate: 1.05,
    pitch: 1.1,
    volume: 0.9,
    speakReplies: true
  },
  perms: {
    screen: false,
    control: false,
    commands: false,
    files: false,
    music: true,
    notifications: true
  },
  confirmActions: true,
  personality: {
    humor: 2,          // 0 sério ... 3 palhaço
    commentMusic: true,
    readNotificationText: false,
    wellbeing: true,
    roam: true,
    sneeze: true
  },
  dnd: false,
  startWithWindows: true,
  shortcuts: {
    chat: 'Control+Alt+B',
    listen: 'Control+Alt+Space',
    stop: 'Control+Alt+X'
  },
  position: { x: null }
};

function deepMerge(base, extra) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) {
    return extra === undefined ? base : extra;
  }
  const out = { ...base };
  for (const k of Object.keys(extra || {})) {
    out[k] = (k in base) ? deepMerge(base[k], extra[k]) : extra[k];
  }
  return out;
}

class Store {
  constructor() {
    this.dir = path.join(app.getPath('userData'), 'bitu-data');
    this.avatarDir = path.join(app.getPath('userData'), 'avatars');
    fs.mkdirSync(this.dir, { recursive: true });
    fs.mkdirSync(this.avatarDir, { recursive: true });
    this.settingsFile = path.join(this.dir, 'settings.json');
    this.vaultFile = path.join(this.dir, 'vault.bin');
    this.memoryFile = path.join(this.dir, 'memory.bin');
    this.settings = this._loadSettings();
    this.vault = this._readEncrypted(this.vaultFile, {});
    this.memory = this._readEncrypted(this.memoryFile, { history: [], notes: [], reminders: [], stats: {} });
    this._saveTimer = null;
  }

  get encryptionAvailable() {
    try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
  }

  _loadSettings() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.settingsFile, 'utf8'));
      return deepMerge(DEFAULTS, raw);
    } catch {
      return JSON.parse(JSON.stringify(DEFAULTS));
    }
  }

  _atomicWrite(file, data) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, file);
  }

  _readEncrypted(file, fallback) {
    try {
      const buf = fs.readFileSync(file);
      if (buf.length === 0) return fallback;
      let text;
      if (buf.slice(0, 5).toString() === 'PLAIN') {
        text = Buffer.from(buf.slice(5).toString(), 'base64').toString('utf8');
      } else {
        text = safeStorage.decryptString(buf);
      }
      return { ...fallback, ...JSON.parse(text) };
    } catch (e) {
      if (fs.existsSync(file)) console.warn('[store] não consegui abrir', path.basename(file), e.message);
      return fallback;
    }
  }

  _writeEncrypted(file, obj) {
    const text = JSON.stringify(obj);
    let buf;
    if (this.encryptionAvailable) buf = safeStorage.encryptString(text);
    else buf = Buffer.from('PLAIN' + Buffer.from(text, 'utf8').toString('base64'));
    this._atomicWrite(file, buf);
  }

  // ---------- settings ----------
  getSettings() { return JSON.parse(JSON.stringify(this.settings)); }

  setSettings(patch) {
    this.settings = deepMerge(this.settings, patch || {});
    this._atomicWrite(this.settingsFile, JSON.stringify(this.settings, null, 2));
    return this.getSettings();
  }

  // ---------- chaves ----------
  hasKey(provider) { return Boolean(this.vault[provider]); }
  getKey(provider) { return this.vault[provider] || ''; }
  setKey(provider, key) {
    if (key) this.vault[provider] = key; else delete this.vault[provider];
    this._writeEncrypted(this.vaultFile, this.vault);
  }

  // ---------- memória ----------
  saveMemorySoon() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.saveMemoryNow(), 400);
  }
  saveMemoryNow() {
    clearTimeout(this._saveTimer);
    try { this._writeEncrypted(this.memoryFile, this.memory); } catch (e) { console.error('[store] memória', e); }
  }

  addMessage(role, text, extra = {}) {
    const msg = { role, text, time: Date.now(), ...extra };
    this.memory.history.push(msg);
    if (this.memory.history.length > 2000) this.memory.history.splice(0, this.memory.history.length - 2000);
    this.saveMemorySoon();
    return msg;
  }

  recentHistory(limit = 30) {
    return this.memory.history.filter(m => m.role === 'user' || m.role === 'assistant').slice(-limit);
  }

  addNote(text) {
    const clean = String(text).trim().slice(0, 400);
    if (!clean) return null;
    if (this.memory.notes.some(n => n.text.toLowerCase() === clean.toLowerCase())) return null;
    const note = { id: Date.now().toString(36), text: clean, time: Date.now() };
    this.memory.notes.push(note);
    if (this.memory.notes.length > 300) this.memory.notes.shift();
    this.saveMemorySoon();
    return note;
  }

  removeNote(id) {
    this.memory.notes = this.memory.notes.filter(n => n.id !== id);
    this.saveMemorySoon();
  }

  bumpStat(name) {
    this.memory.stats[name] = (this.memory.stats[name] || 0) + 1;
    this.saveMemorySoon();
  }

  clearHistory() {
    this.memory.history = [];
    this.saveMemoryNow();
  }

  wipeEverything() {
    this.memory = { history: [], notes: [], reminders: [], stats: {} };
    this.vault = {};
    this.saveMemoryNow();
    this._writeEncrypted(this.vaultFile, this.vault);
  }

  exportMemory() {
    return {
      exportedAt: new Date().toISOString(),
      notes: this.memory.notes,
      reminders: this.memory.reminders,
      history: this.memory.history
    };
  }
}

module.exports = { Store, DEFAULTS };
