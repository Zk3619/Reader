/**
 * 主题包导出质量门禁
 */

import type { ReaderThemePackV1, ContainerBackgroundConfig } from '@/lib/theme/schema/theme-pack-v1';
import {
  contrastRatio,
  meetsContrast,
  type ContrastLevel,
} from '@/lib/theme/quality/contrast-checker';
import type { SemanticColorTokens } from '@/lib/theme/types';

export type ThemeQualitySeverity = 'error' | 'warning' | 'info';

export interface ThemeQualityIssue {
  path: string;
  message: string;
  severity: ThemeQualitySeverity;
}

export interface ThemeQualityGateResult {
  ok: boolean;
  issues: ThemeQualityIssue[];
}

export interface ThemeQualityGateOptions {
  /** 已知资产总大小（字节）；未提供时跳过资产检查 */
  assetSizeBytes?: number;
  /** 是否含 preview.png */
  hasPreviewPng?: boolean;
  /** 覆盖包内 accessibility.targetContrast */
  targetContrast?: ContrastLevel;
}

const ASSET_SIZE_LIMIT_BYTES = 15 * 1024 * 1024;
const BLUR_LAYER_WARN_THRESHOLD = 3;

const CONTRAST_PAIRS: Array<{
  fg: keyof SemanticColorTokens;
  bg: keyof SemanticColorTokens;
  label: string;
}> = [
  { fg: 'foreground', bg: 'background', label: '前景/背景' },
  { fg: 'cardForeground', bg: 'card', label: '卡片文字/背景' },
  { fg: 'primaryForeground', bg: 'primary', label: '主色文字/背景' },
  { fg: 'mutedForeground', bg: 'muted', label: '弱化文字/背景' },
  { fg: 'sidebarForeground', bg: 'sidebar', label: '侧栏文字/背景' },
];

const FORBIDDEN_CSS_PATTERNS = [
  /@import\s/i,
  /position\s*:\s*fixed/i,
  /javascript\s*:/i,
];

function readBackgroundBlurPx(bg?: ContainerBackgroundConfig): number {
  if (!bg || bg.type === 'none') return 0;
  return bg.blurPx ?? 0;
}

function countBlurLayers(pack: ReaderThemePackV1): number {
  let count = 0;

  const visitSurface = (partial?: { blurPx?: number }) => {
    if ((partial?.blurPx ?? 0) > 0) count += 1;
  };

  const visitBackground = (bg?: ContainerBackgroundConfig) => {
    if (readBackgroundBlurPx(bg) > 0) count += 1;
  };

  const appComponents = pack.app?.components ?? {};
  for (const override of Object.values(appComponents)) {
    if (!override) continue;
    visitSurface(override.surfaceAppearance);
    visitBackground(override.background);
  }

  const viewerComponents = pack.viewer?.components ?? {};
  for (const override of Object.values(viewerComponents)) {
    if (!override) continue;
    visitSurface(override.surfaceAppearance);
    visitBackground(override.background);
  }

  visitBackground(pack.viewer?.text?.contentBackground);
  visitBackground(pack.viewer?.text?.chromeBackground);
  for (const section of Object.values(pack.targets ?? {})) {
    if (!section) continue;
    visitBackground(section.background);
    for (const override of Object.values(section.components ?? {})) {
      if (!override) continue;
      visitSurface(override.surfaceAppearance);
      visitBackground(override.background);
    }
  }

  return count;
}

function checkSemanticContrast(
  tokens: SemanticColorTokens,
  mode: 'light' | 'dark',
  level: ContrastLevel,
  issues: ThemeQualityIssue[],
  basePath = 'app.tokens',
): void {
  for (const pair of CONTRAST_PAIRS) {
    const fg = tokens[pair.fg];
    const bg = tokens[pair.bg];
    if (!fg || !bg) continue;

    const ratio = contrastRatio(fg, bg);
    const pass = meetsContrast(fg, bg, level);
    const severity: ThemeQualitySeverity = pass ? 'info' : 'error';

    if (!pass || ratio < 7) {
      issues.push({
        path: `${basePath}.${mode}.${pair.fg}`,
        message: `${mode === 'light' ? '浅色' : '深色'}模式 ${pair.label} 对比度 ${ratio.toFixed(2)}:1${pass ? '（未达 AAA）' : '（未达 AA）'}`,
        severity: pass ? 'warning' : severity,
      });
    }
  }
}

/** 运行质量门禁检查 */
export function runThemePackQualityGate(
  pack: ReaderThemePackV1,
  options: ThemeQualityGateOptions = {},
): ThemeQualityGateResult {
  const issues: ThemeQualityIssue[] = [];
  const level: ContrastLevel =
    options.targetContrast ?? pack.accessibility?.targetContrast ?? 'AA';
  const enforceContrast = pack.accessibility?.enforceOnExport === true;

  if (pack.app?.tokens.light) {
    checkSemanticContrast(pack.app.tokens.light, 'light', level, issues);
  }
  if (pack.app?.tokens.dark) {
    checkSemanticContrast(pack.app.tokens.dark, 'dark', level, issues);
  }
  for (const [target, section] of Object.entries(pack.targets ?? {})) {
    if (section?.tokens?.light) {
      checkSemanticContrast(
        section.tokens.light,
        'light',
        level,
        issues,
        `targets.${target}.tokens`,
      );
    }
    if (section?.tokens?.dark) {
      checkSemanticContrast(
        section.tokens.dark,
        'dark',
        level,
        issues,
        `targets.${target}.tokens`,
      );
    }
  }

  const blurLayers = countBlurLayers(pack);
  if (blurLayers > BLUR_LAYER_WARN_THRESHOLD) {
    issues.push({
      path: 'surfaceAppearance',
      message: `模糊层数 ${blurLayers} 超过建议值 ${BLUR_LAYER_WARN_THRESHOLD}，可能影响性能`,
      severity: 'warning',
    });
  }

  const customCss = pack.advanced?.customCss ?? [];
  customCss.forEach((block, i) => {
    for (const pattern of FORBIDDEN_CSS_PATTERNS) {
      if (pattern.test(block.css)) {
        issues.push({
          path: `advanced.customCss[${i}]`,
          message: `自定义 CSS 含不允许的模式: ${pattern}`,
          severity: 'error',
        });
      }
    }
  });

  if (options.assetSizeBytes != null && options.assetSizeBytes > ASSET_SIZE_LIMIT_BYTES) {
    const mb = (options.assetSizeBytes / (1024 * 1024)).toFixed(1);
    issues.push({
      path: 'assets',
      message: `主题资产总大小 ${mb}MB 超过 ${ASSET_SIZE_LIMIT_BYTES / (1024 * 1024)}MB 限制`,
      severity: 'error',
    });
  }

  if (!pack.meta?.author) {
    issues.push({
      path: 'meta.author',
      message: '建议填写作者信息，便于社区分享',
      severity: 'warning',
    });
  }

  if (options.hasPreviewPng === false) {
    issues.push({
      path: 'meta.previewAssetId',
      message: '导出 ZIP 建议包含 preview.png 缩略图',
      severity: 'warning',
    });
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const contrastErrors = errors.filter((i) => i.path.includes('tokens'));
  const blockingErrors = enforceContrast ? errors : errors.filter((i) => !i.path.includes('tokens'));

  return {
    ok: blockingErrors.length === 0 && (!enforceContrast || contrastErrors.length === 0),
    issues,
  };
}

export { ASSET_SIZE_LIMIT_BYTES, BLUR_LAYER_WARN_THRESHOLD };
