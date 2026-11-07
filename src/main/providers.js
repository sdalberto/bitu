'use strict';
/**
 * Conexão com Claude (Anthropic) e ChatGPT (OpenAI).
 * Os dois falam o mesmo "idioma interno" de ferramentas; aqui fica a tradução para cada API.
 */

const ANTHROPIC = 'https://api.anthropic.com/v1';
const OPENAI = 'https://api.openai.com/v1';
const FALLBACK = { anthropic: 'claude-sonnet-5-5', openai: 'gpt-4o' };

const KEY_PATTERNS = {
  anthropic: /\bsk-ant-[A-Za-z0-9_\-]{20,}\b/,
  openai: /\bsk-(?!ant-)(?:proj-|svcacct-)?[A-Za-z0-9_\-]{20,}\b/
};

const CONSOLE_URLS = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys'
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function request(url, { method = 'GET', headers = {}, body, signal, raw = false } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method,
      headers: body && !(body instanceof FormData) ? { 'content-type': 'application/json', ...headers } : headers,
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      signal
    });
    if (res.ok) return raw ? res : res.json();
    const text = await res.text().catch(() => '');
    let msg = text;
    try { msg = JSON.parse(text).error?.message || text; } catch { /* texto puro */ }
    lastErr = Object.assign(new Error(friendlyError(res.status, msg)), { status: res.status });
    if ([429, 500, 502, 503, 529].includes(res.status) && attempt < 2) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    throw lastErr;
  }
  throw lastErr;
}

function friendlyError(status, msg) {
  if (status === 401) return 'Chave inválida ou revogada. Reconecte em Configurações > Conexão.';
  if (status === 403) return 'Sua conta não tem acesso a esse modelo ou recurso.';
  if (status === 404) return 'Modelo não encontrado. Escolha outro em Configurações > Conexão.';
  if (status === 429) return 'Muitos pedidos ou créditos esgotados na sua conta. Tenta de novo daqui a pouco.';
  if (status === 529 || status === 503) return 'O serviço está sobrecarregado agora. Tenta de novo em instantes.';
  return `Erro ${status}: ${String(msg).slice(0, 300)}`;
}

// ---------------- modelos ----------------
async function listModels(provider, key) {
  if (provider === 'anthropic') {
    const data = await request(`${ANTHROPIC}/models?limit=100`, {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
    });
    return (data.data || []).map(m => ({ id: m.id, name: m.display_name || m.id }));
  }
  const data = await request(`${OPENAI}/models`, { headers: { authorization: `Bearer ${key}` } });
  return (data.data || [])
    .filter(m => /^(gpt-|o\d|chatgpt)/.test(m.id))
    .filter(m => !/(audio|realtime|tts|transcribe|image|embedding|search|instruct|codex|moderation|dall)/.test(m.id))
    .sort((a, b) => (b.created || 0) - (a.created || 0))
    .map(m => ({ id: m.id, name: m.id }));
}

function pickDefaultModel(provider, models) {
  if (!models || !models.length) return FALLBACK[provider];
  if (provider === 'anthropic') {
    return (models.find(m => /sonnet/i.test(m.id)) || models[0]).id;
  }
  const good = models.find(m => /^gpt-\d/.test(m.id) && !/(mini|nano|preview)/.test(m.id));
  return (good || models[0]).id;
}

async function validateKey(provider, key) {
  const models = await listModels(provider, key);
  return { ok: true, models, defaultModel: pickDefaultModel(provider, models) };
}

// ---------------- conversa com ferramentas ----------------
/**
 * Uma sessão de turno: guarda as mensagens no formato do provedor enquanto o agente
 * usa ferramentas, e devolve tudo normalizado.
 */
class Turn {
  constructor({ provider, key, model, system, history, tools, signal }) {
    this.provider = provider;
    this.key = key;
    this.model = model || FALLBACK[provider];
    this.system = system;
    this.tools = tools;
    this.signal = signal;
    if (provider === 'anthropic') {
      this.messages = mergeSameRole(history.map(h => ({ role: h.role, content: h.text })));
    } else {
      this.messages = [{ role: 'system', content: system }, ...history.map(h => ({ role: h.role, content: h.text }))];
    }
  }

