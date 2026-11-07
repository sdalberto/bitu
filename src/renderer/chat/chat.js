/* Janela de conversa. */
(async function () {
  'use strict';
  const { bitu, BituI18n: I, BituAvatar: A, BituMeme: M } = window;

  const $ = (id) => document.getElementById(id);
  const log = $('log'), input = $('input'), sendBtn = $('btn-send'), micBtn = $('btn-mic'), chips = $('chips');

  let S = await bitu.invoke('settings:get');
  let busy = false;
  let typingEl = null;
  const L = () => S.lang;
  const t = (k, v) => I.t(L(), k, v);

  // ------------------------------------------------------------ cabeçalho
  async function refreshHeader() {
    I.apply(L());
    document.documentElement.lang = L();
    $('name').textContent = S.assistantName || 'Bitu';
    A.mount($('mini'), S.avatar);
    const keys = await bitu.invoke('keys:status');
    const on = keys[S.provider];
    $('dot').classList.toggle('on', on);
    const LOCALN = { openclaw: 'OpenClaw', ollama: 'Ollama', lmstudio: 'LM Studio', custom: 'Local' };
    const prov = S.provider === 'anthropic' ? 'Claude' : S.provider === 'openai' ? 'ChatGPT' : (LOCALN[(S.local || {}).kind] || 'Local');
    $('status').textContent = `${prov} · ${on ? t('chat.connected') : t('chat.disconnected')}`;
    renderChips();
  }

  function renderChips() {
    chips.innerHTML = '';
    ['chip.joke', 'chip.music', 'chip.screen', 'chip.meme', 'chip.day', 'chip.news'].forEach(k => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = t(k);
      b.onclick = () => send(t(k));
      chips.appendChild(b);
    });
  }

  // ------------------------------------------------------------ renderização
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function md(text) {
    const blocks = [];
    let s = String(text).replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
      blocks.push(`<pre><button class="copy" type="button">copiar</button><code>${esc(code.replace(/\n$/, ''))}</code></pre>`);
      return `\u0000${blocks.length - 1}\u0000`;
    });
    s = esc(s)
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?]|$)/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
      .replace(/^\s*[-•]\s+/gm, '• ');
    s = s.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[i]);
  }

  function scroll() { requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; }); }

  function clearEmpty() { const e = log.querySelector('.empty'); if (e) e.remove(); }

  function add(kind, html) {
    clearEmpty();
    const el = document.createElement('div');
    el.className = 'msg ' + kind;
    el.innerHTML = html;
    el.querySelectorAll('pre .copy').forEach(btn => {
      btn.onclick = () => { navigator.clipboard.writeText(btn.nextElementSibling.textContent); btn.textContent = '✓'; setTimeout(() => { btn.textContent = 'copiar'; }, 1200); };
    });
    log.insertBefore(el, typingEl && typingEl.parentNode === log ? typingEl : null);
    scroll();
    return el;
  }

  function addTool(name) {
    clearEmpty();
    const el = document.createElement('div');
    el.className = 'tool';
    el.textContent = t('tool.' + name) !== 'tool.' + name ? t('tool.' + name) : name;
    log.insertBefore(el, typingEl && typingEl.parentNode === log ? typingEl : null);
    scroll();
  }

  function showTyping(on) {
    if (on && !typingEl) {
      typingEl = document.createElement('div');
      typingEl.className = 'typing';
      typingEl.innerHTML = '<span></span><span></span><span></span>';
      log.appendChild(typingEl);
      scroll();
    } else if (!on && typingEl) {
      typingEl.remove(); typingEl = null;
    } else if (on && typingEl) {
      log.appendChild(typingEl); scroll();
    }
  }

  function setBusy(b) {
    busy = b;
    sendBtn.classList.toggle('busy', b);
    sendBtn.setAttribute('aria-label', b ? t('chat.stop') : t('chat.send'));
  }

  function emptyState() {
    if (log.children.length) return;
    const e = document.createElement('div');
    e.className = 'empty';
    e.innerHTML = `<div class="big"></div><div>${esc(t('chat.empty'))}</div>`;
    log.appendChild(e);
    A.mount(e.querySelector('.big'), S.avatar);
  }

  function actionCard(title, btnLabel, onClick) {
    clearEmpty();
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `<h4>${esc(title)}</h4><div class="row"><button class="btn primary" type="button">${esc(btnLabel)}</button></div>`;
    el.querySelector('button').onclick = onClick;
    log.appendChild(el);
    scroll();
  }

  // ------------------------------------------------------------ enviar
  const SLASH = {
    '/piada': () => bitu.send('buddy:relay', { type: 'joke' }),
    '/joke': () => bitu.send('buddy:relay', { type: 'joke' }),
    '/chiste': () => bitu.send('buddy:relay', { type: 'joke' }),
    '/danca': () => bitu.send('buddy:relay', { type: 'emote', emotion: 'dancando' }),
    '/dança': () => bitu.send('buddy:relay', { type: 'emote', emotion: 'dancando' }),
    '/dance': () => bitu.send('buddy:relay', { type: 'emote', emotion: 'dancando' }),
    '/dorme': () => bitu.send('buddy:relay', { type: 'emote', emotion: 'dormindo' }),
    '/sleep': () => bitu.send('buddy:relay', { type: 'emote', emotion: 'dormindo' }),
    '/cafe': () => { bitu.send('buddy:relay', { type: 'emote', emotion: 'cafe' }); bitu.send('buddy:relay', { type: 'say', text: I.pick(L(), 'buddy.coffee') }); },
    '/estilo': () => bitu.send('buddy:relay', { type: 'emote', emotion: 'oculos_escuros' }),
    '/festa': () => { bitu.send('buddy:relay', { type: 'emote', emotion: 'comemorando' }); bitu.send('buddy:relay', { type: 'fx', kind: 'confetti' }); },
    '/meme': () => { const [top, bottom] = I.pick(L(), 'memes'); showMeme({ top, bottom, scene: M.SCENES[Math.floor(Math.random() * M.SCENES.length)] }); },
    '/casa': () => bitu.send('buddy:relay', { type: 'go-home' }),
    '/limpar': () => clearChat(),
    '/config': () => bitu.invoke('window:open', 'settings'),
    '/ajuda': () => add('sys', esc('/piada · /danca · /dorme · /cafe · /estilo · /festa · /meme · /casa · /limpar · /config')),
    '/help': () => add('sys', esc('/joke · /dance · /sleep · /cafe · /estilo · /festa · /meme · /casa · /limpar · /config'))
  };

  async function send(text) {
    text = String(text || '').trim();
    if (!text) return;
    const cmd = SLASH[text.toLowerCase()];
    if (cmd) { cmd(); input.value = ''; autosize(); return; }
    if (/\bsextou\b|\bes viernes\b|\bfriday\b/i.test(text)) {
      bitu.send('buddy:relay', { type: 'emote', emotion: 'comemorando' });
    }
    if (/\bgo+l+\b|\bgolaço\b|\bgoal+\b|\bé campeão\b/i.test(text)) {
      bitu.send('buddy:relay', { type: 'emote', emotion: 'comemorando' });
      bitu.send('buddy:relay', { type: 'fx', kind: 'confetti' });
    }
    add('me', md(text));
    input.value = ''; autosize();
    setBusy(true);
    showTyping(true);
    await bitu.invoke('chat:send', text);
  }

  $('composer').addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) { bitu.invoke('chat:stop'); return; }
    send(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!busy) send(input.value); }
  });
  function autosize() { input.style.height = 'auto'; input.style.height = Math.min(140, input.scrollHeight + 3) + 'px'; }
  input.addEventListener('input', autosize);

  async function clearChat() {
    if (!confirm(t('chat.clearConfirm'))) return;
    await bitu.invoke('chat:clear');
    log.innerHTML = '';
    emptyState();
  }

  // ------------------------------------------------------------ voz (microfone)
  /** webm/opus -> WAV 16 kHz mono (formato que o whisper offline entende) */
  async function toWav16k(blob) {
    const ctx = new AudioContext();
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    ctx.close();
    const rate = 16000;
    const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const pcm = (await off.startRendering()).getChannelData(0);
    const buf = new ArrayBuffer(44 + pcm.length * 2);
    const v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) { const x = Math.max(-1, Math.min(1, pcm[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7FFF, true); }
    return new Uint8Array(buf);
  }

  let rec = null, chunks = [];
  async function toggleMic() {
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    const av = await bitu.invoke('stt:available');
    const pref = S.voice.sttEngine || 'auto';
    const useLocal = av && av.local && (pref !== 'openai' || !av.openai);
    const useOpenAI = av && av.openai && !useLocal;
    if (!useLocal && !useOpenAI) { add('sys', esc(t('chat.noMic'))); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { add('err', esc(t('chat.micDenied'))); return; }
    chunks = [];
    rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach(tr => tr.stop());
      micBtn.classList.remove('rec');
      input.placeholder = t('chat.transcribing');
      bitu.send('buddy:relay', { type: 'emote', emotion: 'pensativo' });
      const blob = new Blob(chunks, { type: 'audio/webm' });
      let text = '';
      try {
        text = useLocal
          ? await bitu.invoke('stt:local', await toWav16k(blob))
          : await bitu.invoke('stt:transcribe', new Uint8Array(await blob.arrayBuffer()), 'audio/webm');
      } catch (e) { text = { error: e.message }; }
      input.placeholder = t('chat.placeholder');
      if (text && text.error) add('err', esc(text.error));
      else if (text && String(text).trim()) send(text);
    };
    rec.start();
    micBtn.classList.add('rec');
    input.placeholder = t('chat.listening');
    setTimeout(() => { if (rec && rec.state === 'recording') rec.stop(); }, 60000);
  }
  micBtn.addEventListener('click', toggleMic);
  bitu.on('chat:listen', () => toggleMic());

  // ------------------------------------------------------------ memes
  async function showMeme(spec) {
    const dataUrl = await M.make(spec, S.avatar);
    const file = await bitu.invoke('meme:save', dataUrl);
    const folder = String(file).split(/[\\/]/).slice(-3, -1).join(' › ');
    const el = add('bot', `<img class="meme" alt="meme"><div class="meta">${esc(t('chat.memeSaved'))} ${esc(folder)} · <a data-open>${esc(t('chat.openFolder'))}</a></div>`);
    el.querySelector('img').src = dataUrl;
    el.querySelector('[data-open]').onclick = () => bitu.invoke('open:path', file);
    bitu.send('chat:meme-ready', file);
  }
  bitu.on('chat:meme', (spec) => showMeme(spec));

  // ------------------------------------------------------------ eventos da IA
  bitu.on('agent:event', (ev) => {
    switch (ev.type) {
      case 'thinking': setBusy(true); showTyping(true); break;
      case 'tool': addTool(ev.name); break;
      case 'reply': add('bot', md(ev.text)); break;
      case 'error': add('err', esc(ev.text)); break;
      case 'stopped': add('sys', esc(t('chat.stopped'))); break;
      case 'need-connect':
        actionCard(I.pick(L(), 'buddy.needConnect'), t('chat.connect'), () => bitu.invoke('window:open', 'settings', 'connection'));
        break;
      case 'perm-blocked':
        actionCard(t('chat.permBlocked'), t('chat.openPerms'), () => bitu.invoke('window:open', 'settings', 'perms'));
        break;
      case 'done': setBusy(false); showTyping(false); break;
    }
  });

  bitu.on('confirm:ask', ({ id, detail }) => {
    showTyping(false);
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `<h4>${esc(t('chat.allowTitle'))}</h4><pre>${esc(detail)}</pre>
      <div class="row"><button class="btn" data-no type="button">${esc(t('chat.deny'))}</button><button class="btn primary" data-yes type="button">${esc(t('chat.allow'))}</button></div>`;
    const reply = (ok) => { el.classList.add('done'); bitu.invoke('confirm:reply', id, ok); if (ok) showTyping(true); };
    el.querySelector('[data-yes]').onclick = () => reply(true);
    el.querySelector('[data-no]').onclick = () => reply(false);
    clearEmpty();
    log.appendChild(el);
    scroll();
    el.querySelector('[data-yes]').focus();
  });

  bitu.on('settings:changed', (s) => { S = s; refreshHeader(); });
  bitu.on('connect:status', () => refreshHeader());

  // ------------------------------------------------------------ botões e código secreto
  $('btn-close').onclick = () => bitu.invoke('window:close');
  $('btn-settings').onclick = () => bitu.invoke('window:open', 'settings');
  $('btn-clear').onclick = () => clearChat();

  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let kpos = 0;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (busy) bitu.invoke('chat:stop'); else bitu.invoke('window:close'); return; }
    kpos = (e.key.toLowerCase() === KONAMI[kpos].toLowerCase()) ? kpos + 1 : (e.key === KONAMI[0] ? 1 : 0);
    if (kpos === KONAMI.length) { kpos = 0; bitu.send('buddy:relay', { type: 'legend' }); bitu.send('buddy:relay', { type: 'fx', kind: 'confetti' }); }
  });

  // ------------------------------------------------------------ início
  await refreshHeader();
  const history = await bitu.invoke('chat:history');
  for (const m of history || []) add(m.role === 'user' ? 'me' : 'bot', md(m.text));
  emptyState();
  scroll();
  input.focus();
})();
