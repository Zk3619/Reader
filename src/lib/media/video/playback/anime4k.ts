/**
 * Anime4K：按 Mode/Quality 拼 mpv glsl-shaders 链
 * 对齐 bloc97/Anime4K v4 官方推荐 + 小喵 Anime4KManager
 * @see docs/VIDEO_ANIME4K_MPV_ANDROID_GAP.md
 */

import type { Anime4KMode, Anime4KQuality } from '@/lib/media/video/playback/types';

const QUALITY_LETTER: Record<Anime4KQuality, 'S' | 'M' | 'L'> = {
  fast: 'S',
  balanced: 'M',
  high: 'L',
};

/** 后级降一档，抵消 ×2 后 4× 像素量（官方/小喵同思路） */
function lowerLetter(q: Anime4KQuality): 'S' | 'M' | 'L' {
  if (q === 'high') return 'M';
  return 'S';
}

function letter(q: Anime4KQuality): 'S' | 'M' | 'L' {
  return QUALITY_LETTER[q];
}

function clamp(): string {
  return 'Anime4K_Clamp_Highlights.glsl';
}

function restore(q: Anime4KQuality): string {
  return `Anime4K_Restore_CNN_${letter(q)}.glsl`;
}

function restoreSoft(q: Anime4KQuality): string {
  return `Anime4K_Restore_CNN_Soft_${letter(q)}.glsl`;
}

function upscale(q: Anime4KQuality): string {
  return `Anime4K_Upscale_CNN_x2_${letter(q)}.glsl`;
}

function upscaleDenoise(q: Anime4KQuality): string {
  return `Anime4K_Upscale_Denoise_CNN_x2_${letter(q)}.glsl`;
}

function restoreLower(q: Anime4KQuality): string {
  return `Anime4K_Restore_CNN_${lowerLetter(q)}.glsl`;
}

function restoreSoftLower(q: Anime4KQuality): string {
  return `Anime4K_Restore_CNN_Soft_${lowerLetter(q)}.glsl`;
}

function upscaleLower(q: Anime4KQuality): string {
  return `Anime4K_Upscale_CNN_x2_${lowerLetter(q)}.glsl`;
}

const AUTO_X2 = 'Anime4K_AutoDownscalePre_x2.glsl';
const AUTO_X4 = 'Anime4K_AutoDownscalePre_x4.glsl';
const DEBLUR_DOG = 'Anime4K_Deblur_DoG.glsl';

export type BuildAnime4KOptions = {
  /** 链尾追加 Deblur_DoG（默认 false） */
  deblur?: boolean;
};

/**
 * 返回相对 shaders 根目录的文件名列表（mode=off 时为空）
 * Mode：A/B/C 与 AA/BB/CA（对应官方 A+/B+/C+）
 */
export function buildAnime4KShaderFiles(
  mode: Anime4KMode,
  quality: Anime4KQuality = 'balanced',
  opts?: BuildAnime4KOptions,
): string[] {
  if (mode === 'off') return [];

  const shaders: string[] = [clamp()];

  switch (mode) {
    case 'A':
      // Clamp → Restore → Upscale → AutoDownscale×2 → Upscale(lower)
      shaders.push(restore(quality), upscale(quality), AUTO_X2, AUTO_X4, upscaleLower(quality));
      break;
    case 'B':
      // Clamp → Restore_Soft → Upscale → AutoDownscale×2 → Upscale(lower)
      shaders.push(restoreSoft(quality), upscale(quality), AUTO_X2, AUTO_X4, upscaleLower(quality));
      break;
    case 'C':
      // Clamp → Upscale_Denoise → AutoDownscale×2 → Upscale(lower)
      shaders.push(upscaleDenoise(quality), AUTO_X2, AUTO_X4, upscaleLower(quality));
      break;
    case 'AA':
      // A+A：Restore → Upscale → Auto → Restore(lower) → Upscale(lower)
      shaders.push(
        restore(quality),
        upscale(quality),
        AUTO_X2,
        AUTO_X4,
        restoreLower(quality),
        upscaleLower(quality),
      );
      break;
    case 'BB':
      // B+B
      shaders.push(
        restoreSoft(quality),
        upscale(quality),
        AUTO_X2,
        AUTO_X4,
        restoreSoftLower(quality),
        upscaleLower(quality),
      );
      break;
    case 'CA':
      // C+A：Upscale_Denoise → Auto → Restore(lower) → Upscale(lower)
      shaders.push(
        upscaleDenoise(quality),
        AUTO_X2,
        AUTO_X4,
        restoreLower(quality),
        upscaleLower(quality),
      );
      break;
    default:
      return [];
  }

  if (opts?.deblur) {
    shaders.push(DEBLUR_DOG);
  }
  return shaders;
}

