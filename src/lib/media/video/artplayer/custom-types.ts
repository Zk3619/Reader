import type Artplayer from 'artplayer';
import type { Option } from 'artplayer';
import Hls from 'hls.js';
import flvjs from 'flv.js';
import * as dashjs from 'dashjs';

type ArtplayerWithEngines = Artplayer & {
  hls?: Hls;
  flv?: flvjs.Player;
  dash?: dashjs.MediaPlayerClass;
};

/** 当前播放会话 headers（由 createReaderArtplayer 注入） */
let sessionHeaders: Record<string, string> = {};
/** ClearKey / 许可提示（Widevine L1 桌面不承诺） */
let sessionDrm: { key?: string; type?: string } | null = null;

export function setArtplayerSessionHeaders(headers?: Record<string, string>): void {
  sessionHeaders = headers ?? {};
}

export function setArtplayerSessionDrm(drm?: { key?: string; type?: string } | null): void {
  sessionDrm = drm ?? null;
}

function xhrSetupHeaders(xhr: XMLHttpRequest): void {
  for (const [k, v] of Object.entries(sessionHeaders)) {
    if (!k || v == null) continue;
    try {
      xhr.setRequestHeader(k, v);
    } catch {
      /* forbidden header */
    }
  }
}

function destroyEngine(art: ArtplayerWithEngines, key: 'hls' | 'flv' | 'dash'): void {
  const engine = art[key];
  if (!engine) return;
  try {
    if (key === 'hls') {
      (engine as Hls).destroy();
    } else if (key === 'flv') {
      (engine as flvjs.Player).pause();
      (engine as flvjs.Player).unload();
      (engine as flvjs.Player).detachMediaElement();
      (engine as flvjs.Player).destroy();
    } else {
      (engine as dashjs.MediaPlayerClass).reset();
    }
  } catch {
    /* ignore */
  }
  art[key] = undefined;
}

function playM3u8(this: Artplayer, video: HTMLVideoElement, url: string, art: Artplayer): void {
  const a = art as ArtplayerWithEngines;
  destroyEngine(a, 'hls');
  destroyEngine(a, 'flv');
  destroyEngine(a, 'dash');

  if (Hls.isSupported()) {
    const hls = new Hls({
      enableWorker: true,
      xhrSetup: (xhr) => xhrSetupHeaders(xhr),
    });
    hls.loadSource(url);
    hls.attachMedia(video);
    a.hls = hls;
    art.on('destroy', () => hls.destroy());
    return;
  }
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    return;
  }
  art.notice.show = '当前环境不支持 HLS（m3u8）播放';
}

function playFlv(this: Artplayer, video: HTMLVideoElement, url: string, art: Artplayer): void {
  const a = art as ArtplayerWithEngines;
  destroyEngine(a, 'hls');
  destroyEngine(a, 'flv');
  destroyEngine(a, 'dash');

  if (!flvjs.isSupported()) {
    art.notice.show = '当前环境不支持 FLV 播放';
    return;
  }
  const flv = flvjs.createPlayer(
    { type: 'flv', url, isLive: false },
    {
      headers: sessionHeaders,
    },
  );
  flv.attachMediaElement(video);
  flv.load();
  a.flv = flv;
  art.on('destroy', () => {
    flv.pause();
    flv.unload();
    flv.detachMediaElement();
    flv.destroy();
  });
}

function playMpd(this: Artplayer, video: HTMLVideoElement, url: string, art: Artplayer): void {
  const a = art as ArtplayerWithEngines;
  destroyEngine(a, 'hls');
  destroyEngine(a, 'flv');
  destroyEngine(a, 'dash');

  const player = dashjs.MediaPlayer().create();
  if (Object.keys(sessionHeaders).length) {
    player.extend('RequestModifier', () => ({
      modifyRequestHeader: (xhr: XMLHttpRequest) => {
        xhrSetupHeaders(xhr);
        return xhr;
      },
    }), true);
  }
  // ClearKey 尽力而为；Widevine L1 / PlayReady 桌面 WebView 通常不可用
  const drmType = (sessionDrm?.type || '').toLowerCase();
  const drmKey = sessionDrm?.key?.trim();
  if (drmKey && (!drmType || drmType.includes('clear') || drmType.includes('clearkey'))) {
    try {
      let clearkeys: Record<string, string> = {};
      if (drmKey.startsWith('{')) {
        clearkeys = JSON.parse(drmKey) as Record<string, string>;
      } else if (drmKey.includes(':')) {
        const [kid, key] = drmKey.split(':');
        if (kid && key) clearkeys[kid.trim()] = key.trim();
      }
      if (Object.keys(clearkeys).length) {
        player.setProtectionData({
          'org.w3.clearkey': { clearkeys },
        });
      } else {
        console.warn('[tv-drm] ClearKey 未识别，跳过（不承诺 Widevine）');
      }
    } catch (e) {
      console.warn('[tv-drm]', e);
    }
  } else if (drmKey) {
    console.warn('[tv-drm] 非 ClearKey DRM 桌面尽力而为，可能无法播放', drmType);
  }
  player.initialize(video, url, false);
  a.dash = player;
  art.on('destroy', () => {
    player.reset();
  });
}

export function buildReaderArtplayerCustomTypes(): NonNullable<Option['customType']> {
  return {
    m3u8: playM3u8,
    hls: playM3u8,
    flv: playFlv,
    mpd: playMpd,
  };
}
