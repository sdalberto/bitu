'use strict';
const path = require('path');
const fs = require('fs');
const {
  app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell, clipboard,
  globalShortcut, dialog, protocol, net, session, powerMonitor
} = require('electron');
const { pathToFileURL } = require('url');

const { Store } = require('./store');
const providers = require('./providers');
const { Watchers } = require('./watchers');
const winactions = require('./winactions');
const { buildTools } = require('./tools');
const { Agent } = require('./agent');
const i18n = require('../renderer/shared/i18n');

const DEV = process.argv.includes('--dev');
const ROOT = path.join(__dirname, '..', '..');
const ICON = path.join(ROOT, 'build', 'icon.png');
const BUDDY_W = 300;
const BUDDY_H = 360;

protocol.registerSchemesAsPrivileged([
  { scheme: 'bitu-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => openChat(true));
}

app.setAppUserModelId('com.ideiaslivres.bitu');

let store, watchers, agent, tray;
let buddyWin = null, chatWin = null, settingsWin = null;
let lastShot = null;
let connectWatch = null;
const pendingConfirms = new Map();
const reminderTimers = new Map();

const t = (key, vars) => i18n.t(store ? store.settings.lang : 'pt-BR', key, vars);

// ------------------------------------------------------------------ janelas
function baseWebPrefs() {
  return {
    preload: path.join(__dirname, '..', 'preload', 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    spellcheck: false,
    backgroundThrottling: false
  };
}

function lockdown(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });
  if (DEV) win.webContents.on('console-message', (_e, ...args) => console.log('[renderer]', ...args.slice(1, 2)));
}

function page(name, query = {}) {
  const file = path.join(__dirname, '..', 'renderer', name, 'index.html');
  const url = pathToFileURL(file);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return url.toString();
}

function createBuddy() {
  const wa = screen.getPrimaryDisplay().workArea;
  const saved = store.settings.position || {};
  const x = Number.isFinite(saved.x) ? Math.min(Math.max(saved.x, wa.x), wa.x + wa.width - BUDDY_W) : wa.x + wa.width - BUDDY_W - 6;
  buddyWin = new BrowserWindow({
    width: BUDDY_W, height: BUDDY_H, x, y: wa.y + wa.height - BUDDY_H,
    transparent: true, frame: false, resizable: false, movable: false, minimizable: false, maximizable: false,
    skipTaskbar: true, hasShadow: false, focusable: false, show: false, alwaysOnTop: true,
    backgroundColor: '#00000000', webPreferences: baseWebPrefs()
  });
  buddyWin.setAlwaysOnTop(true, 'screen-saver');
  buddyWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  buddyWin.setIgnoreMouseEvents(true, { forward: true });
  lockdown(buddyWin);
  buddyWin.loadURL(page('buddy'));
  buddyWin.once('ready-to-show', () => buddyWin.showInactive());
  buddyWin.on('closed', () => { buddyWin = null; });
  // reforça o "sempre no topo" (a barra de tarefas às vezes passa por cima)
  setInterval(() => { if (buddyWin && buddyWin.isVisible()) buddyWin.moveTop(); }, 5000);
}

function positionChat() {
  if (!chatWin || !buddyWin) return;
  const wa = screen.getDisplayMatching(buddyWin.getBounds()).workArea;
  const b = buddyWin.getBounds();
  const [w, h] = chatWin.getSize();
  let x = b.x - w + 70;
  if (x < wa.x + 8) x = b.x + b.width - 70;
  x = Math.min(Math.max(x, wa.x + 8), wa.x + wa.width - w - 8);
  const y = wa.y + wa.height - h - 12;
  chatWin.setPosition(Math.round(x), Math.round(y));
}

function openChat(focus = true) {
  if (chatWin && !chatWin.isDestroyed()) {
    positionChat();
    chatWin.show();
    if (focus) chatWin.focus();
    return chatWin;
  }
  chatWin = new BrowserWindow({
    width: 410, height: 640, minWidth: 340, minHeight: 420, frame: false, transparent: true, resizable: true,
    skipTaskbar: false, alwaysOnTop: true, show: false, title: store.settings.assistantName || 'Bitu',
    icon: ICON, backgroundColor: '#00000000', webPreferences: baseWebPrefs()
  });
  lockdown(chatWin);
  chatWin.loadURL(page('chat'));
  chatWin.once('ready-to-show', () => { positionChat(); chatWin.show(); if (focus) chatWin.focus(); });
  chatWin.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); chatWin.hide(); } });
  return chatWin;
}

