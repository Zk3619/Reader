import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockApp = {
  activeThemePresetId: '',
  activeViewerThemePresetId: '',
};

vi.mock('@/stores/settings', () => ({
  settingsStore: {
    get state() {
      return { app: mockApp };
    },
  },
}));

import {
  defaultImportSelection,
  mergeThemePackForImport,
  type ImportThemeComparison,
} from '@/lib/theme/import/import-theme-merge';
import { BUILTIN_DEFAULT_PRESET_ID } from '@/lib/theme/theme-preset-file-storage';
import { createDefaultThemePack, type ThemePresetRecord } from '@/lib/theme/schema/theme-pack-v1';

function makeRecord(manifest: ReturnType<typeof createDefaultThemePack>): ThemePresetRecord {
  return {
    id: manifest.id,
    name: manifest.name,
    kind: 'user',
    scopesApp: true,
    scopesViewer: true,
    manifest,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('import-theme-merge', () => {
  beforeEach(() => {
    mockApp.activeThemePresetId = '';
    mockApp.activeViewerThemePresetId = '';
  });

  it('returns null for builtin default preset', () => {
    const incoming = { ...createDefaultThemePack(), id: BUILTIN_DEFAULT_PRESET_ID };
    expect(mergeThemePackForImport(incoming, null, {})).toBeNull();
  });

  it('keeps existing name when keepName is true', () => {
    const incoming = createDefaultThemePack({ name: 'Incoming' });
    const existingManifest = { ...incoming, name: 'Local Name' };
    const existing = makeRecord(existingManifest);
    const merged = mergeThemePackForImport(incoming, existing, { keepName: true });
    expect(merged?.name).toBe('Local Name');
  });

  it('preserves local assets when overwriteAssets is false', () => {
    const incoming = createDefaultThemePack();
    incoming.assets = {
      a: { path: 'incoming.png', mime: 'image/png', kind: 'image' },
    };
    const existingManifest = createDefaultThemePack();
    existingManifest.id = incoming.id;
    existingManifest.assets = {
      b: { path: 'local.png', mime: 'image/png', kind: 'image' },
    };
    const merged = mergeThemePackForImport(incoming, makeRecord(existingManifest), {
      overwriteAssets: false,
    });
    expect(merged?.assets).toEqual(existingManifest.assets);
  });

  it('skips merge when keepActive is true for active preset', () => {
    const incoming = createDefaultThemePack();
    const existing = makeRecord(incoming);
    mockApp.activeThemePresetId = incoming.id;
    expect(mergeThemePackForImport(incoming, existing, { keepActive: true })).toBeNull();
  });

  it('selects new packs and newer updates in defaultImportSelection', () => {
    const base = createDefaultThemePack();
    const older = { ...base, updatedAt: '2020-01-01T00:00:00.000Z' };
    const newer = { ...base, updatedAt: '2030-01-01T00:00:00.000Z' };
    const comparisons: ImportThemeComparison[] = [
      { incoming: createDefaultThemePack(), existing: null, status: 'new' },
      { incoming: newer, existing: makeRecord(older), status: 'update' },
    ];
    const selected = defaultImportSelection(comparisons);
    expect(selected.size).toBe(2);
    expect(selected.has(comparisons[0]!.incoming.id)).toBe(true);
    expect(selected.has(newer.id)).toBe(true);
  });
});
