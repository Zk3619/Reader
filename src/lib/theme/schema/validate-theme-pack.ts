/**
 * Theme Pack v1 解析与校验（无 zod 依赖，运行时轻量校验）
 */

import { DEFAULT_APP_THEME } from '@/lib/theme/AppTheme';
import { isThemeTargetId } from '@/lib/theme/theme-targets';
import {
  createDefaultThemePack,
  createThemePackId,
  THEME_PACK_SCHEMA_VERSION,
  THEME_PACK_SCHEMA_VERSION_V2,
  THEME_PACK_SCHEMA_VERSION_V3,
  type ReaderThemePackV1,
  type ThemeEffectConfig,
  type ThemePackAccessibility,
  type ThemePackGeneration,
  type ThemePackMeta,
  type ThemePackSchemaVersion,
} from '@/lib/theme/schema/theme-pack-v1';

const FORBIDDEN_CSS_PATTERNS = [
  /@import\s/i,
  /position\s*:\s*fixed/i,
  /javascript\s*:/i,
];

export interface ThemePackValidationIssue {
  path: string;
  message: string;
}

export interface ThemePackValidationResult {
  ok: boolean;
  pack?: ReaderThemePackV1;
  issues: ThemePackValidationIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function validateCustomCss(css: unknown, issues: ThemePackValidationIssue[], basePath: string): void {
  if (!Array.isArray(css)) return;
  css.forEach((block, i) => {
    if (!isRecord(block)) return;
    const text = asString(block.css);
    for (const pattern of FORBIDDEN_CSS_PATTERNS) {
      if (pattern.test(text)) {
        issues.push({
          path: `${basePath}[${i}].css`,
          message: `不允许的 CSS 模式: ${pattern}`,
        });
      }
    }
  });
}

function validateEffects(effects: unknown, issues: ThemePackValidationIssue[]): void {
  if (!Array.isArray(effects)) return;
  effects.forEach((effect, i) => {
    if (!isRecord(effect) || typeof effect.type !== 'string') {
      issues.push({ path: `advanced.effects[${i}]`, message: '无效的特效配置' });
      return;
    }
    const t = effect.type as ThemeEffectConfig['type'];
    if (
      t !== 'mouseTrail' &&
      t !== 'mouseGlow' &&
      t !== 'backgroundParallax' &&
      t !== 'backgroundRipple' &&
      t !== 'noiseOverlay' &&
      t !== 'clickParticles' &&
      t !== 'clickRipple' &&
      t !== 'customCursor'
    ) {
      issues.push({ path: `advanced.effects[${i}].type`, message: `未知特效类型: ${t}` });
    }
  });
}

function normalizeSchemaVersion(value: unknown): ThemePackSchemaVersion {
  if (value === THEME_PACK_SCHEMA_VERSION_V3) return THEME_PACK_SCHEMA_VERSION_V3;
  if (value === THEME_PACK_SCHEMA_VERSION_V2) return THEME_PACK_SCHEMA_VERSION_V2;
  return THEME_PACK_SCHEMA_VERSION;
}

function normalizeMeta(raw: unknown): ThemePackMeta | undefined {
  if (!isRecord(raw)) return undefined;
  const license = raw.license;
  const category = raw.category;
  return {
    minAppVersion: asString(raw.minAppVersion) || undefined,
    license:
      license === 'CC0' ||
      license === 'CC-BY' ||
      license === 'CC-BY-NC' ||
      license === 'MIT' ||
      license === 'personal'
        ? license
        : undefined,
    author: asString(raw.author) || undefined,
    locale: asString(raw.locale) || undefined,
    category:
      category === 'minimal' ||
      category === 'glass' ||
      category === 'paper' ||
      category === 'dark' ||
      category === 'custom'
        ? category
        : undefined,
    previewAssetId: asString(raw.previewAssetId) || undefined,
  };
}

function normalizeGeneration(raw: unknown): ThemePackGeneration | undefined {
  if (!isRecord(raw)) return undefined;
  return {
    primarySeed: asString(raw.primarySeed) || undefined,
    backgroundSeed: asString(raw.backgroundSeed) || undefined,
    accentSeed: asString(raw.accentSeed) || undefined,
    stylePresetId: asString(raw.stylePresetId) || undefined,
    generatedAt: asString(raw.generatedAt) || undefined,
    lockedPaths: Array.isArray(raw.lockedPaths)
      ? raw.lockedPaths.filter((p): p is string => typeof p === 'string')
      : undefined,
  };
}

function normalizeAccessibility(raw: unknown): ThemePackAccessibility | undefined {
  if (!isRecord(raw)) return undefined;
  const targetContrast = raw.targetContrast;
  return {
    targetContrast:
      targetContrast === 'AA' || targetContrast === 'AAA' || targetContrast === 'relaxed'
        ? targetContrast
        : undefined,
    enforceOnExport: raw.enforceOnExport === true ? true : undefined,
  };
}

function normalizeTargets(raw: unknown): ReaderThemePackV1['targets'] {
  if (!isRecord(raw)) return undefined;
  const targets: NonNullable<ReaderThemePackV1['targets']> = {};
  for (const [target, section] of Object.entries(raw)) {
    if (!isThemeTargetId(target) || !isRecord(section)) continue;
    targets[target] = section as NonNullable<ReaderThemePackV1['targets']>[typeof target];
  }
  return Object.keys(targets).length > 0 ? targets : undefined;
}

function normalizePack(raw: Record<string, unknown>): ReaderThemePackV1 {
  const now = new Date().toISOString();
  const fallback = createDefaultThemePack();
  const scopesRaw = isRecord(raw.scopes) ? raw.scopes : {};
  const appRaw = isRecord(raw.app) ? raw.app : null;
  const tokensRaw = appRaw && isRecord(appRaw.tokens) ? appRaw.tokens : null;

  return {
    schemaVersion: normalizeSchemaVersion(raw.schemaVersion),
    id: asString(raw.id, createThemePackId()),
    name: asString(raw.name, '导入的主题'),
    author: asString(raw.author) || undefined,
    description: asString(raw.description) || undefined,
    createdAt: asString(raw.createdAt, now),
    updatedAt: asString(raw.updatedAt, now),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === 'string') : undefined,
    scopes: {
      app: scopesRaw.app !== false,
      viewer: scopesRaw.viewer !== false,
    },
    app: appRaw
      ? {
          mode:
            appRaw.mode === 'light' || appRaw.mode === 'dark' || appRaw.mode === 'dual'
              ? appRaw.mode
              : 'dual',
          tokens: {
            id: asString(tokensRaw?.id, 'imported'),
            name: asString(tokensRaw?.name, asString(raw.name, '导入的主题')),
            light: (tokensRaw?.light as typeof DEFAULT_APP_THEME.light) ?? DEFAULT_APP_THEME.light,
            dark: (tokensRaw?.dark as typeof DEFAULT_APP_THEME.dark) ?? DEFAULT_APP_THEME.dark,
            layout: (tokensRaw?.layout as typeof DEFAULT_APP_THEME.layout) ?? DEFAULT_APP_THEME.layout,
          },
          components: appRaw.components as ReaderThemePackV1['app'] extends infer A
            ? A extends { components?: infer C }
              ? C
              : never
            : never,
          typography: appRaw.typography as ReaderThemePackV1['app'] extends infer A
            ? A extends { typography?: infer T }
              ? T
              : never
            : never,
          motion: appRaw.motion as ReaderThemePackV1['app'] extends infer A
            ? A extends { motion?: infer M }
              ? M
              : never
            : never,
        }
      : fallback.app,
    viewer: (raw.viewer as ReaderThemePackV1['viewer']) ?? fallback.viewer,
    targets: normalizeTargets(raw.targets),
    advanced: raw.advanced as ReaderThemePackV1['advanced'],
    assets: raw.assets as ReaderThemePackV1['assets'],
    meta: normalizeMeta(raw.meta),
    generation: normalizeGeneration(raw.generation),
    accessibility: normalizeAccessibility(raw.accessibility),
  };
}