function toggleChat() {
  if (chatWin && !chatWin.isDestroyed() && chatWin.isVisible()) chatWin.hide();
  else openChat(true);
}

function openSettings(tab) {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show(); settingsWin.focus();
    if (tab) settingsWin.webContents.send('settings:tab', tab);
    return;
  }
  settingsWin = new BrowserWindow({
    width: 960, height: 700, minWidth: 760, minHeight: 560, frame: false, show: false,
    icon: ICON, backgroundColor: '#14110F', title: 'Bitu', webPreferences: baseWebPrefs()
  });
  lockdown(settingsWin);
  settingsWin.loadURL(page('settings', { tab: tab || '', onboarding: store.settings.onboarded ? '0' : '1' }));
  settingsWin.once('ready-to-show', () => settingsWin.show());
  settingsWin.on('closed', () => { settingsWin = null; });
}

function broadcast(channel, payload) {
  for (const w of [buddyWin, chatWin, settingsWin]) {
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

function toBuddy(channel, payload) {
  if (buddyWin && !buddyWin.isDestroyed()) buddyWin.webContents.send(channel, payload);
}

// ------------------------------------------------------------------ bandeja e atalhos
function buildTrayMenu() {
  const s = store.settings;
  return Menu.buildFromTemplate([
    { label: t('tray.chat'), click: () => openChat(true) },
    { label: t('tray.settings'), click: () => openSettings() },
    { type: 'separator' },
    {
      label: t('tray.show'), type: 'checkbox', checked: Boolean(buddyWin && buddyWin.isVisible()),
      click: (item) => { if (!buddyWin) return; item.checked ? buddyWin.showInactive() : buddyWin.hide(); }
    },
    {
      label: t('tray.dnd'), type: 'checkbox', checked: s.dnd,
      click: (item) => updateSettings({ dnd: item.checked })
    },
    { label: t('tray.stop'), click: () => agent.stop() },
    { type: 'separator' },
    { label: t('tray.quit'), click: () => { app.isQuitting = true; app.quit(); } }
  ]);
}

function createTray() {
  const img = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('Bitu');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => toggleChat());
}

function registerShortcuts() {
  globalShortcut.unregisterAll();
  const sc = store.settings.shortcuts;
  const safe = (acc, fn) => { try { if (acc) globalShortcut.register(acc, fn); } catch (e) { console.warn('atalho', acc, e.message); } };
  safe(sc.chat, () => toggleChat());
  safe(sc.listen, () => { openChat(true); setTimeout(() => chatWin && chatWin.webContents.send('chat:listen'), 250); });
  safe(sc.stop, () => { agent.stop(); toBuddy('buddy:cmd', { type: 'emote', emotion: 'surpreso' }); });
}

function updateSettings(patch) {
  const before = store.getSettings();
  const s = store.setSettings(patch);
  broadcast('settings:changed', s);
  if (tray) tray.setContextMenu(buildTrayMenu());
  if (JSON.stringify(before.shortcuts) !== JSON.stringify(s.shortcuts)) registerShortcuts();
  if (before.startWithWindows !== s.startWithWindows) applyAutoLaunch();
  return s;
}

function applyAutoLaunch() {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: store.settings.startWithWindows, args: ['--hidden'] });
}

// ------------------------------------------------------------------ lembretes
function scheduleReminder(minutes, text) {
  const at = Date.now() + minutes * 60000;
  const r = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at, text };
  store.memory.reminders.push(r);
  store.saveMemorySoon();
  armReminder(r);
  return at;
}

function armReminder(r) {
  const delay = Math.max(1000, r.at - Date.now());
  if (delay > 2 ** 31 - 1) return;
  reminderTimers.set(r.id, setTimeout(() => {
    store.memory.reminders = store.memory.reminders.filter(x => x.id !== r.id);
    store.saveMemorySoon();
    reminderTimers.delete(r.id);
    toBuddy('world:event', { type: 'reminder', text: r.text, late: Date.now() - r.at > 60000 });
  }, delay));
}

