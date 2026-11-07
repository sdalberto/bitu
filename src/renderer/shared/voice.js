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

    if (v.engine === 'openai') {
      try {
        const b64 = await root.bitu.invoke('tts:openai', t, v.openaiVoice);
        if (b64 && b64.error) throw new Error(b64.error);
        audioEl = audioEl || new Audio();
        audioEl.src = 'data:audio/mpeg;base64,' + b64;
        audioEl.volume = v.volume;
        audioEl.onplay = () => opts.onStart && opts.onStart();
        audioEl.onended = () => opts.onEnd && opts.onEnd();
        audioEl.onerror = () => opts.onEnd && opts.onEnd();
        await audioEl.play();
        return;
      } catch (e) {
        console.warn('voz OpenAI falhou, usando a do Windows', e);
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

  root.BituVoice = { speak, stop, voicesFor, clean };
})(typeof self !== 'undefined' ? self : this);
