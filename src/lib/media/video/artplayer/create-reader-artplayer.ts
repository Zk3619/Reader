import Artplayer from 'artplayer';
import artplayerPluginDanmuku from 'artplayer-plugin-danmuku';
import artplayerPluginVttThumbnail from 'artplayer-plugin-vtt-thumbnail';
import './reader-artplayer-theme.css';
import { buildReaderArtplayerCustomTypes } from '@/lib/media/video/artplayer/custom-types';
import { detectArtplayerStreamType } from '@/lib/media/video/artplayer/detect-stream-type';
import type { CreateReaderArtplayerOptions } from '@/lib/media/video/artplayer/types';

export function createReaderArtplayer(options: CreateReaderArtplayerOptions): Artplayer {
  const { container, url, autoplay, playbackRate, extras } = options;
  const streamType = detectArtplayerStreamType(url);

  const plugins: Array<(art: Artplayer) => unknown> = [
    artplayerPluginDanmuku({
      danmuku: extras?.danmuku ?? [],
      emitter: true,
      theme: 'dark',
      opacity: 0.92,
      antiOverlap: true,
    }),
  ];

  if (extras?.vttThumbnailUrl?.trim()) {
    plugins.push(
      artplayerPluginVttThumbnail({
        vtt: extras.vttThumbnailUrl.trim(),
      }),
    );
  }

  const art = new Artplayer({
    container,
    url,
    type: streamType,
    poster: extras?.poster,
    theme: '#a78bfa',
    lang: 'zh-cn',
    autoplay: autoplay ?? false,
    autoSize: true,
    autoMini: false,
    playbackRate: true,
    setting: true,
    flip: true,
    pip: true,
    mutex: true,
    backdrop: true,
    fullscreen: true,
    fullscreenWeb: true,
    miniProgressBar: true,
    playsInline: true,
    lock: true,
    gesture: true,
    fastForward: true,
    autoPlayback: true,
    hotkey: true,
    screenshot: false,
    customType: buildReaderArtplayerCustomTypes(),
    plugins,
    subtitle: extras?.subtitleUrl?.trim()
      ? {
          url: extras.subtitleUrl.trim(),
          type: extras.subtitleType ?? 'vtt',
        }
      : undefined,
    moreVideoAttr: {
      playsInline: true,
    },
    cssVar: {
      '--art-theme': '#a78bfa',
      '--art-hover-color': '#c4b5fd',
      '--art-highlight-color': '#f59e0b',
      '--art-progress-color': 'rgba(167, 139, 250, 0.35)',
    },
    layers: [
      {
        name: 'reader-brand',
        html: '<span class="reader-artplayer-watermark">Reader</span>',
        style: {
          position: 'absolute',
          top: '12px',
          right: '12px',
          padding: '4px 10px',
          fontSize: '11px',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.45)',
          borderRadius: '9999px',
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(0,0,0,0.25)',
          pointerEvents: 'none',
        },
      },
    ],
  });

  const rate = playbackRate ?? 1;
  if (rate !== 1) {
    art.playbackRate = rate;
  }

  return art;
}