// ------------------------------------------------------------------ conexão "um clique"
function startConnect(provider) {
  stopConnect();
  shell.openExternal(providers.CONSOLE_URLS[provider]);
  const started = Date.now();
  const pattern = providers.KEY_PATTERNS[provider];
  let busy = false;
  connectWatch = setInterval(async () => {
    if (Date.now() - started > 10 * 60000) {
      stopConnect();
      broadcast('connect:status', { provider, state: 'timeout' });
      return;
    }
    if (busy) return;
    busy = true;
    let text = '';
    try { text = String(await clipboard.readText() || ''); } catch { /* área de transferência ocupada */ }
    const m = text.match(pattern);
    if (!m) { busy = false; return; }
    broadcast('connect:status', { provider, state: 'checking' });
    const result = await saveKey(provider, m[0]);
    if (result.ok) {
      await clipboard.writeText(''); // não deixa a chave esquecida na área de transferência
      stopConnect();
      if (settingsWin) { settingsWin.show(); settingsWin.focus(); }
    }
    busy = false;
  }, 900);
  broadcast('connect:status', { provider, state: 'waiting' });
}

function stopConnect() {
  if (connectWatch) clearInterval(connectWatch);
  connectWatch = null;
}

async function saveKey(provider, key) {
  try {
    const v = await providers.validateKey(provider, key.trim());
    store.setKey(provider, key.trim());
    const patch = { provider };
    if (!store.settings.models[provider]) patch.models = { [provider]: v.defaultModel };
    updateSettings(patch);
    broadcast('connect:status', { provider, state: 'ok', model: store.settings.models[provider] });
    return { ok: true, models: v.models };
  } catch (e) {
    broadcast('connect:status', { provider, state: 'error', message: e.message });
    return { ok: false, error: e.message };
  }
}

// ------------------------------------------------------------------ IPC
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try { return await fn(event, ...args); } catch (e) { console.error(channel, e); return { error: e.message }; }
  });
}

