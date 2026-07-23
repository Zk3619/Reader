/**
 * Android Media3 / libmpv 全屏页入口（E2.A–G）
 */

import { invoke } from '@tauri-apps/api/core';
import { getVideoPlaybackPrefs } from '@/lib/media/video/playback/prefs';
import { getTvPlayPrefs } from '@/lib/media/tv/play/tv-play-prefs';

export type AndroidOpenPlayerOpts = {
  title?: string;
  startSec?: number;
  headers?: Record<string, string>;
  danmakuPath?: string;
  danmakuAssPath?: string;
  /** overlay | ass | off */
  danmakuMode?: 'overlay' | 'ass' | 'off';
  preferredSubtitlePath?: string;
};

function headersToMpvFields(headers?: Record<string, string>): string {
  if (!headers) return '';
  return Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\r\n');
}

export async function openAndroidVideoPlayer(
  engine: 'libmpv' | 'media3',
  url: string,
  titleOrOpts?: string | AndroidOpenPlayerOpts,
): Promise<void> {
  const opts: AndroidOpenPlayerOpts =
    typeof titleOrOpts === 'string' || titleOrOpts == null
      ? { title: titleOrOpts }
      : titleOrOpts;
  const prefs = getVideoPlaybackPrefs();
  const play = getTvPlayPrefs();
  if (engine === 'libmpv') {
    const st = await probeAndroidLibmpvStatus();
    if (!st.available) {
      throw new Error(st.detail || 'Android libmpv 不可用（缺 mpvlib.aar）');
    }
  }

  const a4kOn = prefs.anime4kMode !== 'off' && !prefs.frameInterpEnabled;
  const rifeOn = prefs.frameInterpEnabled;
  const vo = a4kOn || rifeOn ? 'gpu' : prefs.libmpvVideoOutput || 'gpu';
  const hwdec =
    a4kOn || rifeOn
      ? 'mediacodec-copy'
      : prefs.libmpvHwdec && prefs.libmpvHwdec !== 'auto'
        ? prefs.libmpvHwdec
        : 'mediacodec,mediacodec-copy,no';

  const danmakuMode =
    opts.danmakuMode ??
    play.androidDanmakuMode ??
    (play.libmpvDanmakuAutoAttach ? 'overlay' : 'off');

  await invoke('video_android_open_player', {
    engine,
    url,
    title: opts.title ?? null,
    anime4kMode: rifeOn ? 'off' : prefs.anime4kMode,
    anime4kQuality: prefs.anime4kQuality,
    anime4kDeblur: rifeOn ? false : prefs.anime4kDeblur,
    subFont: prefs.subFont || null,
    subFontSize: prefs.subFontSize > 0 ? prefs.subFontSize : null,
    subScale: prefs.subScale,
    subPos: 100,
    subDelay: 0,
    subColor: null,
    hwdec,
    videoOutput: vo,
    mpvProfile: 'default',
    volume: Math.min(300, Math.max(0, prefs.volume)),
    volumeMax: 300,
    muted: prefs.muted,
    listenOnly: prefs.listenOnly,
    startSec: opts.startSec ?? 0,
    httpHeaders: headersToMpvFields(opts.headers) || null,
    preferredSubtitlePath:
      opts.preferredSubtitlePath || prefs.preferredSubtitlePath || null,
    openingSkipSec: play.openingSkipSec,
    endingSkipSec: play.endingSkipSec,
    skipMode: play.androidSkipMode ?? 'fixed',
    hdrToneMapping: prefs.hdrToneMapping || 'mobius',
    hdrTargetColorspaceHint: prefs.hdrTargetColorspaceHint,
    audioEqPreset: prefs.audioEqPreset,
    danmakuPath: opts.danmakuPath ?? null,
    danmakuMode,
    danmakuAssPath: opts.danmakuAssPath ?? null,
    frameInterpEnabled: prefs.frameInterpEnabled,
    frameInterpFactor: prefs.frameInterpFactor,
    frameInterpLightweightFallback: prefs.frameInterpLightweightFallback,
  });
}

export async function probeAndroidLibmpvStatus(): Promise<{
  available: boolean;
  detail: string;
}> {
  try {
    return await invoke('video_android_libmpv_status');
  } catch (e) {
    return {
      available: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

/** 匹配弹幕后开 Android libmpv（FlameMaster XML + ASS 双文件） */
export async function openAndroidLibmpvWithDanmaku(
  url: string,
  danmu: import('artplayer-plugin-danmuku').Danmu[],
  opts?: Omit<AndroidOpenPlayerOpts, 'danmakuPath' | 'danmakuAssPath'>,
): Promise<void> {
  const { prepareDanmakuFilesForAndroid } = await import(
    '@/lib/media/video/danmaku/prepare-android'
  );
  const files = await prepareDanmakuFilesForAndroid(danmu);
  await openAndroidVideoPlayer('libmpv', url, {
    ...opts,
    danmakuPath: files?.xmlPath,
    danmakuAssPath: files?.assPath,
    danmakuMode: opts?.danmakuMode ?? getTvPlayPrefs().androidDanmakuMode,
  });
}
