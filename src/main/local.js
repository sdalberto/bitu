'use strict';
/**
 * Modo local: OpenClaw, Ollama, LM Studio ou qualquer servidor compatível com a API da OpenAI
 * rodando no próprio PC. Nada passa pela nuvem (a não ser que o próprio OpenClaw esteja
 * configurado para usar um modelo na nuvem).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const PRESETS = {
  openclaw: { name: 'OpenClaw', port: 18789, path: '/v1' },
  ollama: { name: 'Ollama', port: 11434, path: '/v1' },
  lmstudio: { name: 'LM Studio', port: 1234, path: '/v1' }
};

// ---------------------------------------------------------------- config do OpenClaw
function openclawConfigPath() {
  return process.env.OPENCLAW_CONFIG_PATH || path.join(os.homedir(), '.openclaw', 'openclaw.json');
}

/** Lê JSON5 "na marra": tira comentários, vírgulas sobrando e põe aspas nas chaves. */
function parseLoose(text) {
  try { return JSON.parse(text); } catch { /* segue para o modo tolerante */ }
  let s = '';
  let inStr = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inStr) {
      s += c;
      if (c === '\\') { s += n || ''; i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") { inStr = c; s += c; continue; }
    if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; s += '\n'; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i++; continue; }
    s += c;
  }
  s = s
    .replace(/'((?:[^'\\]|\\.)*)'/g, (_, v) => JSON.stringify(v.replace(/\\'/g, "'")))
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(s);
}

function readOpenClaw() {
  const file = openclawConfigPath();
  const out = { file, found: false, port: Number(process.env.OPENCLAW_GATEWAY_PORT) || PRESETS.openclaw.port, token: '', chatEnabled: null };
  if (process.env.OPENCLAW_GATEWAY_TOKEN) out.token = process.env.OPENCLAW_GATEWAY_TOKEN;
  else if (process.env.OPENCLAW_GATEWAY_PASSWORD) out.token = process.env.OPENCLAW_GATEWAY_PASSWORD;
  try {
    const cfg = parseLoose(fs.readFileSync(file, 'utf8'));
    out.found = true;
    const gw = cfg.gateway || {};
    if (!process.env.OPENCLAW_GATEWAY_PORT && Number(gw.port)) out.port = Number(gw.port);
    const auth = gw.auth || {};
    if (!out.token) out.token = auth.token || auth.password || '';
    const cc = gw.http && gw.http.endpoints && gw.http.endpoints.chatCompletions;
    out.chatEnabled = Boolean(cc && cc.enabled);
  } catch (e) {
    if (fs.existsSync(file)) out.found = true; // existe mas não deu pra ler; segue com o padrão
  }
  return out;
}

// ---------------------------------------------------------------- conversa com o servidor
function headers(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function probe(baseUrl, token, timeout = 2500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(baseUrl.replace(/\/+$/, '') + '/models', { headers: headers(token), signal: ctrl.signal });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json().catch(() => ({}));
    const models = (data.data || data.models || []).map(m => ({ id: m.id || m.name, name: m.id || m.name })).filter(m => m.id);
    return { ok: true, models };
  } catch (e) {
    return { ok: false, status: 0, offline: true };
  } finally {
    clearTimeout(timer);
  }
}

/** Procura servidores locais conhecidos. */
async function detect() {
  const oc = readOpenClaw();
  const checks = [
    { kind: 'openclaw', baseUrl: `http://127.0.0.1:${oc.port}/v1`, token: oc.token, config: oc },
    { kind: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', token: '' },
    { kind: 'lmstudio', baseUrl: 'http://127.0.0.1:1234/v1', token: '' }
  ];
  const results = await Promise.all(checks.map(async c => {
    const r = await probe(c.baseUrl, c.token);
    let state = r.ok ? 'ready' : r.offline ? 'off' : 'error';
    // OpenClaw rodando, mas sem a API de chat ligada: responde 404 em /v1/models
    if (c.kind === 'openclaw' && !r.ok && (r.status === 404 || r.status === 405)) state = 'needs-api';
    if (c.kind === 'openclaw' && !r.ok && r.status === 401) state = 'needs-token';
    return {
      kind: c.kind, name: PRESETS[c.kind].name, baseUrl: c.baseUrl, hasToken: Boolean(c.token),
      state, models: r.models || [], configFound: c.config ? c.config.found : undefined
    };
  }));
  return results;
}

function pickModel(kind, models) {
  if (!models || !models.length) return kind === 'openclaw' ? 'openclaw/default' : '';
  if (kind === 'openclaw') return (models.find(m => /openclaw\/default|^openclaw$/.test(m.id)) || models[0]).id;
  const chat = models.filter(m => !/embed|bge|nomic|rerank|whisper|tts/i.test(m.id));
  return ((chat.length ? chat : models)[0]).id;
}

/** Token usado para o OpenClaw: o que o usuário colou ou o que está na config dele. */
function tokenFor(kind, savedToken) {
  if (savedToken) return savedToken;
  if (kind === 'openclaw') return readOpenClaw().token;
  return '';
}

/** Comando que liga a API de chat do OpenClaw (rodado só quando o usuário clica). */
const OPENCLAW_ENABLE_CMD =
  'openclaw config set gateway.http.endpoints.chatCompletions.enabled true; openclaw gateway restart';

module.exports = { PRESETS, detect, probe, pickModel, readOpenClaw, tokenFor, parseLoose, OPENCLAW_ENABLE_CMD, openclawConfigPath };
