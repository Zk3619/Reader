/**
 * Anime4K：按 Mode/Quality 拼 mpv --glsl-shaders= 链
 * 着色器文件名对齐 bloc97/Anime4K 与小喵 assets 常见命名
 */

import type { Anime4KMode, Anime4KQuality } from '@/lib/media/video/playback/types';

const QUALITY_LETTER: Record<Anime4KQuality, 'S' | 'M' | 'L'> = {
  fast: 'S',
  balanced: 'M',
  high: 'L',
};

/** 后级降一档，减轻负载（小喵同思路） */
function lowerQuality(q: Anime4KQuality): Anime4KQuality {
  if (q === 'high') return 'balanced';
  if (q === 'balanced') return 'fast';
  return 'fast';
}

function restore(q: Anime4KQuality): string {
  return `Anime4K_Restore_CNN_${QUALITY_LETTER[q]}v.glsl`;
}

function upscale(q: Anime4KQuality): string {
  return `Anime4K_Upscale_CNN_x2_${QUALITY_LETTER[q]}v.glsl`;
}

function clamp(): string {
  return 'Anime4K_Clamp_Highlights.glsl';
}

/**
 * 返回相对 shaders 根目录的文件名列表（mode=off 时为空）
 * Mode 语义对齐小喵/Anime4K 文档 A/B/C 及组合
 */
export function buildAnime4KShaderFiles(
  mode: Anime4KMode,
  quality: Anime4KQuality = 'balanced',
): string[] {
  if (mode === 'off') return [];
  const q2 = lowerQuality(quality);
  switch (mode) {
    case 'A':
      return [restore(quality), upscale(quality), clamp()];
    case 'B':
      return [restore(quality), upscale(quality), restore(q2), clamp()];
    case 'C':
      return [upscale(quality), restore(q2), clamp()];
    case 'AA':
      return [restore(quality), upscale(quality), restore(q2), upscale(q2), clamp()];
    case 'BB':
      return [
        restore(quality),
        upscale(quality),
        restore(q2),
        upscale(q2),
        restore(q2),
        clamp(),
      ];
    case 'CA':
      return [upscale(quality), restore(q2), upscale(q2), clamp()];
    default:
      return [];
  }
}

/** 拼绝对路径列表，供 mpv --glsl-shaders=a;b;c */
export function joinGlslShadersArg(shaderPaths: string[]): string {
  if (!shaderPaths.length) return '';
  // mpv 在 Windows 上常用 ; 或 : 分隔；统一用 ; 并让调用方规范化
  return shaderPaths.join(';');
}

export function resolveShaderPaths(
  shadersDir: string,
  mode: Anime4KMode,
  quality: Anime4KQuality,
): string[] {
  const files = buildAnime4KShaderFiles(mode, quality);
  if (!files.length) return [];
  const root = shadersDir.replace(/[/\\]+$/, '');
  if (!root) return files;
  const sep = root.includes('\\') ? '\\' : '/';
  return files.map((f) => `${root}${sep}${f}`);
}
