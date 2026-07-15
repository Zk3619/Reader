import { describe, expect, it } from 'vitest';
import {
  parseThemePackJson,
  parseThemePackJsonString,
} from '@/lib/theme/schema/validate-theme-pack';
import {
  createDefaultThemePack,
  THEME_PACK_SCHEMA_VERSION,
  THEME_PACK_SCHEMA_VERSION_V2,
  THEME_PACK_SCHEMA_VERSION_V3,
} from '@/lib/theme/schema/theme-pack-v1';

describe('validate-theme-pack', () => {
  it('accepts schema version 2 with v2 metadata', () => {
    const pack = createDefaultThemePack({ name: 'v2 主题' });
    const v2 = {
      ...pack,
      schemaVersion: THEME_PACK_SCHEMA_VERSION_V2,
      meta: { author: 'Author', license: 'MIT' as const, category: 'glass' as const },
      generation: { primarySeed: '#336699', stylePresetId: 'glass' },
      accessibility: { targetContrast: 'AA' as const },
    };
    const result = parseThemePackJson(v2);
    expect(result.ok).toBe(true);
    expect(result.pack?.schemaVersion).toBe(THEME_PACK_SCHEMA_VERSION_V2);
    expect(result.pack?.meta?.author).toBe('Author');
    expect(result.pack?.generation?.stylePresetId).toBe('glass');
    expect(result.pack?.accessibility?.targetContrast).toBe('AA');
  });

  it('accepts schema version 1', () => {
    const pack = {
      ...createDefaultThemePack(),
      schemaVersion: THEME_PACK_SCHEMA_VERSION,
    };
    const result = parseThemePackJson(pack);
    expect(result.ok).toBe(true);
    expect(result.pack?.schemaVersion).toBe(THEME_PACK_SCHEMA_VERSION);
  });

  it('round-trips schema v3 target sections and drops unknown targets', () => {
    const pack = createDefaultThemePack({ name: '目标主题' });
    const result = parseThemePackJson({
      ...pack,
      schemaVersion: THEME_PACK_SCHEMA_VERSION_V3,
      targets: {
        'music.playDetail': {
          typography: { fontFamily: 'Target Sans', scale: 1.1 },
        },
        unknown: { typography: { fontFamily: 'Ignored' } },
      },
    });
    expect(result.ok).toBe(true);
    expect(result.pack?.targets?.['music.playDetail']?.typography?.fontFamily).toBe(
      'Target Sans',
    );
    expect(result.pack?.targets).not.toHaveProperty('unknown');
  });

  it('rejects unsupported schema version', () => {
    const result = parseThemePackJson({ schemaVersion: 99, name: 'x' });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.path === 'schemaVersion')).toBe(true);
  });

  it('rejects forbidden CSS in advanced block', () => {
    const pack = createDefaultThemePack();
    const result = parseThemePackJson({
      ...pack,
      advanced: { customCss: [{ css: 'javascript:alert(1)' }] },
    });
    expect(result.ok).toBe(true);
    expect(result.issues.some((i) => i.path.includes('customCss'))).toBe(true);
  });

  it('round-trips v2 pack via JSON string', () => {
    const pack = {
      ...createDefaultThemePack({ name: '字符串导入' }),
      schemaVersion: THEME_PACK_SCHEMA_VERSION_V2,
    };
    const result = parseThemePackJsonString(JSON.stringify(pack));
    expect(result.ok).toBe(true);
    expect(result.pack?.id).toBe(pack.id);
    expect(result.pack?.schemaVersion).toBe(THEME_PACK_SCHEMA_VERSION_V2);
  });

  it('returns parse error for invalid JSON string', () => {
    const result = parseThemePackJsonString('{ not json');
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.message).toContain('JSON');
  });
});
