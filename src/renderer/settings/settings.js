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
  const connState = { anthropic: {}, openai: {}, local: {} };
  const localUi = { busy: false, results: null, enabling: false, enableOut: '' };

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
    connHost.append(providerCard('anthropic', keys, compact), providerCard('openai', keys, compact),
      h('div', { class: 'howto wide', text: t('set.connectHelp') }), localCard(keys, compact));
  }

  // ---- cartão "No meu PC": OpenClaw / Ollama / LM Studio
  const LOCAL_NAMES = { openclaw: 'OpenClaw', ollama: 'Ollama', lmstudio: 'LM Studio', custom: 'servidor local' };
  const localErr = (m) => ({ offline: t('set.local.offline'), token: t('set.local.badToken'), 'needs-api': t('set.local.needsApi') }[m] || m);

  async function findLocal() {
    localUi.busy = true; refreshConn();
    const r = await bitu.invoke('local:detect');
    localUi.busy = false;
    localUi.results = Array.isArray(r) ? r : [];
    refreshConn();
  }

  async function connectLocal(cfg) {
    const r = await bitu.invoke('local:connect', cfg);
    if (r && r.ok) { localUi.results = null; connState.local = {}; }
    refreshConn();
  }

  function localCard(keys, compact) {
    const L = S.local || {};
    const st = connState.local;
    const connected = keys.local;
    const pill = st.state === 'checking'
      ? h('span', { class: 'pill wait', text: t('set.checking') })
      : h('span', { class: 'pill ' + (connected ? 'ok' : ''), text: connected ? t('set.connectedOk') : t('set.notConnected') });
    const card = h('div', { class: 'prov wide' + (S.provider === 'local' ? ' active' : '') },
      h('div', { class: 'head' }, h('b', { text: t('set.local.title') }), pill),
      h('div', { class: 'note', text: t('set.local.note') }));

    if (connected) {
      card.append(h('div', { class: 'msg' }, h('b', { text: t('set.local.at', { name: LOCAL_NAMES[L.kind] || L.kind }) }), ' · ', h('code', { text: L.baseUrl })));
      if (!compact) {
        const sel = h('select', { onchange: (e) => save({ models: { local: e.target.value } }) }, h('option', { text: S.models.local || '…', value: S.models.local || '' }));
        bitu.invoke('models:list', 'local').then(list => {
          if (!Array.isArray(list) || !list.length) return;
          sel.innerHTML = '';
          for (const m of list) sel.append(h('option', { value: m.id, text: m.name, selected: m.id === S.models.local }));
          if (!list.some(m => m.id === S.models.local)) sel.prepend(h('option', { value: S.models.local, text: S.models.local, selected: true }));
        });
        card.append(h('div', {}, h('label', { class: 'field', text: t('set.model') }), sel));
      }
      card.append(h('label', { class: 'use' }, h('input', { type: 'checkbox', checked: Boolean(L.vision), onchange: (e) => save({ local: { vision: e.target.checked } }) }), t('set.local.vision')));
      card.append(h('div', { class: 'btns' },
        h('button', { class: 'btn', text: t('set.local.findAgain'), onclick: findLocal }),
        h('button', { class: 'btn ghost', text: t('set.disconnect'), onclick: async () => { await bitu.invoke('local:disconnect'); refreshConn(); } })));
    } else if (!localUi.results) {
      card.append(h('div', { class: 'btns' }, h('button', { class: 'btn primary', text: localUi.busy ? t('set.local.searching') : t('set.local.find'), disabled: localUi.busy, onclick: findLocal })));
    }

    if (localUi.results) {
      const list = h('div', { class: 'found' });
      const usable = localUi.results.filter(r => r.state !== 'off');
      for (const r of localUi.results) {
        const row = h('div', { class: 'found-row' + (r.state === 'off' ? ' off' : '') }, h('b', { text: r.name }));
        if (r.state === 'ready') {
          row.append(h('span', { class: 'muted', text: t('set.local.models', { n: r.models.length }) }),
            h('button', { class: 'btn primary', text: t('set.local.use', { name: r.name }), onclick: () => connectLocal({ kind: r.kind, baseUrl: r.baseUrl }) }));
        } else if (r.state === 'needs-api') {
          const box = h('div', { class: 'grow' }, h('div', { class: 'note', text: t('set.local.needsApi') }),
            h('code', { class: 'cmd', text: 'openclaw config set gateway.http.endpoints.chatCompletions.enabled true' }));
          if (localUi.enableOut) box.append(h('pre', { class: 'out', text: localUi.enableOut }));
          row.append(box, h('button', { class: 'btn primary', text: localUi.enabling ? t('set.local.enabling') : t('set.local.enable'), disabled: localUi.enabling || info.platform !== 'win32', onclick: async () => {
            localUi.enabling = true; localUi.enableOut = ''; refreshConn();
            const res = await bitu.invoke('local:enable-openclaw');
            localUi.enabling = false;
            localUi.enableOut = (res && (res.output || res.error)) || '';
            if (res && Array.isArray(res.detected)) localUi.results = res.detected;
            refreshConn();
          } }));
        } else if (r.state === 'needs-token') {
          const tok = h('input', { type: 'password', placeholder: 'token', autocomplete: 'off', spellcheck: 'false' });
          row.append(h('div', { class: 'grow' }, h('div', { class: 'note', text: t('set.local.needsToken') }), tok),
            h('button', { class: 'btn primary', text: t('set.connectBtn'), onclick: () => connectLocal({ kind: r.kind, baseUrl: r.baseUrl, token: tok.value.trim() }) }));
        } else if (r.state === 'error') {
          row.append(h('span', { class: 'muted', text: t('set.local.offline') }));
        } else {
          row.append(h('span', { class: 'muted', text: t('set.local.off') }));
        }
        list.append(row);
      }
      card.append(list);
      if (!usable.length) {
        card.append(h('div', { class: 'note', text: t('set.local.noneFound') }), h('div', { class: 'btns' },
          h('button', { class: 'btn', text: t('set.local.dlOpenclaw'), onclick: () => bitu.invoke('open:external', 'https://openclaw.ai') }),
          h('button', { class: 'btn', text: t('set.local.dlOllama'), onclick: () => bitu.invoke('open:external', 'https://ollama.com/download') })));
      }
      card.append(h('div', { class: 'btns' }, h('button', { class: 'btn', text: localUi.busy ? t('set.local.searching') : t('set.local.findAgain'), disabled: localUi.busy, onclick: findLocal })));
    }

    if (st.state === 'error') card.append(h('div', { class: 'msg err', text: localErr(st.message) }));

    card.append(aiInstallPanel(connected));

    // configurar à mão
    const kindSel = h('select', {}, ...['openclaw', 'ollama', 'lmstudio', 'custom'].map(k => h('option', { value: k, text: LOCAL_NAMES[k], selected: (L.kind || 'openclaw') === k })));
    const url = h('input', { type: 'text', value: L.baseUrl || 'http://127.0.0.1:18789/v1', spellcheck: 'false' });
    kindSel.onchange = () => { url.value = { openclaw: 'http://127.0.0.1:18789/v1', ollama: 'http://127.0.0.1:11434/v1', lmstudio: 'http://127.0.0.1:1234/v1', custom: url.value }[kindSel.value]; };
    const tok = h('input', { type: 'password', placeholder: t('set.local.token'), autocomplete: 'off', spellcheck: 'false' });
    card.append(h('details', {},
      h('summary', { class: 'note', style: 'cursor:pointer', text: t('set.local.manual') }),
      h('div', { class: 'grid2', style: 'margin-top:8px' },
        h('div', {}, h('label', { class: 'field', text: 'App' }), kindSel),
        h('div', {}, h('label', { class: 'field', text: t('set.local.url') }), url),
        h('div', {}, h('label', { class: 'field', text: t('set.local.token') }), tok),
        h('div', { style: 'align-self:end' }, h('button', { class: 'btn', text: t('set.connectBtn'), onclick: () => connectLocal({ kind: kindSel.value, baseUrl: url.value, token: tok.value.trim() }) })))));

    if (!compact) card.append(h('div', { class: 'note', text: `${t('set.local.tip')} ${t('set.local.mic')}` }));

    if (connected) {
      card.append(h('label', { class: 'use' },
        h('input', { type: 'radio', name: 'prov-' + (compact ? 'w' : 'm'), checked: S.provider === 'local', onchange: async () => { await save({ provider: 'local' }); refreshConn(); } }),
        `${t('set.use')} ${LOCAL_NAMES[L.kind] || ''}`));
    }
    return card;
  }

  // ---- instalar IA local sozinho (Ollama + OpenClaw)
  const aiUi = { open: false, running: false, steps: {}, log: [], error: '', done: false, withOpenClaw: true, model: 'gemma4', info: null, els: null };

  function onAiProgress(p) {
    if (p.step && p.step !== 'done' && p.step !== 'error') {
      const cur = aiUi.steps[p.step] || {};
      aiUi.steps[p.step] = { pct: p.pct !== undefined ? p.pct : cur.pct, text: p.text !== undefined && p.text !== null ? p.text : cur.text };
    }
    if (p.log) { aiUi.log.push(p.log); if (aiUi.log.length > 200) aiUi.log.shift(); }
    if (p.error) aiUi.error = p.error;
    if (p.done) { aiUi.running = false; aiUi.done = !p.error; refreshConn(); return; }
    drawAi();
  }

  function drawAi() {
    const E = aiUi.els;
    if (!E) return;
    for (const k of ['ollama', 'model', 'openclaw']) {
      const row = E.rows[k];
      if (!row) continue;
      const stp = aiUi.steps[k];
      row.el.classList.toggle('active', Boolean(stp));
      row.el.classList.toggle('ok', Boolean(stp && stp.pct === 100));
      row.bar.style.width = (stp ? (stp.pct == null ? 100 : stp.pct) : 0) + '%';
      row.bar.classList.toggle('indet', Boolean(stp && stp.pct == null));
      row.text.textContent = stp ? (stp.text || '') : '';
    }
    E.log.textContent = aiUi.log.slice(-40).join('\n');
    E.log.scrollTop = E.log.scrollHeight;
  }

  function aiInstallPanel(connected) {
    const wrap = h('div', { class: 'ai-install' });
    if (!aiUi.open && !aiUi.running) {
      wrap.append(h('div', { class: 'ai-cta' },
        h('div', {}, h('b', { text: t('set.ai.ctaTitle') }), h('div', { class: 'note', text: t('set.ai.ctaDesc') })),
        h('button', { class: 'btn ' + (connected ? '' : 'primary'), text: t('set.ai.open'), onclick: async () => { aiUi.open = true; aiUi.info = await bitu.invoke('ai:info'); refreshConn(); } })));
      return wrap;
    }
    const info = aiUi.info || {};
    if (!aiUi.running) {
      wrap.append(h('div', { class: 'ai-opts' },
        h('label', { class: 'ai-opt' + (aiUi.withOpenClaw ? ' on' : '') },
          h('input', { type: 'radio', name: 'ai-kind', checked: aiUi.withOpenClaw, onchange: () => { aiUi.withOpenClaw = true; refreshConn(); } }),
          h('div', {}, h('b', { text: t('set.ai.full') }), h('div', { class: 'note', text: t('set.ai.fullD') }))),
        h('label', { class: 'ai-opt' + (!aiUi.withOpenClaw ? ' on' : '') },
          h('input', { type: 'radio', name: 'ai-kind', checked: !aiUi.withOpenClaw, onchange: () => { aiUi.withOpenClaw = false; refreshConn(); } }),
          h('div', {}, h('b', { text: t('set.ai.light') }), h('div', { class: 'note', text: t('set.ai.lightD') })))));
      const known = (info.models || []).map(m => m.id);
      const custom = h('input', { type: 'text', placeholder: 'ex.: llama3.2', value: known.includes(aiUi.model) ? '' : aiUi.model, oninput: (e) => { aiUi.model = e.target.value.trim() || 'gemma4'; } });
      const sel = h('select', { onchange: (e) => { aiUi.model = e.target.value === '_' ? (custom.value.trim() || 'gemma4') : e.target.value; custom.style.display = e.target.value === '_' ? '' : 'none'; } },
        ...(info.models || []).map(m => h('option', { value: m.id, text: m.label, selected: m.id === aiUi.model })),
        h('option', { value: '_', text: t('set.ai.otherModel'), selected: !known.includes(aiUi.model) }));
      custom.style.display = known.includes(aiUi.model) ? 'none' : '';
      wrap.append(h('div', { class: 'grid2' },
        h('div', {}, h('label', { class: 'field', text: t('set.ai.model') }), sel, custom),
        h('div', { class: 'note', style: 'align-self:end' }, t('set.ai.ram', { gb: info.ramGB || '?' }))));
      if (aiUi.withOpenClaw && info.openclawConfigured) wrap.append(h('p', { class: 'note', text: t('set.ai.keepConfig') }));
      wrap.append(h('p', { class: 'note', text: t('set.ai.what') }));
      if (aiUi.error) wrap.append(h('div', { class: 'msg err', text: aiUi.error }));
      if (aiUi.done) wrap.append(h('div', { class: 'msg', text: t('set.ai.done') }));
      wrap.append(h('div', { class: 'btns' },
        h('button', { class: 'btn primary', text: t('set.ai.go'), disabled: info.supported === false, onclick: async () => {
          aiUi.running = true; aiUi.steps = {}; aiUi.log = []; aiUi.error = ''; aiUi.done = false;
          refreshConn();
          bitu.invoke('ai:install', { withOpenClaw: aiUi.withOpenClaw, model: aiUi.model });
        } }),
        h('button', { class: 'btn ghost', text: t('set.cancel'), onclick: () => { aiUi.open = false; refreshConn(); } })));
      if (info.supported === false) wrap.append(h('p', { class: 'note', text: t('set.ov.winOnly') }));
      aiUi.els = null;
      return wrap;
    }
    // rodando: passos + log
    const rows = {};
    const list = h('div', { class: 'ai-steps' });
    for (const k of aiUi.withOpenClaw ? ['ollama', 'model', 'openclaw'] : ['ollama', 'model']) {
      const bar = h('i'), text = h('span', { class: 'muted' });
      const el = h('div', { class: 'ai-step' }, h('b', { text: t('set.ai.step.' + k) }), h('div', { class: 'bar' }, bar), text);
      rows[k] = { el, bar, text };
      list.append(el);
    }
    const logEl = h('pre', { class: 'out' });
    aiUi.els = { rows, log: logEl };
    wrap.append(h('p', { class: 'note', text: t('set.ai.running') }), list, logEl,
      h('div', { class: 'btns' }, h('button', { class: 'btn ghost', text: t('set.cancel'), onclick: () => bitu.invoke('ai:cancel') })));
    setTimeout(drawAi, 0);
    return wrap;
  }

  function connectionBlock(compact) {
    connHost = h('div', { class: 'providers', 'data-compact': compact ? '1' : '0' });
    refreshConn();
    return connHost;
  }

  function buildConnection(c) {
    c.append(h('h2', { text: t('set.connection') }), h('p', { class: 'lead', text: t('set.provider') }), connectionBlock(false));
  }

  bitu.on('connect:status', (st) => {
    if (st.provider === 'all') { connState.anthropic = {}; connState.openai = {}; connState.local = {}; }
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

    function shirtEditor() {
      const sh = { on: false, style: 'listras', c1: '#C8102E', c2: '#111111', c3: '#FFFFFF', number: '10', showNumber: true, ...(S.avatar.shirt || {}) };
      const setShirt = (patch) => update({ kind: 'builtin', shirt: { ...sh, ...patch } });
      const box = h('div', { class: 'shirt-box' });
      box.append(h('div', { class: 'row' },
        h('div', { class: 'grow' }, h('div', { class: 't', text: t('set.shirt') }), h('div', { class: 'd', text: t('set.shirtD') })),
        toggle(sh.on, (v) => setShirt({ on: v }))));
      if (!sh.on) return box;
      const presets = h('div', { class: 'opts' });
      for (const p of A.SHIRT_PRESETS) {
        const th = h('div', { class: 'th' });
        th.innerHTML = A.svg({ ...S.avatar, kind: 'builtin', accessory: 'none', shirt: { ...sh, ...p, on: true } });
        const on = sh.c1 === p.c1 && sh.c2 === p.c2 && sh.style === p.style;
        presets.append(h('button', { class: 'opt' + (on ? ' on' : ''), onclick: () => setShirt({ style: p.style, c1: p.c1, c2: p.c2, c3: p.c3 }) }, th, A.label(L(), p.id)));
      }
      const styles = h('div', { class: 'opts' });
      for (const st of A.SHIRT_STYLES) {
        const th = h('div', { class: 'th' });
        th.innerHTML = A.svg({ ...S.avatar, kind: 'builtin', accessory: 'none', shirt: { ...sh, style: st, on: true } });
        styles.append(h('button', { class: 'opt' + (sh.style === st ? ' on' : ''), onclick: () => setShirt({ style: st }) }, th, A.label(L(), st)));
      }
      const color = (key, label) => h('label', { class: 'shirt-color' }, h('input', { type: 'color', value: sh[key], onchange: (e) => setShirt({ [key]: e.target.value }) }), label);
      box.append(
        h('div', { class: 'field-block' }, h('label', { class: 'field', text: t('set.shirtPresets') }), presets),
        h('div', { class: 'field-block' }, h('label', { class: 'field', text: t('set.shirtStyle') }), styles),
        h('div', { class: 'field-block shirt-row' },
          color('c1', t('set.shirtC1')), color('c2', t('set.shirtC2')), color('c3', t('set.shirtC3')),
          h('label', { class: 'shirt-color' }, h('input', { type: 'text', value: sh.number, maxlength: 2, inputmode: 'numeric', style: 'width:64px;text-align:center;font-weight:800',
            onchange: (e) => setShirt({ number: e.target.value.replace(/\D/g, '').slice(0, 2), showNumber: e.target.value.trim() !== '' }) }), t('set.shirtNumber'))),
        h('p', { class: 'note', text: t('set.shirtNote') }));
      return box;
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
          right.append(shirtEditor());
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
  // ---- voz e microfone offline (Piper + Whisper)
  const voiceUi = { running: false, pct: null, text: '', error: '', bar: null, label: null };
  const LANG_PRE = { 'pt-BR': 'pt_', en: 'en_', es: 'es_' };

  async function offlineVoiceBox() {
    const st = await bitu.invoke('voice:status');
    V.setInstalledLocal(st.voices);
    const box = h('div', { class: 'box section offline' });
    box.append(h('div', { class: 'off-head' },
      h('div', {}, h('div', { class: 't', text: t('set.ov.title') }), h('div', { class: 'd', text: t('set.ov.desc') })),
      h('span', { class: 'pill ' + (st.tts && st.voices.length ? 'ok' : ''), text: st.tts && st.voices.length ? t('set.ov.on') : t('set.ov.off') })));
    if (!st.supported) { box.append(h('p', { class: 'note', text: t('set.ov.winOnly') })); return box; }

    const pre = LANG_PRE[L()] || 'pt_';
    const voices = st.catalog.voices.filter(x => x.id.startsWith(pre)).concat(st.catalog.voices.filter(x => !x.id.startsWith(pre)));
    const currentVoice = S.voice.localVoice && S.voice.localVoice.startsWith(pre) ? S.voice.localVoice : voices[0].id;
    const vSel = h('select', {}, ...voices.map(x => h('option', { value: x.id, selected: x.id === currentVoice,
      text: `${x.name} · ${x.id.slice(0, 5).replace('_', '-')}${st.voices.includes(x.id) ? ' ✓' : ` (~${x.mb} MB)`}` })));
    const mSel = h('select', {}, ...st.catalog.sttModels.map(m => h('option', { value: m.id, selected: m.id === (S.voice.sttModel || 'base'),
      text: `${t('set.ov.stt.' + m.id)}${st.sttModels.includes(m.id) ? ' ✓' : ` (~${m.mb} MB)`}` })));
    box.append(h('div', { class: 'grid2' },
      h('div', {}, h('label', { class: 'field', text: t('set.ov.voice') }), vSel),
      h('div', {}, h('label', { class: 'field', text: t('set.ov.mic') }), mSel)));

    const need = () => {
      const vi = st.catalog.voices.find(x => x.id === vSel.value);
      const mi = st.catalog.sttModels.find(x => x.id === mSel.value);
      let mb = 0;
      if (!st.tts) mb += 22;
      if (!st.voices.includes(vi.id)) mb += vi.mb;
      if (!st.stt) mb += 6;
      if (!st.sttModels.includes(mi.id)) mb += mi.mb;
      return mb;
    };
    const installBtn = h('button', { class: 'btn primary' });
    const refreshBtn = () => {
      const mb = need();
      installBtn.textContent = voiceUi.running ? t('set.ov.installing') : mb ? t('set.ov.install', { mb }) : t('set.ov.use');
      installBtn.disabled = voiceUi.running;
    };
    vSel.onchange = async () => { refreshBtn(); if (st.voices.includes(vSel.value)) await save({ voice: { localVoice: vSel.value } }); };
    mSel.onchange = async () => { refreshBtn(); if (st.sttModels.includes(mSel.value)) await save({ voice: { sttModel: mSel.value } }); };
    installBtn.onclick = async () => {
      voiceUi.running = true; voiceUi.error = ''; voiceUi.pct = 0; voiceUi.text = '';
      refreshBtn(); drawProgress();
      const r = await bitu.invoke('voice:install', { voice: vSel.value, sttModel: mSel.value });
      voiceUi.running = false;
      if (r && !r.ok) voiceUi.error = r.error || 'erro';
      if (current === 'voice') show('voice');
      if (r && r.ok) V.speak(t('set.voiceTest'), { settings: S });
    };
    refreshBtn();

    voiceUi.bar = h('i');
    voiceUi.label = h('span', { class: 'muted' });
    const prog = h('div', { class: 'progress' }, h('div', { class: 'bar' }, voiceUi.bar), voiceUi.label);
    function drawProgress() {
      prog.style.display = voiceUi.running ? '' : 'none';
      voiceUi.bar.style.width = (voiceUi.pct == null ? 100 : voiceUi.pct) + '%';
      voiceUi.bar.classList.toggle('indet', voiceUi.pct == null);
      voiceUi.label.textContent = voiceUi.text;
    }
    voiceUi.draw = drawProgress;
    drawProgress();

    const installed = st.tts && st.voices.length;
    box.append(h('div', { class: 'btns', style: 'margin-top:12px' }, installBtn,
      installed ? h('button', { class: 'btn', text: t('set.test'), onclick: () => V.speak(t('set.voiceTest'), { settings: { ...S, voice: { ...S.voice, engine: 'local', localVoice: st.voices.includes(vSel.value) ? vSel.value : S.voice.localVoice } } }) }) : null,
      (st.tts || st.stt) ? h('button', { class: 'btn ghost', text: t('set.ov.remove'), onclick: async () => { await bitu.invoke('voice:uninstall'); show('voice'); } }) : null), prog);
    if (voiceUi.error) box.append(h('div', { class: 'msg err', text: voiceUi.error }));
    if (st.stt && st.sttModels.length) {
      box.append(h('div', { style: 'margin-top:10px' }, h('label', { class: 'field', text: t('set.ov.micUse') }),
        h('select', { onchange: (e) => save({ voice: { sttEngine: e.target.value } }) },
          ...['auto', 'local', 'openai'].map(k => h('option', { value: k, text: t('set.ov.micUse.' + k), selected: (S.voice.sttEngine || 'auto') === k })))));
    }
    box.append(h('p', { class: 'note', style: 'margin-top:10px', text: t('set.ov.credits') }));
    return box;
  }

  bitu.on('setup:progress', (p) => {
    if (p.task === 'voice') {
      if (p.pct !== undefined) voiceUi.pct = p.pct;
      if (p.text !== undefined) voiceUi.text = (p.step && t('set.ov.step.' + p.step) !== 'set.ov.step.' + p.step ? t('set.ov.step.' + p.step) + ' · ' : '') + (p.text || '');
      if (voiceUi.draw) voiceUi.draw();
    }
    if (p.task === 'ai') onAiProgress(p);
  });

  async function buildVoice(c) {
    const v = S.voice;
    c.append(h('h2', { text: t('set.voice') }), h('p', { class: 'lead', text: t('set.voiceNote') }));
    c.append(await offlineVoiceBox());
    const box = h('div', { class: 'box section' },
      switchRow(t('set.voiceOn'), '', v.enabled, (x) => save({ voice: { enabled: x } })),
      switchRow(t('set.speakReplies'), '', v.speakReplies, (x) => save({ voice: { speakReplies: x } })));
    c.append(box);

    const engine = h('select', { onchange: async (e) => { await save({ voice: { engine: e.target.value } }); show('voice'); } },
      h('option', { value: 'system', text: t('set.voiceSystem'), selected: v.engine === 'system' }),
      h('option', { value: 'openai', text: t('set.voiceOpenAI'), selected: v.engine === 'openai' }),
      h('option', { value: 'local', text: t('set.voiceLocal'), selected: v.engine === 'local' }));
    const voiceSel = h('select', {});
    if (v.engine === 'local') {
      const st = await bitu.invoke('voice:status');
      if (!st.voices.length) voiceSel.append(h('option', { text: t('set.ov.off'), value: '' }));
      for (const id of st.voices) voiceSel.append(h('option', { value: id, text: (st.catalog.voices.find(x => x.id === id) || {}).name + ' · ' + id.slice(0, 5), selected: v.localVoice === id }));
      voiceSel.onchange = (e) => save({ voice: { localVoice: e.target.value } });
    } else if (v.engine === 'openai') {
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
      v.engine !== 'openai' ? slider(t('set.rate'), v.rate, 0.6, 1.6, 0.05, (x) => save({ voice: { rate: x } }), (x) => x.toFixed(2) + 'x') : null,
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