function setupIpc() {
  handle('settings:get', () => store.getSettings());
  handle('settings:set', (_e, patch) => updateSettings(patch));
  handle('app:info', () => ({
    version: app.getVersion(), platform: process.platform, dataDir: store.dir,
    encrypted: store.encryptionAvailable, notifMode: watchers.notifMode
  }));

  handle('keys:status', () => ({ anthropic: store.hasKey('anthropic'), openai: store.hasKey('openai') }));
  handle('keys:set', (_e, provider, key) => saveKey(provider, String(key || '')));
  handle('keys:clear', (_e, provider) => { store.setKey(provider, ''); broadcast('connect:status', { provider, state: 'cleared' }); return true; });
  handle('connect:start', (_e, provider) => { startConnect(provider); return true; });
  handle('connect:cancel', () => { stopConnect(); return true; });
  handle('models:list', async (_e, provider) => {
    const key = store.getKey(provider);
    if (!key) return [];
    return providers.listModels(provider, key);
  });

  handle('chat:send', (_e, text) => { agent.send(String(text).slice(0, 20000)); return true; });
  handle('chat:stop', () => { agent.stop(); return true; });
  handle('chat:history', () => store.memory.history.slice(-150));
  handle('chat:clear', () => { store.clearHistory(); return true; });
  handle('confirm:reply', (_e, id, ok) => {
    const p = pendingConfirms.get(id);
    if (p) { pendingConfirms.delete(id); p(Boolean(ok)); }
    return true;
  });

  handle('notes:list', () => store.memory.notes);
  handle('notes:remove', (_e, id) => { store.removeNote(id); return store.memory.notes; });
  handle('memory:export', async () => {
    const { filePath } = await dialog.showSaveDialog(settingsWin || undefined, {
      defaultPath: path.join(app.getPath('documents'), `bitu-memoria-${new Date().toISOString().slice(0, 10)}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (!filePath) return false;
    fs.writeFileSync(filePath, JSON.stringify(store.exportMemory(), null, 2), 'utf8');
    shell.showItemInFolder(filePath);
    return true;
  });
  handle('memory:wipe', () => { store.wipeEverything(); broadcast('connect:status', { provider: 'all', state: 'cleared' }); return true; });
  handle('memory:open-folder', () => shell.openPath(store.dir));

  handle('tts:openai', async (_e, text, voice) => {
    const key = store.getKey('openai');
    if (!key) throw new Error('Conecte uma chave da OpenAI para usar essas vozes.');
    const buf = await providers.openaiSpeech(key, text, voice || store.settings.voice.openaiVoice,
      'Fale de forma calorosa, natural e expressiva, como um amigo próximo.');
    return buf.toString('base64');
  });
  handle('stt:available', () => store.hasKey('openai'));
  handle('stt:transcribe', async (_e, bytes, mime) => {
    const key = store.getKey('openai');
    if (!key) throw new Error('nokey');
    return providers.openaiTranscribe(key, Buffer.from(bytes), mime, store.settings.lang);
  });

  handle('avatar:import', async (_e, kind) => {
    const target = settingsWin || chatWin || undefined;
    if (kind === 'pack') {
      const { filePaths } = await dialog.showOpenDialog(target, { properties: ['openDirectory'], title: 'Pasta do pacote de avatar' });
      if (!filePaths || !filePaths[0]) return null;
      const src = filePaths[0];
      const manifest = JSON.parse(fs.readFileSync(path.join(src, 'bitu-avatar.json'), 'utf8'));
      const dirName = 'pack-' + Date.now().toString(36);
      const dest = path.join(store.avatarDir, dirName);
      fs.mkdirSync(dest, { recursive: true });
      for (const f of fs.readdirSync(src)) {
        if (/\.(png|gif|webp|svg|apng|json)$/i.test(f)) fs.copyFileSync(path.join(src, f), path.join(dest, f));
      }
      return { kind: 'pack', packDir: dirName, manifest };
    }
    const { filePaths } = await dialog.showOpenDialog(target, {
      properties: ['openFile'], title: 'Imagem do avatar',
      filters: [{ name: 'Imagens', extensions: ['png', 'gif', 'webp', 'svg', 'apng'] }]
    });
    if (!filePaths || !filePaths[0]) return null;
    const ext = path.extname(filePaths[0]).toLowerCase();
    const name = 'avatar-' + Date.now().toString(36) + ext;
    fs.copyFileSync(filePaths[0], path.join(store.avatarDir, name));
    return { kind: 'image', file: name };
  });

  handle('meme:save', async (_e, dataUrl) => {
    const dir = path.join(app.getPath('pictures'), 'Bitu Memes');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `meme-${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
    fs.writeFileSync(file, Buffer.from(String(dataUrl).split(',')[1], 'base64'));
    store.bumpStat('memes');
    return file;
  });

  handle('open:external', (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return true; });
  handle('open:path', (_e, p) => { shell.showItemInFolder(p); return true; });
  handle('window:open', (_e, name, arg) => {
    if (name === 'settings') openSettings(arg);
    if (name === 'chat') openChat(true);
    return true;
  });
  handle('window:close', (e) => { BrowserWindow.fromWebContents(e.sender)?.close(); return true; });
  handle('window:minimize', (e) => { BrowserWindow.fromWebContents(e.sender)?.minimize(); return true; });
  handle('onboarding:done', () => { updateSettings({ onboarded: true }); toBuddy('world:event', { type: 'hello-first' }); return true; });

  // --- avatar (janela transparente)
  ipcMain.on('buddy:interactive', (_e, on) => {
    if (buddyWin) buddyWin.setIgnoreMouseEvents(!on, { forward: true });
  });
  ipcMain.on('buddy:moveTo', (_e, x, y) => {
    if (!buddyWin) return;
    const wa = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) }).workArea;
    const nx = Math.round(Math.min(Math.max(x, wa.x - 40), wa.x + wa.width - BUDDY_W + 40));
    const ny = Math.round(Math.min(Math.max(y, wa.y - 60), wa.y + wa.height - BUDDY_H));
    buddyWin.setBounds({ x: nx, y: ny, width: BUDDY_W, height: BUDDY_H });
    if (chatWin && chatWin.isVisible()) positionChat();
  });
  ipcMain.on('buddy:savePos', () => {
    if (buddyWin) store.setSettings({ position: { x: buddyWin.getBounds().x } });
  });
  handle('buddy:area', () => {
    const b = buddyWin ? buddyWin.getBounds() : { x: 0, y: 0, width: BUDDY_W, height: BUDDY_H };
    const wa = screen.getDisplayMatching(b).workArea;
    return { bounds: b, workArea: wa };
  });
  ipcMain.on('buddy:click', () => toggleChat());
  ipcMain.on('buddy:menu', () => {
    if (!buddyWin) return;
    Menu.buildFromTemplate([
      { label: t('tray.chat'), click: () => openChat(true) },
      { label: t('menu.joke'), click: () => toBuddy('buddy:cmd', { type: 'joke' }) },
      { label: t('menu.dance'), click: () => toBuddy('buddy:cmd', { type: 'emote', emotion: 'dancando' }) },
      { label: t('menu.sleep'), click: () => toBuddy('buddy:cmd', { type: 'emote', emotion: 'dormindo' }) },
      { label: t('menu.home'), click: () => toBuddy('buddy:cmd', { type: 'go-home' }) },
      { type: 'separator' },
      { label: t('tray.settings'), click: () => openSettings() },
      { label: t('tray.dnd'), type: 'checkbox', checked: store.settings.dnd, click: (i) => updateSettings({ dnd: i.checked }) },
      { label: t('tray.hide'), click: () => buddyWin.hide() }
    ]).popup({ window: buddyWin });
  });
  ipcMain.on('buddy:speak-from-chat', (_e, text) => toBuddy('buddy:cmd', { type: 'say', text }));
  ipcMain.on('buddy:relay', (_e, cmd) => {
    if (cmd && ['emote', 'joke', 'fx', 'legend', 'go-home', 'say'].includes(cmd.type)) toBuddy('buddy:cmd', cmd);
  });
  ipcMain.on('chat:meme-ready', (_e, file) => toBuddy('buddy:cmd', { type: 'emote', emotion: 'rindo' }));
}

// ------------------------------------------------------------------ inicialização
function emitBuddyFromTool(cmd) {
  if (cmd.type === 'hide-for-shot') {
    for (const w of [buddyWin, chatWin]) if (w && w.isVisible()) w.setOpacity(0);
    return;
  }
  if (cmd.type === 'show-after-shot') {
    for (const w of [buddyWin, chatWin]) if (w) w.setOpacity(1);
    return;
  }
  if (cmd.type === 'pointing') {
    const d = screen.getPrimaryDisplay();
    toBuddy('buddy:cmd', { type: 'pointing', x: cmd.x / d.scaleFactor, y: cmd.y / d.scaleFactor });
    return;
  }
  if (cmd.type === 'meme') {
    openChat(false);
    const send = () => chatWin.webContents.send('chat:meme', cmd);
    if (chatWin.webContents.isLoading()) chatWin.webContents.once('did-finish-load', send); else send();
    return;
  }
  toBuddy('buddy:cmd', cmd);
}

function askConfirm({ tool, detail }) {
  return new Promise((resolve) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    pendingConfirms.set(id, resolve);
    const win = openChat(true);
    const send = () => win.webContents.send('confirm:ask', { id, tool, detail });
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send); else send();
    toBuddy('buddy:cmd', { type: 'emote', emotion: 'pensativo' });
    setTimeout(() => { if (pendingConfirms.has(id)) { pendingConfirms.delete(id); resolve(false); } }, 120000);
  });
}

