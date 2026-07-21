import Artplayer from 'artplayer';
import artplayerPluginDanmuku from 'artplayer-plugin-danmuku';
import artplayerPluginVttThumbnail from 'artplayer-plugin-vtt-thumbnail';
import './reader-artplayer-theme.css';
import { buildReaderArtplayerCustomTypes, setArtplayerSessionHeaders, setArtplayerSessionDrm } from '@/lib/media/video/artplayer/custom-types';
import { detectArtplayerStreamType } from '@/lib/media/video/artplayer/detect-stream-type';
import { attachBilibiliProgressPreview } from '@/lib/media/video/artplayer/progress-preview';
import type { CreateReaderArtplayerOptions } from '@/lib/media/video/artplayer/types';

/** B 站风格主色 */
const BILI_BLUE = '#00a1d6';
const BILI_BLUE_HOVER = '#00b5e5';

function hasDanmukuSource(danmuku: unknown): boolean {
  if (danmuku == null) return false;
  if (typeof danmuku === 'string') return danmuku.trim().length > 0;
  if (Array.isArray(danmuku)) return danmuku.length > 0;
  return typeof danmuku === 'function';
}

export function createReaderArtplayer(options: CreateReaderArtplayerOptions): Artplayer {
  const { container, url, autoplay, playbackRate, extras, headers, streamType: streamTypeOpt } = options;
  const streamType = streamTypeOpt ?? detectArtplayerStreamType(url);
  setArtplayerSessionHeaders(headers);
  setArtplayerSessionDrm(extras?.drm ?? null);
  console.info('[tv-play] artplayer init', {
    url,
    streamType: streamType ?? '(native)',
    headerKeys: headers ? Object.keys(headers) : [],
  });

  const plugins: Array<(art: Artplayer) => unknown> = [];
  const danmuku = extras?.danmuku;
  // 仅预览/设置：有弹幕源时才挂插件；不开放发送（无上云接口）
  if (hasDanmukuSource(danmuku)) {
    const dOpts = extras?.danmakuOpts;
    plugins.push(
      artplayerPluginDanmuku({
        danmuku: danmuku!,
        emitter: false,
        theme: 'dark',
        opacity: dOpts?.opacity ?? 0.92,
        fontSize: dOpts?.fontSize ?? 25,
        speed: dOpts?.speed ?? 5,
        antiOverlap: true,
      }),
    );
  }

  if (extras?.vttThumbnailUrl?.trim()) {
    plugins.push(
      artplayerPluginVttThumbnail({
        vtt: extras.vttThumbnailUrl.trim(),
      }),
    );
  }

  const subtitleUrl = extras?.subtitleUrl?.trim();
  const art = new Artplayer({
    container,
    url,
    // 勿传 type/subtitle: undefined，Artplayer 会校验失败
    ...(streamType ? { type: streamType } : {}),
    poster: extras?.poster ?? '',
    theme: BILI_BLUE,
    lang: 'zh-cn',
    autoplay: autoplay ?? false,
    // false：铺满容器；true 会按片源分辨率收缩，下方留黑边
    autoSize: false,
    autoMini: false,
    playbackRate: true,
    setting: true,
    flip: true,
    pip: true,
    mutex: true,
    // 关闭 backdrop，避免整层灰色半透明雾面
    backdrop: false,
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
    ...(subtitleUrl
      ? {
          subtitle: {
            url: subtitleUrl,
            type: extras?.subtitleType ?? 'vtt',
          },
        }
      : {}),
    moreVideoAttr: {
      playsInline: true,
    },
    cssVar: {
      '--art-theme': BILI_BLUE,
      '--art-hover-color': BILI_BLUE_HOVER,
      '--art-highlight-color': BILI_BLUE,
      // 未播放轨道底色（三色：未播 / 缓冲 / 已播）
      '--art-progress-color': 'rgba(255, 255, 255, 0.22)',
      '--art-loaded-color': 'rgba(255, 255, 255, 0.42)',
    },
  });

  // 屏蔽播放/暂停顶部 notice（「暂停」等）；错误仍走页内文案
  const silencePausePlayNotice = () => {
    try {
      art.notice.show = false;
    } catch {
      /* */
    }
  };
  art.on('ready', silencePausePlayNotice);
  art.on('video:play', silencePausePlayNotice);
  art.on('video:pause', silencePausePlayNotice);
  art.on('play', silencePausePlayNotice);
  art.on('pause', silencePausePlayNotice);

  // B 站风格：悬停三角 + 缩略图时间（VTT 插件异步挂载后仍可叠加）
  const detachPreview = attachBilibiliProgressPreview(art, {
    preferThumbTime: Boolean(extras?.vttThumbnailUrl?.trim()),
  });
  art.on('destroy', () => detachPreview());

  const rate = playbackRate ?? 1;
  if (rate !== 1) {
    art.playbackRate = rate;
  }

  return art;
}
