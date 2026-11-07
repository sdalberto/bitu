/* O Bitu na tela: anda, fala, dança, dorme e reage ao que acontece no PC. */
(async function () {
  'use strict';
  const { bitu, BituI18n: I, BituAvatar: A, BituVoice: V } = window;

  const avatarEl = document.getElementById('avatar');
  const bubble = document.getElementById('bubble');
  const bubbleText = document.getElementById('bubble-text');
  const fx = document.getElementById('fx');

  let S = await bitu.invoke('settings:get');
  let setPackState = () => {};
  let state = 'idle';
  let emoTimer = null, bubbleTimer = null, mouthTimer = null, walkRaf = null, idleTimer = null;
  let speaking = false, thinking = false, dragging = false, walking = false, sleeping = false;
  let musicPlaying = false;
  let lastInteraction = Date.now();
  let lastMusicComment = 0;
  let activeMinutes = 0;

  const L = () => S.lang;
  const vars = () => ({ name: S.userName, assistant: S.assistantName || 'Bitu' });
  const rnd = (a, b) => a + Math.random() * (b - a);
  const chance = (p) => Math.random() < p;
  const today = () => new Date().toISOString().slice(0, 10);
  const flag = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const setFlag = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ok */ } };

  // ---------------------------------------------------------------- avatar
  function renderAvatar() {
    const size = Math.round(150 * (S.avatar.scale || 1));
    avatarEl.style.setProperty('--size', size + 'px');
    bubble.style.bottom = (size + 18) + 'px';
    setPackState = A.mount(avatarEl, S.avatar);
    setState(state);
  }

  function setState(s) {
    state = s;
    avatarEl.dataset.state = s;
    setPackState(s === 'drag' ? 'idle' : s);
  }

  function setEmo(emo, ms = 3500) {
    clearTimeout(emoTimer);
    avatarEl.dataset.emo = emo || '';
    if (emo) setPackState(emo);
    if (emo === 'apaixonado') burst('heart', 6);
    if (emo === 'comemorando') confetti(36);
    if (emo === 'surpreso') burst('bang', 1, '!');
    if (emo === 'tonto') burst('star', 5, '✦');
    if (ms) emoTimer = setTimeout(() => { avatarEl.dataset.emo = ''; setPackState(state); }, ms);
  }

  function blinkLoop() {
    setTimeout(() => {
      if (!sleeping) {
        avatarEl.classList.add('blink');
        setTimeout(() => avatarEl.classList.remove('blink'), 130);
        if (chance(.2)) setTimeout(() => { avatarEl.classList.add('blink'); setTimeout(() => avatarEl.classList.remove('blink'), 120); }, 260);
      }
      blinkLoop();
    }, rnd(2500, 6000));
  }

  function look(x, y) {
    avatarEl.style.setProperty('--look-x', x + 'px');
    avatarEl.style.setProperty('--look-y', y + 'px');
  }

  // ---------------------------------------------------------------- efeitos
  function origin() {
    const r = avatarEl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height * 0.25 };
  }

  function particle(cls, text, x, y, extra = {}) {
    const p = document.createElement('div');
    p.className = 'p ' + cls;
    if (text) p.textContent = text;
    p.style.left = x + 'px'; p.style.top = y + 'px';
    for (const [k, v] of Object.entries(extra)) p.style.setProperty(k, v);
    fx.appendChild(p);
    setTimeout(() => p.remove(), 3200);
  }

  function burst(kind, n = 3, char) {
    const o = origin();
    const chars = { note: ['♪', '♫', '♬'], heart: ['♥'], z: ['z', 'Z', 'z'], star: ['✦', '✧'], bang: ['!'], sweat: ['💧'] };
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        const set = chars[kind] || [''];
        particle(kind, char || set[i % set.length], o.x + rnd(-40, 40), o.y + rnd(-10, 20), { '--dx': rnd(-50, 50) + 'px', '--rot': rnd(-40, 40) + 'deg' });
      }, i * 160);
    }
  }

  function confetti(n = 30) {
    const o = origin();
    const colors = ['#FF8A3D', '#FFC93C', '#7BD389', '#5BA8FF', '#FF7EB6', '#8E7CFF'];
    for (let i = 0; i < n; i++) {
      particle('confetti', '', o.x, o.y + 20, {
        background: colors[i % colors.length], '--dx': rnd(-140, 140) + 'px', '--dy': rnd(-200, 40) + 'px', '--rot': rnd(-720, 720) + 'deg'
      });
    }
  }

  let ambientTimer = null;
  function ambient() {
    clearInterval(ambientTimer);
    ambientTimer = setInterval(() => {
      if (state === 'dance') burst('note', 1);
      if (state === 'sleep') burst('z', 1);
    }, 900);
  }

  // ---------------------------------------------------------------- fala e balão
  function showBubble(html, ms) {
    clearTimeout(bubbleTimer);
    bubble.classList.remove('think');
    bubbleText.innerHTML = html;
    bubble.classList.add('show');
    if (ms) bubbleTimer = setTimeout(hideBubble, ms);
  }
  function hideBubble() { bubble.classList.remove('show'); }

  function showThinking() {
    clearTimeout(bubbleTimer);
    bubble.classList.add('think');
    bubbleText.innerHTML = '<span class="dots"><span></span><span></span><span></span></span>';
    bubble.classList.add('show');
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function shortText(text) {
    const t = V.clean(text);
    if (t.length <= 170) return t;
    const cut = t.slice(0, 170);
    return cut.slice(0, Math.max(cut.lastIndexOf('. '), cut.lastIndexOf(' '))) + '…';
  }

  function startMouth() {
    stopMouth();
    avatarEl.classList.add('talking');
    setPackState('talk');
    const tick = () => {
      avatarEl.classList.toggle('mouth-open');
      mouthTimer = setTimeout(tick, rnd(85, 170));
    };
    tick();
  }
  function stopMouth() {
    clearTimeout(mouthTimer);
    if (avatarEl.classList.contains('talking')) setPackState(state === 'drag' ? 'idle' : state);
    avatarEl.classList.remove('talking', 'mouth-open');
  }

  /**
   * opts.spontaneous: algo que o Bitu decidiu falar sozinho (respeita o "não perturbe")
   * opts.voice: false para só mostrar o balão
   */
  function say(text, opts = {}) {
    if (!text) return;
    if (opts.spontaneous && (S.dnd || document.hidden)) return;
    if (sleeping && !opts.spontaneous) wake(false);
    const shown = shortText(text);
    const readMs = Math.min(12000, 2200 + shown.length * 55);
    showBubble(esc(shown), opts.voice === false || !S.voice.enabled ? readMs : 0);
    if (opts.voice === false || !S.voice.enabled || (S.dnd && opts.spontaneous)) {
      startMouth(); setTimeout(stopMouth, Math.min(2500, shown.length * 45));
      return;
    }
    speaking = true;
    V.speak(text, {
      settings: S,
      onStart: () => startMouth(),
      onBoundary: () => avatarEl.classList.toggle('mouth-open'),
      onEnd: () => {
        speaking = false;
        stopMouth();
        clearTimeout(bubbleTimer);
        bubbleTimer = setTimeout(hideBubble, 2600);
      }
    });
    // segurança: se a voz não iniciar, mexe a boca mesmo assim
    setTimeout(() => { if (speaking && !avatarEl.classList.contains('talking')) startMouth(); }, 800);
  }

  bubble.addEventListener('click', () => { V.stop(); hideBubble(); stopMouth(); bitu.send('buddy:click'); });

  // ---------------------------------------------------------------- movimento
  async function area() { return bitu.invoke('buddy:area'); }

  async function walkTo(targetX, speed = 80) {
    if (dragging) return;
    cancelAnimationFrame(walkRaf);
    const { bounds, workArea } = await area();
    const minX = workArea.x - 30, maxX = workArea.x + workArea.width - bounds.width + 30;
    const tx = Math.max(minX, Math.min(maxX, targetX));
    let x = bounds.x;
    const y = workArea.y + workArea.height - bounds.height;
    if (Math.abs(tx - x) < 8) return;
    walking = true;
    avatarEl.classList.toggle('flip', tx < x);
    setState('walk');
    let last = performance.now();
    return new Promise((resolve) => {
      const step = (now) => {
        const dt = Math.min(50, now - last) / 1000; last = now;
        const dir = Math.sign(tx - x);
        x += dir * speed * dt;
        if ((dir > 0 && x >= tx) || (dir < 0 && x <= tx) || dragging) {
          x = tx;
          bitu.send('buddy:moveTo', x, y);
          walking = false;
          avatarEl.classList.remove('flip');
          if (!dragging) setState(musicPlaying ? 'dance' : 'idle');
          bitu.send('buddy:savePos');
          return resolve();
        }
        bitu.send('buddy:moveTo', x, y);
        walkRaf = requestAnimationFrame(step);
      };
      walkRaf = requestAnimationFrame(step);
    });
  }

  async function fallToGround(fromY) {
    const { bounds, workArea } = await area();
    const ground = workArea.y + workArea.height - bounds.height;
    let y = fromY != null ? fromY : bounds.y;
    let v = 0;
    if (y >= ground - 2) return false;
    return new Promise((resolve) => {
      const step = () => {
        v += 1.4; y += v;
        if (y >= ground) {
          bitu.send('buddy:moveTo', bounds.x, ground);
          setEmo('surpreso', 900);
          return resolve(true);
        }
        bitu.send('buddy:moveTo', bounds.x, y);
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  // ---------------------------------------------------------------- mouse: hover, clique, arrastar
  let interactive = false;
  function setInteractive(on) {
    if (on === interactive) return;
    interactive = on;
    bitu.send('buddy:interactive', on);
  }

  document.addEventListener('mousemove', (e) => {
    if (dragging) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const over = Boolean(el && (avatarEl.contains(el) || (bubble.classList.contains('show') && bubble.contains(el))));
    setInteractive(over);
    if (over && !sleeping) {
      const r = avatarEl.getBoundingClientRect();
      look(Math.max(-4, Math.min(4, (e.clientX - (r.left + r.width / 2)) / 12)), Math.max(-4, Math.min(4, (e.clientY - (r.top + r.height / 2)) / 12)));
    }
  });
  document.addEventListener('mouseleave', () => { if (!dragging) setInteractive(false); });

  let down = null, clickTimer = null, clicks = 0, tickles = 0, tickleReset = null;
  let shake = { last: 0, dir: 0, flips: 0, t0: 0 };

  avatarEl.addEventListener('mousedown', async (e) => {
    if (e.button !== 0) return;
    const { bounds } = await area();
    down = { sx: e.screenX, sy: e.screenY, wx: bounds.x, wy: bounds.y, moved: false };
    shake = { last: e.screenX, dir: 0, flips: 0, t0: performance.now() };
  });

  window.addEventListener('mousemove', (e) => {
    if (!down) return;
    const dx = e.screenX - down.sx, dy = e.screenY - down.sy;
    if (!down.moved && Math.hypot(dx, dy) < 5) return;
    if (!down.moved) {
      down.moved = true; dragging = true; cancelAnimationFrame(walkRaf); walking = false;
      if (sleeping) wake(false);
      setState('drag'); setInteractive(true);
    }
    bitu.send('buddy:moveTo', down.wx + dx, down.wy + dy);
    // detecta chacoalhada
    const d = Math.sign(e.screenX - shake.last);
    if (d && d !== shake.dir && Math.abs(e.screenX - shake.last) > 6) { shake.flips++; shake.dir = d; }
    shake.last = e.screenX;
    if (performance.now() - shake.t0 > 1200) { shake.t0 = performance.now(); shake.flips = 0; }
    if (shake.flips > 7) { shake.flips = 0; setEmo('tonto', 3500); say(I.pick(L(), 'buddy.dizzy'), { voice: true }); }
  });

  window.addEventListener('mouseup', async (e) => {
    if (!down) return;
    const wasDrag = down.moved;
    const start = down;
    down = null;
    lastInteraction = Date.now();
    if (wasDrag) {
      dragging = false;
      setState(musicPlaying ? 'dance' : 'idle');
      const fell = await fallToGround(start.wy + (e.screenY - start.sy));
      if (fell && chance(0.5)) say(I.pick(L(), 'buddy.dropped'), { spontaneous: true });
      bitu.send('buddy:savePos');
      return;
    }
    if (e.button !== 0) return;
    clicks++;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      if (clicks === 1) {
        if (sleeping) wake(true); else bitu.send('buddy:click');
      } else {
        tickle();
      }
      clicks = 0;
    }, 240);
  });

  avatarEl.addEventListener('contextmenu', (e) => { e.preventDefault(); bitu.send('buddy:menu'); });

  function tickle() {
    tickles++;
    clearTimeout(tickleReset);
    tickleReset = setTimeout(() => { tickles = 0; }, 8000);
    if (sleeping) return wake(true);
    if (tickles >= 4) {
      tickles = 0;
      setEmo('tonto', 3000);
      say(I.pick(L(), 'buddy.tickleMax'));
      return;
    }
    setEmo('rindo', 1800);
    burst('star', 3);
    say(I.pick(L(), 'buddy.tickle'), { voice: tickles === 1 });
  }

  // ---------------------------------------------------------------- dormir e acordar
  function sleep() {
    if (sleeping || speaking || dragging) return;
    sleeping = true;
    hideBubble();
    setState('sleep');
  }
  function wake(withLine) {
    if (!sleeping) return;
    sleeping = false;
    setState(musicPlaying ? 'dance' : 'idle');
    setEmo('bocejo', 1600);
    if (withLine) setTimeout(() => say(I.pick(L(), 'buddy.wake', vars()), { spontaneous: true }), 900);
  }

  // ---------------------------------------------------------------- vida própria
  function scheduleIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(async () => {
      try { await idleTick(); } finally { scheduleIdle(); }
    }, rnd(12000, 26000));
  }

  async function idleTick() {
    if (dragging || speaking || thinking || sleeping) return;
    const h = new Date().getHours();
    const P = S.personality;

    // sextou
    if (new Date().getDay() === 5 && h >= 17 && flag('friday') !== today()) {
      setFlag('friday', today());
      setEmo('comemorando', 4000);
      say(I.pick(L(), 'buddy.friday'), { spontaneous: true });
      return;
    }
    // madrugada
    if (h >= 0 && h < 4 && new Date().getMinutes() > 20 && flag('late') !== today()) {
      setFlag('late', today());
      setEmo('bocejo', 1600);
      say(I.pick(L(), 'buddy.late'), { spontaneous: true });
      return;
    }
    if (state === 'dance') return;

    const r = Math.random();
    if (P.roam && r < 0.16 && !walking) {
      const { workArea, bounds } = await area();
      const target = workArea.x + rnd(0, workArea.width - bounds.width);
      return walkTo(target, rnd(55, 95));
    }
    if (P.sneeze && r < 0.175) {
      setEmo('espirro', 1000);
      setTimeout(() => say(I.pick(L(), 'buddy.sneeze'), { spontaneous: true, voice: false }), 450);
      return;
    }
    if (r < 0.55) {
      look(rnd(-4, 4), rnd(-3, 3));
      setTimeout(() => look(0, 0), 1800);
      return;
    }
    if (r < 0.6 && Date.now() - lastInteraction > 20 * 60000) {
      setEmo('bocejo', 1600);
      return;
    }
    if (P.humor >= 2 && r < 0.62) {
      say(I.pick(L(), 'buddy.idle', vars()), { spontaneous: true, voice: false });
    }
  }

  // ---------------------------------------------------------------- eventos do mundo
  bitu.on('world:event', (ev) => {
    const P = S.personality;
    switch (ev.type) {
      case 'media': {
        musicPlaying = ev.playing;
        if (!S.perms.music) return;
        if (ev.playing) {
          if (!sleeping && !dragging && !walking) setState('dance');
          const canComment = P.commentMusic && ev.newTrack && Date.now() - lastMusicComment > 4 * 60000 && chance(0.6);
          if (canComment) {
            lastMusicComment = Date.now();
            const line = ev.title ? I.pick(L(), 'buddy.music', { title: ev.title, artist: ev.artist || '' }) : I.pick(L(), 'buddy.musicNoTitle');
            say(line, { spontaneous: true, voice: false });
          }
        } else if (state === 'dance') {
          setState('idle');
        }
        break;
      }
      case 'notification': {
        if (!S.perms.notifications) return;
        if (sleeping) wake(false);
        setEmo('surpreso', 1600);
        const from = P.readNotificationText && ev.title ? I.pick(L(), 'buddy.notificationFrom', { app: ev.app, title: ev.title }) : I.pick(L(), 'buddy.notification', { app: ev.app || 'app' });
        say(from, { spontaneous: true });
        break;
      }
      case 'reminder':
        if (sleeping) wake(false);
        setEmo('surpreso', 2500);
        say(I.pick(L(), ev.late ? 'buddy.reminderLate' : 'buddy.reminder', { text: ev.text }));
        break;
      case 'idle': {
        if (ev.seconds < 60) activeMinutes += 20 / 60;
        if (ev.seconds > 600 && !musicPlaying && !sleeping) sleep();
        if (ev.seconds < 20 && sleeping) wake(true);
        if (P.wellbeing && activeMinutes >= 95) {
          activeMinutes = 0;
          setEmo('cafe', 5000);
          say(I.pick(L(), 'buddy.water'), { spontaneous: true });
        }
        break;
      }
      case 'lock': sleep(); break;
      case 'unlock': wake(true); break;
      case 'hello-first':
        setEmo('comemorando', 3500);
        say(I.pick(L(), 'buddy.first', vars()));
        break;
    }
  });

  // ---------------------------------------------------------------- comandos (da IA, menu ou chat)
  function emote(emotion) {
    if (emotion === 'dancando') {
      setState('dance');
      if (!musicPlaying) setTimeout(() => { if (state === 'dance' && !musicPlaying) setState('idle'); }, 9000);
      return;
    }
    if (emotion === 'dormindo') { sleeping = false; return sleep(); }
    if (sleeping) wake(false);
    const ms = { tonto: 3000, cafe: 7000, oculos_escuros: 8000, comemorando: 4000, apaixonado: 4000 }[emotion] || 3500;
    setEmo(emotion, ms);
  }

  bitu.on('buddy:cmd', async (cmd) => {
    lastInteraction = Date.now();
    switch (cmd.type) {
      case 'emote': emote(cmd.emotion); break;
      case 'say': say(cmd.text); break;
      case 'joke': {
        const j = I.pick(L(), 'jokes');
        say(j);
        setTimeout(() => setEmo('rindo', 2000), Math.min(6000, j.length * 60));
        break;
      }
      case 'fx':
        if (cmd.kind === 'confetti') confetti(40); else burst(cmd.kind, cmd.n || 4);
        break;
      case 'legend':
        avatarEl.classList.add('legend');
        setEmo('comemorando', 4000);
        say(I.pick(L(), 'buddy.konami'));
        setTimeout(() => avatarEl.classList.remove('legend'), 60000);
        break;
      case 'pointing': {
        const { bounds } = await area();
        await walkTo(cmd.x - bounds.width / 2, 140);
        setEmo('surpreso', 900);
        break;
      }
      case 'go-home': {
        const { workArea, bounds } = await area();
        walkTo(workArea.x + workArea.width - bounds.width - 6, 120);
        break;
      }
    }
  });

  // ---------------------------------------------------------------- respostas da IA
  bitu.on('agent:event', (ev) => {
    lastInteraction = Date.now();
    switch (ev.type) {
      case 'thinking':
        thinking = true;
        if (sleeping) wake(false);
        if (!speaking) showThinking();
        if (state !== 'dance' && state !== 'walk') setState('think');
        break;
      case 'tool':
        if (!speaking) showThinking();
        break;
      case 'reply':
        thinking = false;
        if (state === 'think') setState(musicPlaying ? 'dance' : 'idle');
        if (S.voice.speakReplies) say(ev.text);
        else showBubble(esc(shortText(ev.text)), 6000);
        break;
      case 'error':
        thinking = false;
        setState('idle');
        setEmo('triste', 3000);
        say(I.t(L(), 'buddy.error', { msg: ev.text }), { voice: false });
        break;
      case 'need-connect':
        setEmo('pensativo', 3000);
        break;
      case 'perm-blocked':
        setEmo('pensativo', 2500);
        break;
      case 'stopped':
        V.stop(); stopMouth();
        say(I.pick(L(), 'buddy.stopped'), { voice: false });
        break;
      case 'done':
        thinking = false;
        if (state === 'think') setState(musicPlaying ? 'dance' : 'idle');
        if (!speaking && bubble.classList.contains('think')) hideBubble();
        break;
    }
  });

  bitu.on('settings:changed', (s) => {
    const avatarChanged = JSON.stringify(s.avatar) !== JSON.stringify(S.avatar);
    S = s;
    if (avatarChanged) renderAvatar();
    if (S.dnd) { V.stop(); hideBubble(); }
  });

  // ---------------------------------------------------------------- começo
  renderAvatar();
  blinkLoop();
  ambient();
  scheduleIdle();

  if (S.onboarded && flag('greet') !== today()) {
    setFlag('greet', today());
    const h = new Date().getHours();
    const key = h < 12 ? 'buddy.morning' : h < 18 ? 'buddy.afternoon' : 'buddy.evening';
    setTimeout(() => { setEmo('feliz', 2000); say(I.pick(L(), S.userName ? key : 'buddy.helloNoName', vars()), { spontaneous: true }); }, 1500);
  }
})();