app.whenReady().then(async () => {
  store = new Store();

  protocol.handle('bitu-asset', async (req) => {
    const u = new URL(req.url);
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    const file = path.resolve(store.avatarDir, rel);
    if (u.host !== 'avatar' || !file.startsWith(path.resolve(store.avatarDir) + path.sep)) {
      return new Response('forbidden', { status: 403 });
    }
    const res = await net.fetch(pathToFileURL(file).toString());
    // CORS liberado só para as telas do próprio app poderem desenhar o avatar em memes
    return new Response(res.body, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/octet-stream', 'access-control-allow-origin': '*' } });
  });

  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    cb(['media', 'clipboard-sanitized-write'].includes(permission) && wc.getURL().startsWith('file://'));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission) => {
    return ['media', 'clipboard-sanitized-write'].includes(permission) && Boolean(wc) && wc.getURL().startsWith('file://');
  });

  watchers = new Watchers(() => store.settings);
  watchers.on('media', (m) => toBuddy('world:event', { type: 'media', ...m }));
  watchers.on('notification', (n) => toBuddy('world:event', { type: 'notification', ...n }));

  agent = new Agent({
    store,
    watchers,
    winactions,
    getTools: () => buildTools({
      store, watchers, scheduleReminder,
      emitBuddy: emitBuddyFromTool,
      lastShot: () => lastShot,
      setLastShot: (s) => { lastShot = s; }
    }),
    emit: (ev) => broadcast('agent:event', ev),
    askConfirm
  });

  setupIpc();
  createBuddy();
  createTray();
  registerShortcuts();
  applyAutoLaunch();
  watchers.start();

  for (const r of store.memory.reminders) armReminder(r);

  setInterval(() => {
    toBuddy('world:event', { type: 'idle', seconds: powerMonitor.getSystemIdleTime() });
  }, 20000);
  powerMonitor.on('lock-screen', () => toBuddy('world:event', { type: 'lock' }));
  powerMonitor.on('unlock-screen', () => toBuddy('world:event', { type: 'unlock' }));

  if (!store.settings.onboarded) openSettings();
});

app.on('window-all-closed', () => { /* continua rodando na bandeja */ });
app.on('before-quit', () => {
  app.isQuitting = true;
  store && store.saveMemoryNow();
  globalShortcut.unregisterAll();
  watchers && watchers.dispose();
  winactions.dispose();
});
