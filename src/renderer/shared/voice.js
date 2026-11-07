/* Fala: vozes do Windows (Web Speech) ou vozes da OpenAI (via processo principal). */
(function (root) {
  'use strict';

  const LANG_PREFIX = { 'pt-BR': 'pt', en: 'en', es: 'es' };
  let audioEl = null;
  let currentUtter = null;
  let speakingCb = null;

  function voices() {
    return new Promise((resolve) => {
      const list = speechSynthesis.getVoices();
      if (list.length) return resolve(list);
      speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices());
      setTimeout(() => resolve(speechSynthesis.getVoices()), 1500);
    });
  }

  async function voicesFor(lang) {
    const all = await voices();
    const prefix = LANG_PREFIX[lang] || 'pt';
    const mine = all.filter(v => v.lang.toLowerCase().startsWith(prefix));
    // vozes "Natural"/"Online" primeiro (soam bem melhores)
    return mine.sort((a, b) => score(b, lang) - score(a, lang));
  }

  function score(v, lang) {
    let s = 0;
    if (/natural|online|neural/i.test(v.name)) s += 10;
    if (lang === 'pt-BR' && /pt-br/i.test(v.lang)) s += 5;
    if (v.localService) s += 1;
    return s;
  }

  // a voz offline precisa combinar com o idioma; se não combinar, usa a primeira baixada daquele idioma
  const LOCAL_PREFIX = { 'pt-BR': 'pt_', en: 'en_', es: 'es_' };
  let installedLocal = [];
  function localVoiceFor(s) {
    const want = s.voice.localVoice || '';
    const pre = LOCAL_PREFIX[s.lang] || 'pt_';
    if (want.startsWith(pre)) return want;
    return installedLocal.find(id => id.startsWith(pre)) || want;
  }
  function setInstalledLocal(list) { installedLocal = Array.isArray(list) ? list : []; }
  if (root.bitu) root.bitu.invoke('voice:status').then(st => setInstalledLocal(st && st.voices)).catch(() => {});

  function clean(text) {
    return String(text)
      .replace(/```[\s\S]*?```/g, ' (mandei o código no chat) ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/https?:\/\/\S+/g, ' (link no chat) ')
      .replace(/[*_#>~|]/g, '')
      .replace(/\p{Extended_Pictographic}/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1200);
  }

  function stop() {
    try { speechSynthesis.cancel(); } catch { /* ok */ }
    if (audioEl) { audioEl.pause(); audioEl.src = ''; }
    currentUtter = null;
    if (speakingCb) speakingCb(false);
  }

  /**
   * opts: { settings, onStart, onEnd, onBoundary }
   */
  async function speak(text, opts) {
    const s = opts.settings;
    const v = s.voice;
    const t = clean(text);
    if (!t) return;
    stop();
    speakingCb = (on) => { if (!on && opts.onEnd) opts.onEnd(); };

    if (v.engine === 'openai' || v.engine === 'local') {
      try {
        const local = v.engine === 'local';
        const b64 = local
          ? await root.bitu.invoke('tts:local', t, localVoiceFor(s))
          : await root.bitu.invoke('tts:openai', t, v.openaiVoice);
        if (b64 && b64.error) throw new Error(b64.error);
        audioEl = audioEl || new Audio();
        audioEl.src = (local ? 'data:audio/wav;base64,' : 'data:audio/mpeg;base64,') + b64;
        audioEl.volume = v.volume;
        audioEl.onplay = () => opts.onStart && opts.onStart();
        audioEl.onended = () => opts.onEnd && opts.onEnd();
        audioEl.onerror = () => opts.onEnd && opts.onEnd();
        await audioEl.play();
        return;
      } catch (e) {
        console.warn('voz ' + v.engine + ' falhou, usando a do Windows', e);
      }
    }

    const list = await voicesFor(s.lang);
    const u = new SpeechSynthesisUtterance(t);
    u.lang = s.lang === 'pt-BR' ? 'pt-BR' : s.lang;
    const chosen = list.find(x => x.name === v.systemVoice) || list[0];
    if (chosen) u.voice = chosen;
    u.rate = v.rate; u.pitch = v.pitch; u.volume = v.volume;
    u.onstart = () => opts.onStart && opts.onStart();
    u.onend = () => { if (currentUtter === u) { currentUtter = null; opts.onEnd && opts.onEnd(); } };
    u.onerror = u.onend;
    u.onboundary = () => opts.onBoundary && opts.onBoundary();
    currentUtter = u;
    speechSynthesis.speak(u);
  }

  root.BituVoice = { speak, stop, voicesFor, clean, setInstalledLocal };
})(typeof self !== 'undefined' ? self : this);
