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

export function setArtplayerSessionHeaders(headers?: Record<string, string>): void {
  sessionHeaders = headers ?? {};
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
