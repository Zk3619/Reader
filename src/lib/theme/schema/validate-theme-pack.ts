/**
 * Theme Pack v1 解析与校验（无 zod 依赖，运行时轻量校验）
 */

import { DEFAULT_APP_THEME } from '@/lib/theme/AppTheme';
import {
  createDefaultThemePack,
  createThemePackId,
  THEME_PACK_SCHEMA_VERSION,
  type ReaderThemePackV1,
  type ThemeEffectConfig,
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

function normalizePack(raw: Record<string, unknown>): ReaderThemePackV1 {
  const now = new Date().toISOString();
  const fallback = createDefaultThemePack();
  const scopesRaw = isRecord(raw.scopes) ? raw.scopes : {};
  const appRaw = isRecord(raw.app) ? raw.app : null;
  const tokensRaw = appRaw && isRecord(appRaw.tokens) ? appRaw.tokens : null;

  return {
    schemaVersion: THEME_PACK_SCHEMA_VERSION,
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
    advanced: raw.advanced as ReaderThemePackV1['advanced'],
    assets: raw.assets as ReaderThemePackV1['assets'],
  };
}

/** 解析并校验主题包 JSON */
export function parseThemePackJson(input: unknown): ThemePackValidationResult {
  const issues: ThemePackValidationIssue[] = [];

  if (!isRecord(input)) {
    return { ok: false, issues: [{ path: '', message: '主题包必须是 JSON 对象' }] };
  }

  const version = input.schemaVersion;
  if (version !== THEME_PACK_SCHEMA_VERSION) {
    issues.push({
      path: 'schemaVersion',
      message: `不支持的 schema 版本: ${String(version)}，期望 ${THEME_PACK_SCHEMA_VERSION}`,
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
