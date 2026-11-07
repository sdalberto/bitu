'use strict';
/**
 * Ponte segura entre as telas e o processo principal.
 * As telas nunca veem as chaves de API nem têm acesso direto ao Node.
 */
const { contextBridge, ipcRenderer } = require('electron');

const INVOKE = new Set([
  'settings:get', 'settings:set', 'app:info',
  'keys:status', 'keys:set', 'keys:clear', 'connect:start', 'connect:cancel', 'models:list',
  'local:detect', 'local:connect', 'local:disconnect', 'local:enable-openclaw',
  'stt:local', 'tts:local', 'voice:status', 'voice:install', 'voice:uninstall', 'ai:info', 'ai:install', 'ai:cancel',
  'chat:send', 'chat:stop', 'chat:history', 'chat:clear', 'confirm:reply',
  'notes:list', 'notes:remove', 'memory:export', 'memory:wipe', 'memory:open-folder',
  'tts:openai', 'stt:available', 'stt:transcribe',
  'avatar:import', 'meme:save', 'open:external', 'open:path',
  'window:open', 'window:close', 'window:minimize', 'onboarding:done', 'buddy:area'
]);
const SEND = new Set(['buddy:interactive', 'buddy:moveTo', 'buddy:savePos', 'buddy:click', 'buddy:menu', 'buddy:speak-from-chat', 'buddy:relay', 'chat:meme-ready']);
const ON = new Set([
  'settings:changed', 'settings:tab', 'agent:event', 'confirm:ask', 'world:event', 'buddy:cmd',
  'connect:status', 'chat:listen', 'chat:meme', 'setup:progress'
]);

contextBridge.exposeInMainWorld('bitu', {
  invoke(channel, ...args) {
    if (!INVOKE.has(channel)) return Promise.reject(new Error('canal bloqueado: ' + channel));
    return ipcRenderer.invoke(channel, ...args);
  },
  send(channel, ...args) {
    if (SEND.has(channel)) ipcRenderer.send(channel, ...args);
  },
  on(channel, fn) {
    if (!ON.has(channel)) return () => {};
    const wrapped = (_e, payload) => fn(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  }
});
