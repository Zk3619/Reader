import Artplayer from 'artplayer';
import artplayerPluginVttThumbnail from 'artplayer-plugin-vtt-thumbnail';
import './reader-artplayer-theme.css';
import { buildReaderArtplayerCustomTypes, setArtplayerSessionHeaders, setArtplayerSessionDrm, setArtplayerSessionIsLive } from '@/lib/media/video/artplayer/custom-types';
import { detectArtplayerStreamType } from '@/lib/media/video/artplayer/detect-stream-type';
import { attachBilibiliProgressPreview } from '@/lib/media/video/artplayer/progress-preview';
import { attachBilibiliPlaySettings } from '@/lib/media/video/artplayer/attach-play-settings';
import { attachReaderContextMenu } from '@/lib/media/video/artplayer/attach-reader-contextmenu';
import { artplayerLucideIcons } from '@/lib/media/video/artplayer/lucide-icons';
import { getArtplayerPlaySettings } from '@/lib/media/video/artplayer/play-settings-prefs';
import {
  danmakuPrefsToArtplayerOpts,
  getDanmakuPrefs,
  ARTPLAYER_DANMAKU_SPEED_OPTION,
  ARTPLAYER_DANMAKU_MARGIN_OPTION,
} from '@/lib/media/video/danmaku/danmaku-prefs';
import { installArtDanmukuPlugin } from '@/lib/media/video/danmaku/art-danmuku';
import { normalizeDanmuForArtplayer } from '@/lib/media/video/danmaku/to-artplayer';
import { isDanmakuSendLocalEnabled } from '@/lib/media/video/danmaku/send';
import type { CreateReaderArtplayerOptions } from '@/lib/media/video/artplayer/types';
import type { Danmu } from 'artplayer-plugin-danmuku';
import {
  claimPlayback,
  registerPlaybackOwner,
  releasePlayback,
} from '@/lib/media/playback-exclusivity';

/** B 站风格主色 */
const BILI_BLUE = '#00a1d6';
const BILI_BLUE_HOVER = '#00b5e5';

/** 允许空数组：延迟匹配 / 状态提示弹幕也需要插件实例 */
function shouldMountDanmuku(danmuku: unknown): boolean {
  if (danmuku == null) return false;
  if (typeof danmuku === 'string') return true;
  if (Array.isArray(danmuku)) return true;
  return typeof danmuku === 'function' || typeof (danmuku as Promise<unknown>)?.then === 'function';
}

const SELF_DANMU_STYLE: Partial<CSSStyleDeclaration> = {
  borderRadius: '8px',
  padding: '2px 8px',
  boxSizing: 'border-box',
};

