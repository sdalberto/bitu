'use strict';
/**
 * "Olhos e ouvidos" do Bitu:
 *  - Música: lê o que está tocando pelo controle de mídia do Windows (Spotify, YouTube no navegador, Deezer, etc.)
 *  - Notificações: tenta ler as notificações do Windows (precisa de permissão do sistema);
 *    se o Windows não liberar, observa os títulos das janelas (ex.: "Discord (3)").
 */
const { EventEmitter } = require('events');
const { PSHost, IS_WIN } = require('./pshost');

const MEDIA_PRELUDE = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$global:BituAsTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
})[0]
function global:BituAwait($op, [Type]$type) {
  $t = $global:BituAsTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result
}
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null
$global:BituMediaMgr = BituAwait ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
function global:BituMedia {
  $s = $global:BituMediaMgr.GetCurrentSession()
  if (-not $s) { return '{}' }
  $p = BituAwait ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  @{ title = $p.Title; artist = $p.Artist; app = $s.SourceAppUserModelId; status = $s.GetPlaybackInfo().PlaybackStatus.ToString() } | ConvertTo-Json -Compress
}
'ok'
`;

const NOTIF_PRELUDE = `
$global:BituNotifOk = $false
$global:BituSeen = @{}
try {
  [Windows.UI.Notifications.Management.UserNotificationListener,Windows.UI.Notifications,ContentType=WindowsRuntime] | Out-Null
  [Windows.UI.Notifications.UserNotification,Windows.UI.Notifications,ContentType=WindowsRuntime] | Out-Null
  $global:BituListener = [Windows.UI.Notifications.Management.UserNotificationListener]::Current
  $acc = BituAwait ($global:BituListener.RequestAccessAsync()) ([Windows.UI.Notifications.Management.UserNotificationListenerAccessStatus])
  if ($acc.ToString() -eq 'Allowed') { $global:BituNotifOk = $true }
} catch { $global:BituNotifOk = $false }
function global:BituNotifs {
  $list = @()
  if ($global:BituNotifOk) {
    try {
      $ns = BituAwait ($global:BituListener.GetNotificationsAsync([Windows.UI.Notifications.NotificationKinds]::Toast)) ([System.Collections.Generic.IReadOnlyList[Windows.UI.Notifications.UserNotification]])
      foreach ($n in $ns) {
        if ($global:BituSeen.ContainsKey($n.Id)) { continue }
        $global:BituSeen[$n.Id] = 1
        $texts = @()
        try {
          $b = $n.Notification.Visual.GetBinding([Windows.UI.Notifications.KnownNotificationBindings]::ToastGeneric)
          foreach ($t in $b.GetTextElements()) { $texts += $t.Text }
        } catch {}
        $list += @{ app = $n.AppInfo.DisplayInfo.DisplayName; title = ($texts | Select-Object -First 1); body = (($texts | Select-Object -Skip 1) -join ' ') }
      }
    } catch {}
  }
  @{ mode = $(if ($global:BituNotifOk) { 'toast' } else { 'titles' }); items = $list } | ConvertTo-Json -Compress -Depth 4
}
function global:BituTitles {
  Get-Process | Where-Object { $_.MainWindowTitle } | ForEach-Object { @{ app = $_.ProcessName; title = $_.MainWindowTitle } } | ConvertTo-Json -Compress
}
'ok'
`;

const WATCH_TITLES = /^(whatsapp|telegram|discord|slack|teams|ms-teams|outlook|olk|thunderbird|signal|skype)$/i;

class Watchers extends EventEmitter {
  constructor(getSettings) {
    super();
    this.getSettings = getSettings;
    this.ps = new PSHost('watchers');
    this.ready = false;
    this.lastMedia = {};
    this.titleCounts = {};
    this.notifMode = 'off';
    this.firstNotifPass = true;
    this.timer = null;
  }

  async start() {
    if (!IS_WIN) return;
    try {
      await this.ps.run(MEDIA_PRELUDE, 30000);
      await this.ps.run(NOTIF_PRELUDE, 30000);
      this.ready = true;
    } catch (e) {
      console.warn('[watchers] não iniciou:', e.message);
      return;
    }
    const tick = async () => {
      try { await this.poll(); } catch (e) { /* silencioso: segue tentando */ }
      this.timer = setTimeout(tick, 4000);
    };
    tick();
  }

  currentMedia() { return this.lastMedia; }

  async poll() {
    const s = this.getSettings();
    if (s.perms.music) await this.pollMedia();
    if (s.perms.notifications) await this.pollNotifications();
  }

  async pollMedia() {
    let m = {};
    try { m = JSON.parse(await this.ps.run('BituMedia', 8000) || '{}'); } catch { return; }
    const prev = this.lastMedia;
    const playing = m.status === 'Playing';
    const changedTrack = m.title && (m.title !== prev.title || m.artist !== prev.artist);
    const changedState = playing !== (prev.status === 'Playing');
    this.lastMedia = m;
    if (changedTrack || changedState) {
      this.emit('media', { title: m.title || '', artist: m.artist || '', app: m.app || '', playing, newTrack: Boolean(changedTrack) });
    }
  }

  async pollNotifications() {
    let data;
    try { data = JSON.parse(await this.ps.run('BituNotifs', 8000)); } catch { return; }
    this.notifMode = data.mode;
    const items = Array.isArray(data.items) ? data.items : (data.items ? [data.items] : []);
    if (data.mode === 'toast') {
      if (this.firstNotifPass) { this.firstNotifPass = false; return; } // ignora as antigas
      for (const n of items) {
        if (!n || /bitu/i.test(n.app || '')) continue;
        this.emit('notification', { app: n.app || '', title: n.title || '', body: n.body || '' });
      }
      return;
    }
    // modo alternativo: contadores no título das janelas
    let wins = [];
    try { wins = JSON.parse(await this.ps.run('BituTitles', 8000) || '[]'); } catch { return; }
    if (!Array.isArray(wins)) wins = [wins];
    for (const w of wins) {
      if (!w || !WATCH_TITLES.test(w.app)) continue;
      const m = String(w.title).match(/\((\d+)\)|^\[(\d+)\]|•\s*(\d+)/);
      const count = m ? Number(m[1] || m[2] || m[3]) : 0;
      const before = this.titleCounts[w.app];
      this.titleCounts[w.app] = count;
      if (before !== undefined && count > before) {
        this.emit('notification', { app: prettyApp(w.app), title: '', body: '', count: count - before });
      }
    }
  }

  dispose() {
    clearTimeout(this.timer);
    this.ps.dispose();
  }
}

function prettyApp(name) {
  const map = { olk: 'Outlook', 'ms-teams': 'Teams', whatsapp: 'WhatsApp' };
  const k = String(name).toLowerCase();
  return map[k] || (k.charAt(0).toUpperCase() + k.slice(1));
}

module.exports = { Watchers };