/** 是否 Windows（路径含盘符或 navigator） */
function isWindowsPathSepPreferred(samplePath?: string): boolean {
  if (samplePath && /^[A-Za-z]:[\\/]/.test(samplePath)) return true;
  if (samplePath?.includes('\\')) return true;
  if (typeof navigator !== 'undefined' && /Win/i.test(navigator.platform || '')) {
    return true;
  }
  return false;
}

/**
 * 拼 glsl-shaders 属性值。
 * Windows 用 `;`，类 Unix 用 `:`（与 mpv / 小喵一致）。
 */
export function joinGlslShadersArg(
  shaderPaths: string[],
  opts?: { windows?: boolean },
): string {
  if (!shaderPaths.length) return '';
  const win =
    opts?.windows ??
    (shaderPaths.some((p) => isWindowsPathSepPreferred(p)) ||
      isWindowsPathSepPreferred());
  return shaderPaths.join(win ? ';' : ':');
}

export function resolveShaderPaths(
  shadersDir: string,
  mode: Anime4KMode,
  quality: Anime4KQuality,
  opts?: BuildAnime4KOptions,
): string[] {
  const files = buildAnime4KShaderFiles(mode, quality, opts);
  if (!files.length) return [];
  const root = shadersDir.replace(/[/\\]+$/, '');
  if (!root) return files;
  const sep = root.includes('\\') && !root.includes('/') ? '\\' : '/';
  // Windows 盘符路径统一用 \
  const useWin = isWindowsPathSepPreferred(root);
  const pathSep = useWin ? '\\' : sep === '\\' ? '\\' : '/';
  const normalizedRoot = useWin ? root.replace(/\//g, '\\') : root.replace(/\\/g, '/');
  return files.map((f) => `${normalizedRoot}${pathSep}${f}`);
}

/** 捆绑资源相对名（与 src-tauri/resources/shaders 一致） */
export const ANIME4K_BUNDLED_SHADER_DIR_NAME = 'shaders';

/** 产品默认捆绑的文件名集合（小喵 S/M/L 子集） */
export const ANIME4K_BUNDLED_SHADER_FILES = [
  'Anime4K_Clamp_Highlights.glsl',
  'Anime4K_AutoDownscalePre_x2.glsl',
  'Anime4K_AutoDownscalePre_x4.glsl',
  'Anime4K_Deblur_DoG.glsl',
  'Anime4K_Deblur_Original.glsl',
  'Anime4K_Restore_CNN_S.glsl',
  'Anime4K_Restore_CNN_M.glsl',
  'Anime4K_Restore_CNN_L.glsl',
  'Anime4K_Restore_CNN_Soft_S.glsl',
  'Anime4K_Restore_CNN_Soft_M.glsl',
  'Anime4K_Restore_CNN_Soft_L.glsl',
  'Anime4K_Upscale_CNN_x2_S.glsl',
  'Anime4K_Upscale_CNN_x2_M.glsl',
  'Anime4K_Upscale_CNN_x2_L.glsl',
  'Anime4K_Upscale_Denoise_CNN_x2_S.glsl',
  'Anime4K_Upscale_Denoise_CNN_x2_M.glsl',
  'Anime4K_Upscale_Denoise_CNN_x2_L.glsl',
] as const;
