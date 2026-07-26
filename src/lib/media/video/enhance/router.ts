/**
 * 增强管线路由
 * @see docs/VIDEO_WEB_ENHANCE.md
 */

import type {
  EnhancePipelineId,
  ResolveEnhanceInput,
  ResolveEnhanceResult,
} from '@/lib/media/video/enhance/types';

function pickWebTier(caps: ResolveEnhanceInput['caps']): EnhancePipelineId {
  if (caps.webCodecs && caps.webgpu && caps.ortWebgpu) return 'web-full';
  if (caps.webCodecs && caps.webgl2) return 'web-sr';
  if (caps.webgl2) return 'video-overlay';
  return 'none';
}

function trackBlocksWeb(input: ResolveEnhanceInput): boolean {
  const t = input.trackSupport;
  if (!t) return false;
  return !t.videoOk || !t.audioOk;
}

/**
 * 解析画质管线。
 * - webEnhanceEnabled=false 优先于 enhanceBackend=web
 * - auto 默认不选 web；mkv 等需 demux 时例外走 L3（或优先 mpv）
 */
export function resolveEnhancePipeline(input: ResolveEnhanceInput): ResolveEnhanceResult {
  const { prefsBackend, webEnhanceEnabled, caps, needsDemux } = input;

  // 1. 强制 backend
  if (prefsBackend === 'mpv') {
    if (caps.mpv) return { pipeline: 'mpv', reason: 'forced mpv' };
    return { pipeline: 'none', reason: 'mpv forced but unavailable', toast: '增强核 mpv 不可用' };
  }

  if (prefsBackend === 'rust-native') {
    if (caps.rustNative) return { pipeline: 'rust-native', reason: 'forced rust-native' };
    return {
      pipeline: 'none',
      reason: 'rust-native forced but unavailable',
      toast: '原生增强不可用',
    };
  }

  if (prefsBackend === 'rust-demux') {
    if (!webEnhanceEnabled) {
      return {
        pipeline: 'none',
        reason: 'webEnhanceEnabled=false blocks rust-demux→web',
      };
    }
    if (!caps.rustDemux) {
      return {
        pipeline: 'none',
        reason: 'rust-demux unavailable',
        toast: 'Rust 拆封装不可用',
      };
    }
    if (trackBlocksWeb(input)) {
      return {
        pipeline: 'none',
        reason: 'per-track codec unsupported',
        toast: '当前音视频编码不被 WebCodecs 支持',
      };
    }
    const tier = pickWebTier(caps);
    if (tier === 'none') {
      return { pipeline: 'none', reason: 'no web tier for demux output', toast: '无可用 Web 呈现档' };
    }
    return { pipeline: 'rust-demux', reason: `forced rust-demux + ${tier}` };
  }

  if (prefsBackend === 'web') {
    if (!webEnhanceEnabled) {
      return {
        pipeline: 'none',
        reason: 'webEnhanceEnabled=false overrides enhanceBackend=web',
      };
    }
    if (trackBlocksWeb(input)) {
      return {
        pipeline: 'none',
        reason: 'per-track codec unsupported',
        toast: '当前音视频编码不被 WebCodecs 支持',
      };
    }
    if (needsDemux && caps.rustDemux) {
      return {
        pipeline: 'rust-demux',
        reason: 'web opt-in + container needs demux',
        toast: '容器需拆封装，已走 Rust demux',
      };
    }
    const tier = pickWebTier(caps);
    if (tier === 'none') {
      return { pipeline: 'none', reason: 'web forced but no tier', toast: '当前环境无 Web 增强能力' };
    }
    return { pipeline: tier, reason: `forced web → ${tier}` };
  }

  // auto：mkv 等唯一可播路径；mpv 优先
  if (needsDemux) {
    if (caps.mpv) {
      return {
        pipeline: 'mpv',
        reason: 'auto: container needs demux, prefer mpv',
        toast: '当前容器需增强核播放',
      };
    }
    if (caps.rustDemux && webEnhanceEnabled) {
      const tier = pickWebTier(caps);
      if (tier !== 'none' && !trackBlocksWeb(input)) {
        return {
          pipeline: 'rust-demux',
          reason: 'auto: container needs demux, only playable path',
          toast: '当前容器经 Rust 拆封装播放（WebView 无法直接播）',
        };
      }
    }
    return {
      pipeline: 'none',
      reason: 'auto: needs demux but no mpv/rust-demux',
      toast: '无法播放该容器，请安装增强核或启用拆封装',
    };
  }

  return { pipeline: 'none', reason: 'auto: no enhance (web is opt-in)' };
}

export function isWebPipeline(id: EnhancePipelineId): boolean {
  return id === 'web-full' || id === 'web-sr' || id === 'video-overlay' || id === 'rust-demux';
}

export function allowsAnime4kRifeCascade(id: EnhancePipelineId): boolean {
  return id === 'web-full' || id === 'rust-demux' || id === 'rust-native';
}