  /** Retorna { text, calls: [{id, name, input}] } */
  async step() {
    return this.provider === 'anthropic' ? this._stepAnthropic() : this._stepOpenAI();
  }

  async _stepAnthropic() {
    const data = await request(`${ANTHROPIC}/messages`, {
      method: 'POST',
      signal: this.signal,
      headers: { 'x-api-key': this.key, 'anthropic-version': '2023-06-01' },
      body: {
        model: this.model,
        max_tokens: 2048,
        system: this.system,
        messages: this.messages,
        tools: this.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.schema }))
      }
    });
    this.messages.push({ role: 'assistant', content: data.content });
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    const calls = data.content.filter(b => b.type === 'tool_use').map(b => ({ id: b.id, name: b.name, input: b.input || {} }));
    return { text, calls };
  }

  async _stepOpenAI() {
    const data = await request(`${OPENAI}/chat/completions`, {
      method: 'POST',
      signal: this.signal,
      headers: { authorization: `Bearer ${this.key}` },
      body: {
        model: this.model,
        messages: this.messages,
        tools: this.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } }))
      }
    });
    const msg = data.choices[0].message;
    this.messages.push(msg);
    const calls = (msg.tool_calls || []).map(c => {
      let input = {};
      try { input = JSON.parse(c.function.arguments || '{}'); } catch { /* argumentos inválidos */ }
      return { id: c.id, name: c.function.name, input };
    });
    return { text: (msg.content || '').trim(), calls };
  }

  /** results: [{ id, text, image?: { mime, base64 } }] */
  addResults(results) {
    if (this.provider === 'anthropic') {
      this.messages.push({
        role: 'user',
        content: results.map(r => ({
          type: 'tool_result',
          tool_use_id: r.id,
          is_error: Boolean(r.error),
          content: r.image
            ? [{ type: 'text', text: r.text }, { type: 'image', source: { type: 'base64', media_type: r.image.mime, data: r.image.base64 } }]
            : r.text
        }))
      });
      return;
    }
    const images = [];
    for (const r of results) {
      this.messages.push({ role: 'tool', tool_call_id: r.id, content: r.text });
      if (r.image) images.push(r.image);
    }
    if (images.length) {
      this.messages.push({
        role: 'user',
        content: [
          { type: 'text', text: '(captura de tela pedida pela ferramenta)' },
          ...images.map(i => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.base64}` } }))
        ]
      });
    }
  }
}

function mergeSameRole(msgs) {
  const out = [];
  for (const m of msgs) {
    if (!m.content) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += '\n\n' + m.content;
    else out.push({ ...m });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

// ---------------- voz (OpenAI) ----------------
const OPENAI_VOICES = ['coral', 'nova', 'shimmer', 'sage', 'ballad', 'alloy', 'ash', 'echo', 'fable', 'onyx', 'verse'];

async function openaiSpeech(key, text, voice, instructions) {
  const body = { model: 'gpt-4o-mini-tts', voice, input: String(text).slice(0, 4000), format: 'mp3' };
  if (instructions) body.instructions = instructions;
  let res;
  try {
    res = await request(`${OPENAI}/audio/speech`, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body, raw: true });
  } catch (e) {
    if (e.status !== 404 && e.status !== 400) throw e;
    res = await request(`${OPENAI}/audio/speech`, {
      method: 'POST', headers: { authorization: `Bearer ${key}` }, raw: true,
      body: { model: 'tts-1', voice: ['coral', 'sage', 'ballad', 'ash', 'verse'].includes(voice) ? 'nova' : voice, input: body.input }
    });
  }
  return Buffer.from(await res.arrayBuffer());
}

async function openaiTranscribe(key, audioBuffer, mime, lang) {
  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: mime || 'audio/webm' }), 'fala.webm');
  form.append('model', 'whisper-1');
  if (lang) form.append('language', lang.slice(0, 2));
  const data = await request(`${OPENAI}/audio/transcriptions`, {
    method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form
  });
  return data.text || '';
}

module.exports = {
  Turn, listModels, validateKey, pickDefaultModel, openaiSpeech, openaiTranscribe,
  KEY_PATTERNS, CONSOLE_URLS, OPENAI_VOICES, FALLBACK
};
