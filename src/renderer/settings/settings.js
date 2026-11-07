/* Configurações + assistente de primeira vez. */
(async function () {
  'use strict';
  const { bitu, BituI18n: I, BituAvatar: A, BituVoice: V } = window;
  const params = new URLSearchParams(location.search);

  let S = await bitu.invoke('settings:get');
  let info = await bitu.invoke('app:info');
  const L = () => S.lang;
  const t = (k, v) => I.t(L(), k, v);
  const $ = (id) => document.getElementById(id);

  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'checked' || k === 'value' || k === 'disabled' || k === 'selected') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }

  async function save(patch) {
    S = await bitu.invoke('settings:set', patch);
    return S;
  }

  function toggle(checked, onChange) {
    return h('label', { class: 'sw' }, h('input', { type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked) }), h('span'));
  }
  function switchRow(title, desc, checked, onChange) {
    return h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 't', text: title }), desc ? h('div', { class: 'd', text: desc }) : null), toggle(checked, onChange));
  }
  function slider(label, value, min, max, step, onChange, fmt = (v) => v) {
    const out = h('span', { class: 'muted', text: fmt(value) });
    return h('div', { class: 'field-block' },
      h('label', { class: 'field' }, label, ' ', out),
      h('input', { type: 'range', min, max, step, value, oninput: (e) => { out.textContent = fmt(Number(e.target.value)); }, onchange: (e) => onChange(Number(e.target.value)) }));
  }

  // =========================================================== seções
  const SECTIONS = [
    ['connection', 'set.connection', buildConnection],
    ['avatar', 'set.avatar', buildAvatar],
    ['voice', 'set.voice', buildVoice],
    ['perms', 'set.perms', buildPerms],
    ['personality', 'set.personality', buildPersonality],
    ['general', 'set.general', buildGeneral],
    ['memory', 'set.memory', buildMemory],
    ['about', 'set.about', buildAbout]
  ];
  let current = params.get('tab') || 'connection';

  function renderNav() {
    const nav = $('nav');
    nav.innerHTML = '';
    SECTIONS.forEach(([id, key], i) => {
      nav.append(h('button', { class: id === current ? 'on' : '', onclick: () => show(id) }, h('span', { class: 'n', text: String(i + 1) }), t(key)));
    });
  }

  function show(id) {
    current = SECTIONS.some(s => s[0] === id) ? id : 'connection';
    renderNav();
    const c = $('content');
    c.innerHTML = '';
    const sec = SECTIONS.find(s => s[0] === current);
    sec[2](c);
    c.scrollTop = 0;
  }

  function renderAll() {
    I.apply(L());
    document.documentElement.lang = L();
    A.mount($('logo'), S.avatar);
    show(current);
  }

  // ----------------------------------------------------------- conexão
  const connState = { anthropic: {}, openai: {} };

  function providerCard(provider, keys, compact) {
    const name = provider === 'anthropic' ? 'Claude' : 'ChatGPT';
    const st = connState[provider];
    const connected = keys[provider];
    const pill = st.state === 'waiting' || st.state === 'checking'
      ? h('span', { class: 'pill wait', text: st.state === 'waiting' ? '…' : t('set.checking') })
      : h('span', { class: 'pill ' + (connected ? 'ok' : ''), text: connected ? t('set.connectedOk') : t('set.notConnected') });

    const card = h('div', { class: 'prov' + (S.provider === provider ? ' active' : '') },
      h('div', { class: 'head' }, h('b', { text: name }), pill),
      h('div', { class: 'note', text: t(provider === 'anthropic' ? 'set.claudeNote' : 'set.gptNote') })
    );

    if (st.state === 'waiting' || st.state === 'checking') {
      card.append(h('div', { class: 'msg', text: st.state === 'waiting' ? t('set.waiting') : t('set.checking') }));
      card.append(h('div', {}, h('button', { class: 'btn', text: t('set.cancel'), onclick: async () => { await bitu.invoke('connect:cancel'); st.state = ''; refreshConn(); } })));
    } else {
      card.append(h('div', { class: 'btns' },
        h('button', { class: 'btn primary', text: connected ? t('set.reconnect') : t('set.connectBtn'), onclick: () => bitu.invoke('connect:start', provider) }),
        connected ? h('button', { class: 'btn ghost', text: t('set.disconnect'), onclick: async () => { await bitu.invoke('keys:clear', provider); refreshConn(); } }) : null
      ));
    }
    if (st.state === 'error') card.append(h('div', { class: 'msg err', text: st.message }));
    if (st.state === 'timeout') card.append(h('div', { class: 'msg err', text: t('set.timeout') }));

    const manualInput = h('input', { type: 'password', placeholder: provider === 'anthropic' ? 'sk-ant-…' : 'sk-…', autocomplete: 'off', spellcheck: 'false' });
    card.append(h('details', {},
      h('summary', { class: 'note', style: 'cursor:pointer', text: t('set.pasteManual') }),
      h('div', { class: 'manual', style: 'margin-top:8px' }, manualInput,
        h('button', { class: 'btn', text: t('set.save'), onclick: async () => { if (manualInput.value.trim()) { await bitu.invoke('keys:set', provider, manualInput.value.trim()); manualInput.value = ''; } } }))
    ));

    if (connected && !compact) {
      const sel = h('select', { onchange: (e) => save({ models: { [provider]: e.target.value } }) }, h('option', { text: S.models[provider] || '…', value: S.models[provider] || '' }));
      bitu.invoke('models:list', provider).then(list => {
        if (!Array.isArray(list) || !list.length) return;
        sel.innerHTML = '';
        for (const m of list) sel.append(h('option', { value: m.id, text: m.name, selected: m.id === S.models[provider] }));
        if (!list.some(m => m.id === S.models[provider])) sel.prepend(h('option', { value: S.models[provider], text: S.models[provider], selected: true }));
      });
      card.append(h('div', {}, h('label', { class: 'field', text: t('set.model') }), sel));
    }

    card.append(h('label', { class: 'use' },
      h('input', { type: 'radio', name: 'prov-' + (compact ? 'w' : 'm'), checked: S.provider === provider, onchange: async () => { await save({ provider }); refreshConn(); } }),
      `${t('set.use')} ${name}`));
    return card;
  }

  let connHost = null;
  async function refreshConn() {
    if (!connHost) return;
    const keys = await bitu.invoke('keys:status');
    const compact = connHost.dataset.compact === '1';
    connHost.innerHTML = '';
    connHost.append(providerCard('anthropic', keys, compact), providerCard('openai', keys, compact));
  }

  function connectionBlock(compact) {
    connHost = h('div', { class: 'providers', 'data-compact': compact ? '1' : '0' });
    refreshConn();
    return h('div', {}, connHost, h('div', { class: 'howto', text: t('set.connectHelp') }));
  }

  function buildConnection(c) {
    c.append(h('h2', { text: t('set.connection') }), h('p', { class: 'lead', text: t('set.provider') }), connectionBlock(false));
  }

  bitu.on('connect:status', (st) => {
    if (st.provider === 'all') { connState.anthropic = {}; connState.openai = {}; }
    else if (connState[st.provider]) connState[st.provider] = st;
    refreshConn();
  });

  // ----------------------------------------------------------- avatar
  function avatarBuilder(full) {
    const wrap = h('div', { class: 'av-wrap' });
    const stage = h('div', { class: 'stage' });
    const preview = h('div', { class: 'preview' }, stage);
    const mountPreview = () => { const set = A.mount(stage, S.avatar); stage.dataset.state = 'idle'; return set; };
    mountPreview();

    if (full) {
      const emos = ['feliz', 'rindo', 'surpreso', 'apaixonado', 'tonto', 'oculos_escuros', 'triste', 'bravo'];
      const row = h('div', { class: 'emos' });
      const states = [['dance', '♪'], ['walk', '→'], ['sleep', 'z']];
      for (const [st, ic] of states) row.append(h('button', { text: ic, title: st, onclick: () => { stage.dataset.emo = ''; stage.dataset.state = st; setTimeout(() => { stage.dataset.state = 'idle'; }, 3000); } }));
      for (const e of emos) row.append(h('button', { text: e.replace('_', ' '), onclick: () => { stage.dataset.state = 'idle'; stage.dataset.emo = e; setTimeout(() => { stage.dataset.emo = ''; }, 2500); } }));
      preview.append(row);
    }

    const right = h('div');
    const update = async (patch) => { await save({ avatar: patch }); mountPreview(); drawRight(); };

    function optGroup(label, list, key) {
      const opts = h('div', { class: 'opts' });
      for (const v of list) {
        const th = h('div', { class: 'th' });
        th.innerHTML = A.svg({ ...S.avatar, kind: 'builtin', [key]: v });
        opts.append(h('button', { class: 'opt' + (S.avatar[key] === v ? ' on' : ''), onclick: () => update({ kind: 'builtin', [key]: v }) }, th, A.label(L(), v)));
      }
      return h('div', { class: 'field-block' }, h('label', { class: 'field', text: label }), opts);
    }

    function drawRight() {
      right.innerHTML = '';
      const kind = S.avatar.kind || 'builtin';
      if (full) {
        right.append(h('div', { class: 'seg' },
          ...[['builtin', 'set.avatarBuiltin'], ['image', 'set.avatarImage'], ['pack', 'set.avatarPack']].map(([k, lab]) =>
            h('button', { class: kind === k ? 'on' : '', text: t(lab), onclick: async () => {
              if (k === 'builtin') return update({ kind: 'builtin' });
              const res = await bitu.invoke('avatar:import', k);
              if (res && !res.error) update(res);
              else if (res && res.error) alert(res.error);
            } }))));
      }
      if (kind === 'builtin' || !full) {
        right.append(optGroup(t('set.shape'), A.OPTIONS.shapes, 'shape'));
        const sw = h('div', { class: 'swatches' });
        for (const col of A.OPTIONS.colors) sw.append(h('button', { class: 'swatch' + (S.avatar.color === col ? ' on' : ''), style: `background:${col}`, 'aria-label': col, onclick: () => update({ kind: 'builtin', color: col }) }));
        sw.append(h('input', { type: 'color', value: S.avatar.color, onchange: (e) => update({ kind: 'builtin', color: e.target.value }) }));
        right.append(h('div', { class: 'field-block' }, h('label', { class: 'field', text: t('set.color') }), sw));
        if (full) {
          right.append(optGroup(t('set.eyes'), A.OPTIONS.eyes, 'eyes'));
          right.append(optGroup(t('set.accessory'), A.OPTIONS.accessories, 'accessory'));
          right.append(switchRow(t('set.cheeks'), '', S.avatar.cheeks !== false, (v) => update({ cheeks: v })));
        }
        right.append(h('div', { class: 'btns', style: 'margin:6px 0 14px' }, h('button', { class: 'btn', text: t('set.random'), onclick: () => {
          const r = (a) => a[Math.floor(Math.random() * a.length)];
          update({ kind: 'builtin', shape: r(A.OPTIONS.shapes), color: r(A.OPTIONS.colors), eyes: r(A.OPTIONS.eyes), accessory: r(A.OPTIONS.accessories) });
        } })));
      } else {
        right.append(h('p', { class: 'lead', text: kind === 'pack' ? 'bitu-avatar.json + idle / talk / walk / dance / sleep / think' : t('set.importImg') }));
        right.append(h('button', { class: 'btn', text: kind === 'pack' ? t('set.importPack') : t('set.importImg'), onclick: async () => {
          const res = await bitu.invoke('avatar:import', kind);
          if (res && !res.error) update(res);
        } }));
      }
      if (full) right.append(slider(t('set.size'), S.avatar.scale || 1, 0.6, 1.4, 0.05, (v) => update({ scale: v }), (v) => Math.round(v * 100) + '%'));
    }
    drawRight();
    wrap.append(preview, right);
    return wrap;
  }

  function namesBlock() {
    return h('div', { class: 'grid2' },
      h('div', {}, h('label', { class: 'field', text: t('set.name') }), h('input', { type: 'text', value: S.assistantName, maxlength: 24, onchange: (e) => save({ assistantName: e.target.value.trim() || 'Bitu' }) })),
      h('div', {}, h('label', { class: 'field', text: t('set.userName') }), h('input', { type: 'text', value: S.userName, maxlength: 40, onchange: (e) => save({ userName: e.target.value.trim() }) })));
  }

  function buildAvatar(c) {
    c.append(h('h2', { text: t('set.avatar') }), h('div', { class: 'section' }, namesBlock()), avatarBuilder(true));
  }

  // ----------------------------------------------------------- voz
  async function buildVoice(c) {
    const v = S.voice;
    c.append(h('h2', { text: t('set.voice') }), h('p', { class: 'lead', text: t('set.voiceNote') }));
    const box = h('div', { class: 'box section' },
      switchRow(t('set.voiceOn'), '', v.enabled, (x) => save({ voice: { enabled: x } })),
      switchRow(t('set.speakReplies'), '', v.speakReplies, (x) => save({ voice: { speakReplies: x } })));
    c.append(box);

    const engine = h('select', { onchange: async (e) => { await save({ voice: { engine: e.target.value } }); show('voice'); } },
      h('option', { value: 'system', text: t('set.voiceSystem'), selected: v.engine === 'system' }),
      h('option', { value: 'openai', text: t('set.voiceOpenAI'), selected: v.engine === 'openai' }));
    const voiceSel = h('select', {});
    if (v.engine === 'openai') {
      for (const name of ['coral', 'nova', 'shimmer', 'sage', 'ballad', 'alloy', 'ash', 'echo', 'fable', 'onyx', 'verse']) {
        voiceSel.append(h('option', { value: name, text: name, selected: v.openaiVoice === name }));
      }
      voiceSel.onchange = (e) => save({ voice: { openaiVoice: e.target.value } });
    } else {
      const list = await V.voicesFor(L());
      if (!list.length) voiceSel.append(h('option', { text: '(padrão do Windows)', value: '' }));
      for (const vo of list) voiceSel.append(h('option', { value: vo.name, text: `${vo.name} (${vo.lang})`, selected: v.systemVoice === vo.name }));
      voiceSel.onchange = (e) => save({ voice: { systemVoice: e.target.value } });
    }
    const keys = await bitu.invoke('keys:status');
    c.append(h('div', { class: 'box section' },
      h('div', { class: 'grid2' },
        h('div', {}, h('label', { class: 'field', text: t('set.voiceEngine') }), engine),
        h('div', {}, h('label', { class: 'field', text: t('set.voicePick') }), voiceSel)),
      v.engine === 'openai' && !keys.openai ? h('p', { class: 'note', style: 'color:#C0392B', text: t('chat.noMic').replace(/\(.*\)/, '') }) : null,
      h('div', { style: 'height:12px' }),
      v.engine === 'system' ? slider(t('set.rate'), v.rate, 0.6, 1.6, 0.05, (x) => save({ voice: { rate: x } }), (x) => x.toFixed(2) + 'x') : null,
      v.engine === 'system' ? slider(t('set.pitch'), v.pitch, 0.5, 1.6, 0.05, (x) => save({ voice: { pitch: x } }), (x) => x.toFixed(2)) : null,
      slider(t('set.volume'), v.volume, 0, 1, 0.05, (x) => save({ voice: { volume: x } }), (x) => Math.round(x * 100) + '%'),
      h('button', { class: 'btn primary', text: t('set.test'), onclick: () => V.speak(t('set.voiceTest'), { settings: S }) })
    ));
  }

  // ----------------------------------------------------------- permissões
  function buildPerms(c) {
    c.append(h('h2', { text: t('set.perms') }), h('p', { class: 'lead', html: `${t('set.stopHint')} <span class="kbd">${S.shortcuts.stop.replace('Control', 'Ctrl')}</span>` }));
    const box = h('div', { class: 'box section' });
    for (const p of ['screen', 'control', 'commands', 'files', 'music', 'notifications']) {
      box.append(switchRow(t('set.perm.' + p), t('set.perm.' + p + 'D'), S.perms[p], (x) => save({ perms: { [p]: x } })));
    }
    c.append(box);
    c.append(h('div', { class: 'box section' }, switchRow(t('set.confirm'), t('set.confirmD'), S.confirmActions, (x) => save({ confirmActions: x }))));
    if (info.platform === 'win32' && S.perms.notifications && info.notifMode === 'titles') {
      c.append(h('p', { class: 'lead', text: 'Dica: em Configurações do Windows > Privacidade e segurança > Notificações, permita o acesso às notificações para eu conseguir ler de todos os apps.' }));
    }
  }

  // ----------------------------------------------------------- jeito
  function buildPersonality(c) {
    const P = S.personality;
    c.append(h('h2', { text: t('set.personality') }));
    const labels = [t('set.humor0'), t('set.humor1'), t('set.humor2'), t('set.humor3')];
    c.append(h('div', { class: 'box section' }, slider(t('set.humor'), P.humor, 0, 3, 1, (x) => save({ personality: { humor: x } }), (x) => labels[x])));
    c.append(h('div', { class: 'box section' },
      switchRow(t('set.commentMusic'), '', P.commentMusic, (x) => save({ personality: { commentMusic: x } })),
      switchRow(t('set.readNotif'), '', P.readNotificationText, (x) => save({ personality: { readNotificationText: x } })),
      switchRow(t('set.wellbeing'), '', P.wellbeing, (x) => save({ personality: { wellbeing: x } })),
      switchRow(t('set.roam'), '', P.roam, (x) => save({ personality: { roam: x } })),
      switchRow(t('set.sneeze'), '', P.sneeze, (x) => save({ personality: { sneeze: x } })),
      switchRow(t('set.dnd'), '', S.dnd, (x) => save({ dnd: x }))
    ));
  }

  // ----------------------------------------------------------- geral
  function langPicker(onPick) {
    return h('div', { class: 'langs' }, ...I.LANGS.map(([code, name]) =>
      h('button', { class: S.lang === code ? 'on' : '', text: name, onclick: async () => { await save({ lang: code }); onPick(); } })));
  }

  function buildGeneral(c) {
    c.append(h('h2', { text: t('set.general') }));
    c.append(h('div', { class: 'section' }, h('h3', { text: t('set.lang') }), langPicker(renderAll)));
    c.append(h('div', { class: 'box section' }, switchRow(t('set.startWin'), '', S.startWithWindows, (x) => save({ startWithWindows: x }))));
    const sc = h('div', { class: 'box section' });
    for (const k of ['chat', 'listen', 'stop']) {
      sc.append(h('div', { class: 'row' }, h('div', { class: 'grow t', text: t('set.sc.' + k) }),
        h('input', { type: 'text', value: S.shortcuts[k], style: 'max-width:220px;font-family:var(--mono)', onchange: (e) => save({ shortcuts: { [k]: e.target.value.trim() } }) })));
    }
    c.append(h('div', { class: 'section' }, h('h3', { text: t('set.shortcuts') }), sc));
  }

  // ----------------------------------------------------------- memória
  async function buildMemory(c) {
    c.append(h('h2', { text: t('set.memory') }), h('p', { class: 'lead', text: `${t('set.mem.where')} ${t('set.mem.sent')}` }));
    const notesBox = h('div', { class: 'notes' });
    const drawNotes = (notes) => {
      notesBox.innerHTML = '';
      if (!notes.length) notesBox.append(h('div', { class: 'memo' }, h('span', { class: 'muted', text: t('set.mem.empty') })));
      for (const n of notes.slice().reverse()) {
        notesBox.append(h('div', { class: 'memo' }, h('span', { text: n.text }), h('button', { text: '×', 'aria-label': 'remover', onclick: async () => drawNotes(await bitu.invoke('notes:remove', n.id)) })));
      }
    };
    drawNotes(await bitu.invoke('notes:list'));
    c.append(h('div', { class: 'section' }, h('h3', { text: t('set.mem.notes') }), h('div', { class: 'box' }, notesBox)));
    c.append(h('div', { class: 'section btns' },
      h('button', { class: 'btn', text: t('set.mem.export'), onclick: () => bitu.invoke('memory:export') }),
      h('button', { class: 'btn', text: t('set.mem.folder'), onclick: () => bitu.invoke('memory:open-folder') }),
      h('button', { class: 'btn', text: t('set.mem.clear'), onclick: async () => { if (confirm(t('chat.clearConfirm'))) await bitu.invoke('chat:clear'); } }),
      h('button', { class: 'btn danger', text: t('set.mem.wipe'), onclick: async () => { if (confirm(t('set.mem.wipeConfirm'))) { await bitu.invoke('memory:wipe'); show('memory'); } } })
    ));
    c.append(h('p', { class: 'muted', style: 'font-size:12.5px', text: `${info.dataDir} · ${info.encrypted ? 'criptografia do Windows ativa' : 'criptografia indisponível neste sistema'}` }));
  }

  // ----------------------------------------------------------- sobre
  function buildAbout(c) {
    const stage = h('div', { style: 'width:140px;height:140px' });
    A.mount(stage, S.avatar);
    c.append(h('h2', { text: 'Bitu ' + info.version }), stage,
      h('p', { class: 'lead', text: t('set.about.text') }),
      h('div', { class: 'btns' },
        h('button', { class: 'btn', text: 'GitHub', onclick: () => bitu.invoke('open:external', 'https://github.com/sdalberto/bitu') }),
        h('button', { class: 'btn', text: 'Anthropic Console', onclick: () => bitu.invoke('open:external', 'https://console.anthropic.com') }),
        h('button', { class: 'btn', text: 'OpenAI Platform', onclick: () => bitu.invoke('open:external', 'https://platform.openai.com') })));
  }

  // =========================================================== assistente de primeira vez
  let step = 0;
  const STEPS = ['welcome', 'names', 'connect', 'avatar', 'done'];

  function wizard() {
    const w = $('wizard');
    w.hidden = false;
    w.innerHTML = '';
    const box = h('div', { class: 'wz' }, h('div', { class: 'steps' }, ...STEPS.map((_, i) => h('i', { class: i <= step ? 'on' : '' }))));
    const id = STEPS[step];
    const hero = (title, lead) => {
      const st = h('div', { class: 'stage' });
      A.mount(st, S.avatar);
      st.dataset.emo = id === 'done' ? 'comemorando' : 'feliz';
      return h('div', { class: 'hero' }, st, h('div', {}, h('h1', { text: title }), h('p', { class: 'lead', text: lead })));
    };
    if (id === 'welcome') box.append(hero(t('onb.welcome'), t('onb.welcomeD')), h('h3', { text: t('onb.lang') }), langPicker(wizard));
    if (id === 'names') box.append(h('h1', { text: t('onb.names') }), namesBlock());
    if (id === 'connect') box.append(h('h1', { text: t('onb.connect') }), connectionBlock(true));
    if (id === 'avatar') box.append(h('h1', { text: t('onb.avatar') }), avatarBuilder(false));
    if (id === 'done') box.append(hero(t('onb.done'), t('onb.doneD')));

    const next = async () => {
      if (step < STEPS.length - 1) { step++; wizard(); return; }
      await bitu.invoke('onboarding:done');
      w.hidden = true;
      renderAll();
    };
    box.append(h('div', { class: 'foot' },
      step > 0 ? h('button', { class: 'btn ghost', text: t('onb.back'), onclick: () => { step--; wizard(); } }) : h('span'),
      h('div', { class: 'btns' },
        id === 'connect' ? h('button', { class: 'btn ghost', text: t('onb.skip'), onclick: next }) : null,
        h('button', { class: 'btn primary', text: step === STEPS.length - 1 ? t('onb.finish') : t('onb.next'), onclick: next }))));
    w.append(box);
  }

  // =========================================================== início
  $('w-close').onclick = () => bitu.invoke('window:close');
  $('w-min').onclick = () => bitu.invoke('window:minimize');
  bitu.on('settings:tab', (tab) => show(tab));
  bitu.on('settings:changed', (s) => {
    const langChanged = s.lang !== S.lang;
    S = s;
    if (langChanged && $('wizard').hidden) renderAll();
  });

  renderAll();
  if (params.get('onboarding') === '1') wizard();
})();