export function createReaderArtplayer(options: CreateReaderArtplayerOptions): Artplayer {
  const {
    container,
    url,
    autoplay,
    playbackRate,
    extras,
    headers,
    streamType: streamTypeOpt,
    isLive,
    playbackOwner = 'video',
  } = options;
  const streamType = streamTypeOpt ?? detectArtplayerStreamType(url);
  setArtplayerSessionHeaders(headers);
  setArtplayerSessionDrm(extras?.drm ?? null);
  setArtplayerSessionIsLive(isLive);
  console.info('[tv-play] artplayer init', {
    url,
    streamType: streamType ?? '(native)',
    headerKeys: headers ? Object.keys(headers) : [],
    isLive: !!isLive,
  });

  const plugins: Array<(art: Artplayer) => unknown> = [];
  const danmuku = extras?.danmuku;
  const dOpts = extras?.danmakuOpts;
  const enableEmitter = dOpts?.emitter === true;
  const danmakuPrefs = getDanmakuPrefs();
  const prefsArtOpts = danmakuPrefsToArtplayerOpts(danmakuPrefs);
  if (shouldMountDanmuku(danmuku)) {
    const initialDanmuku = Array.isArray(danmuku)
      ? normalizeDanmuForArtplayer(danmuku as Danmu[])
      : danmuku!;
    plugins.push(
      installArtDanmukuPlugin({
        danmuku: initialDanmuku,
        emitter: enableEmitter,
        theme: 'dark',
        // 对齐官方文档默认观感：https://artplayer.org/document/plugin/danmuku.html
        opacity: dOpts?.opacity ?? prefsArtOpts.opacity,
        fontSize: dOpts?.fontSize ?? prefsArtOpts.fontSize,
        speed: dOpts?.speed ?? prefsArtOpts.speed,
        SPEED: ARTPLAYER_DANMAKU_SPEED_OPTION,
        // 插件类型把 steps.value 标成 string|number，运行时实际是 margin 二元组
        MARGIN: ARTPLAYER_DANMAKU_MARGIN_OPTION as unknown as import('artplayer-plugin-danmuku').Slider,
        antiOverlap: dOpts?.antiOverlap ?? prefsArtOpts.antiOverlap,
        margin: dOpts?.margin ?? prefsArtOpts.margin,
        modes: dOpts?.modes?.length ? dOpts.modes : prefsArtOpts.modes,
        synchronousPlayback: prefsArtOpts.synchronousPlayback,
        heatmap: false,
        // 默认 512：窄于该宽度会把入口挪到播放器下方，易被 overflow/我们的 CSS 裁掉。
        // 置 0 使入口始终挂在 controls-center，小屏也能看到开关/设置。
        width: 0,
        beforeEmit: (danmu) => {
          // 本地上屏受「允许本地发送」约束；关闭时不上屏（远程推送由业务另行调用）
          if (!isDanmakuSendLocalEnabled()) return false;
          danmu.style = {
            ...(danmu.style ?? {}),
            ...SELF_DANMU_STYLE,
          };
          return true;
        },
        beforeVisible: (danmu) => {
          if (danmu.border) {
            danmu.style = {
              ...(danmu.style ?? {}),
              ...SELF_DANMU_STYLE,
            };
          }
          return true;
        },
      }),
    );
  }

  if (extras?.vttThumbnailUrl?.trim()) {
    // 仅消费可 fetch 的预生成 VTT；本地抽帧走 LocalSeekThumbOverlay，不经此插件
    plugins.push(
      artplayerPluginVttThumbnail({
        vtt: extras.vttThumbnailUrl.trim(),
      }),
    );
  }

  const subtitleUrl = extras?.subtitleUrl?.trim();
  const playSettings = getArtplayerPlaySettings();
  const art = new Artplayer({
    container,
    url,
    // 勿传 type/subtitle: undefined，Artplayer 会校验失败
    ...(streamType ? { type: streamType } : {}),
    poster: extras?.poster ?? '',
    theme: BILI_BLUE,
    lang: 'zh-cn',
    // 设置弹层内原生图标（返回/勾选/开关/设置齿轮等）统一 Lucide
    icons: artplayerLucideIcons(),
    autoplay: autoplay ?? playSettings.autoplay,
    // false：铺满容器；true 会按片源分辨率收缩，下方留黑边
    autoSize: false,
    autoMini: false,
    loop: playSettings.loop,
    // 倍速由自定义 setting 项持久化，关闭原生 builtin
    playbackRate: false,
    // 原生 setting；画面翻转由自定义项支持水平+垂直同时开
    setting: true,
    flip: false,
    aspectRatio: false,
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
    autoPlayback: danmakuPrefs.playResume,
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

  const unregisterPlayback = registerPlaybackOwner(playbackOwner, {
    pause: () => {
      try {
        art.pause();
      } catch {
        /* ignore */
      }
    },
    resume: () => {
      try {
        void art.play();
      } catch {
        /* ignore */
      }
    },
  });
  art.on('play', () => claimPlayback(playbackOwner));
  art.on('video:play', () => claimPlayback(playbackOwner));
  art.on('pause', () => releasePlayback(playbackOwner));
  art.on('video:pause', () => releasePlayback(playbackOwner));
  art.on('destroy', () => {
    unregisterPlayback();
    releasePlayback(playbackOwner);
  });

  // B 站风格：悬停三角 + 缩略图时间（VTT 插件异步挂载后仍可叠加）
  const detachPreview = attachBilibiliProgressPreview(art, {
    preferThumbTime: Boolean(extras?.vttThumbnailUrl?.trim()),
  });
  art.on('destroy', () => detachPreview());

  // B 站风格两级播放设置（镜像 / 循环 / 开播 / 切集 / 比例 / 黑边）
  const detachPlaySettings = attachBilibiliPlaySettings(art);
  art.on('destroy', () => detachPlaySettings());

  const detachCtxMenu = attachReaderContextMenu(art);
  art.on('destroy', () => detachCtxMenu());

  const rate = playbackRate ?? playSettings.playbackRate ?? 1;
  try {
    art.playbackRate = rate;
  } catch {
    /* */
  }

  return art;
}
