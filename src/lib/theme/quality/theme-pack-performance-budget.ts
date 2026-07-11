/**
 * 高级模式性能预算评估
 */

import type { ReaderThemePackV1, ThemeEffectConfig, ContainerBackgroundConfig } from '@/lib/theme/schema/theme-pack-v1';
import { ASSET_SIZE_LIMIT_BYTES } from '@/lib/theme/quality/theme-pack-quality-gate';

export type PerformanceBudgetLevel = 'green' | 'yellow' | 'red';

export interface PerformanceBudgetMetrics {
  enabledEffects: number;
  tsParticlesEnabled: boolean;
  blurLayers: number;
  assetSizeBytes: number;
  customCssBlocks: number;
  customHtmlBlocks: number;
}

export interface PerformanceBudgetResult {
  level: PerformanceBudgetLevel;
  score: number;
  metrics: PerformanceBudgetMetrics;
  warnings: string[];
}

export interface PerformanceBudgetOptions {
  assetSizeBytes?: number;
}

function readBackgroundBlurPx(bg?: ContainerBackgroundConfig): number {
  if (!bg || bg.type === 'none') return 0;
  return bg.blurPx ?? 0;
}

function countBlurLayers(pack: ReaderThemePackV1): number {
  let count = 0;
  const bump = (blurPx?: number) => {
    if ((blurPx ?? 0) > 0) count += 1;
  };

  for (const override of Object.values(pack.app?.components ?? {})) {
    bump(override?.surfaceAppearance?.blurPx);
    bump(readBackgroundBlurPx(override?.background));
  }
  for (const override of Object.values(pack.viewer?.components ?? {})) {
    bump(override?.surfaceAppearance?.blurPx);
    bump(readBackgroundBlurPx(override?.background));
  }
  bump(readBackgroundBlurPx(pack.viewer?.text?.contentBackground));
  bump(readBackgroundBlurPx(pack.viewer?.text?.chromeBackground));

  return count;
}

function countEnabledEffects(effects: ThemeEffectConfig[] | undefined): number {
  return (effects ?? []).filter((e) => e.enabled).length;
}

/** 评估主题包性能预算 */
export function evaluateThemePackPerformanceBudget(
  pack: ReaderThemePackV1,
  options: PerformanceBudgetOptions = {},
): PerformanceBudgetResult {
  const metrics: PerformanceBudgetMetrics = {
    enabledEffects: countEnabledEffects(pack.advanced?.effects),
    tsParticlesEnabled: pack.advanced?.threeJs?.enabled === true,
    blurLayers: countBlurLayers(pack),
    assetSizeBytes: options.assetSizeBytes ?? 0,
    customCssBlocks: pack.advanced?.customCss?.length ?? 0,
    customHtmlBlocks: pack.advanced?.customHtml?.length ?? 0,
  };

  const warnings: string[] = [];
  let score = 100;

  if (metrics.enabledEffects > 0) {
    score -= metrics.enabledEffects * 8;
    if (metrics.enabledEffects >= 3) {
      warnings.push(`已启用 ${metrics.enabledEffects} 个鼠标/背景特效`);
    }
  }

  if (metrics.tsParticlesEnabled) {
    score -= 20;
    warnings.push('已启用 tsParticles 背景层');
  }

  if (metrics.blurLayers > 0) {
    score -= metrics.blurLayers * 6;
    if (metrics.blurLayers > 3) {
      warnings.push(`backdrop-filter 模糊层 ${metrics.blurLayers} 个，可能影响帧率`);
    }
  }

  if (metrics.customCssBlocks > 5) {
    score -= 10;
    warnings.push(`自定义 CSS 块 ${metrics.customCssBlocks} 个`);
  }

  if (metrics.customHtmlBlocks > 0) {
    score -= metrics.customHtmlBlocks * 5;
    warnings.push(`自定义 HTML 挂载点 ${metrics.customHtmlBlocks} 个`);
  }

  if (metrics.assetSizeBytes > ASSET_SIZE_LIMIT_BYTES * 0.5) {
    score -= 15;
    warnings.push('主题资产体积较大');
  }

  score = Math.max(0, Math.min(100, score));

  let level: PerformanceBudgetLevel = 'green';
  if (score < 50) level = 'red';
  else if (score < 75) level = 'yellow';

  return { level, score, metrics, warnings };
}