/** 解析并校验主题包 JSON */
export function parseThemePackJson(input: unknown): ThemePackValidationResult {
  const issues: ThemePackValidationIssue[] = [];

  if (!isRecord(input)) {
    return { ok: false, issues: [{ path: '', message: '主题包必须是 JSON 对象' }] };
  }

  const version = input.schemaVersion;
  if (
    version !== THEME_PACK_SCHEMA_VERSION &&
    version !== THEME_PACK_SCHEMA_VERSION_V2 &&
    version !== THEME_PACK_SCHEMA_VERSION_V3
  ) {
    issues.push({
      path: 'schemaVersion',
      message: `不支持的 schema 版本: ${String(version)}，期望 ${THEME_PACK_SCHEMA_VERSION}、${THEME_PACK_SCHEMA_VERSION_V2} 或 ${THEME_PACK_SCHEMA_VERSION_V3}`,
    });
  }

  if (!asString(input.name)) {
    issues.push({ path: 'name', message: '缺少主题名称' });
  }

  if (input.advanced && isRecord(input.advanced)) {
    validateCustomCss(input.advanced.customCss, issues, 'advanced.customCss');
    validateEffects(input.advanced.effects, issues);
  }

  if (issues.some((i) => i.path === 'schemaVersion' || i.path === 'name')) {
    return { ok: false, issues };
  }

  const pack = normalizePack(input);
  return { ok: true, pack, issues };
}

/** 从 JSON 字符串导入 */
export function parseThemePackJsonString(json: string): ThemePackValidationResult {
  try {
    return parseThemePackJson(JSON.parse(json) as unknown);
  } catch {
    return { ok: false, issues: [{ path: '', message: 'JSON 解析失败' }] };
  }
}
