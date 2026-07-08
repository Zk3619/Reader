/**
 * Theme Studio 草稿状态
 */

import { createStore } from 'solid-js/store';
import {
  cloneThemePack,
  createDefaultThemePack,
  touchThemePack,
  type ReaderThemePackV1,
  type ThemeApplyScope,
  type ThemeComponentId,
} from '@/lib/theme/schema/theme-pack-v1';
import type { ThemePreviewViewport } from '@/lib/theme/preview/preview-viewport';

export type ThemeStudioEntry = 'settings' | 'reader';

export interface ThemeStudioState {
  open: boolean;
  entry: ThemeStudioEntry;
  draftPack: ReaderThemePackV1;
  /** 草稿变更计数，供预览层显式订阅深层更新 */
  draftRevision: number;
  savedSnapshot: string;
  scope: ThemeApplyScope;
  previewMode: 'full' | 'component';
  selectedComponentId: ThemeComponentId;
  colorMode: 'light' | 'dark';
  viewport: ThemePreviewViewport;
  presetId: string | null;
  dirty: boolean;
}

const defaultPack = createDefaultThemePack({ name: '未命名主题' });

function bumpDraftRevision(): void {
  setState('draftRevision', (revision) => revision + 1);
}

const [state, setState] = createStore<ThemeStudioState>({
  open: false,
  entry: 'settings',
  draftPack: defaultPack,
  draftRevision: 0,
  savedSnapshot: JSON.stringify(defaultPack),
  scope: 'all',
  previewMode: 'full',
  selectedComponentId: 'appShell',
  colorMode: 'light',
  viewport: 'desktop',
  presetId: null,
  dirty: false,
});

function syncDirty(pack: ReaderThemePackV1): void {
  const snap = JSON.stringify(pack);
  setState('dirty', snap !== state.savedSnapshot);
}

export const themeStudioStore = {
  state,
  openStudio(options?: {
    entry?: ThemeStudioEntry;
    scope?: ThemeApplyScope;
    pack?: ReaderThemePackV1;
    presetId?: string | null;
  }): void {
    const pack = options?.pack ? cloneThemePack(options.pack) : createDefaultThemePack();
    const snap = JSON.stringify(pack);
    setState({
      open: true,
      entry: options?.entry ?? 'settings',
      draftPack: pack,
      draftRevision: 0,
      savedSnapshot: snap,
      scope: options?.scope ?? (options?.entry === 'reader' ? 'viewer' : 'all'),
      previewMode: 'full',
      selectedComponentId: options?.scope === 'viewer' ? 'readerChrome' : 'appShell',
      colorMode: 'light',
      viewport: 'desktop',
      presetId: options?.presetId ?? pack.id,
      dirty: false,
    });
  },
  closeStudio(): void {
    setState('open', false);
  },
  setDraftPack(pack: ReaderThemePackV1): void {
    setState('draftPack', pack);
    bumpDraftRevision();
    syncDirty(pack);
  },
  patchDraft(updater: (draft: ReaderThemePackV1) => ReaderThemePackV1): void {
    const next = touchThemePack(updater(cloneThemePack(state.draftPack)));
    setState('draftPack', next);
    bumpDraftRevision();
    syncDirty(next);
  },
  markSaved(): void {
    setState('savedSnapshot', JSON.stringify(state.draftPack));
    setState('dirty', false);
  },
  setScope(scope: ThemeApplyScope): void {
    setState('scope', scope);
  },
  setPreviewMode(mode: 'full' | 'component'): void {
    setState('previewMode', mode);
  },
  setSelectedComponent(id: ThemeComponentId): void {
    setState('selectedComponentId', id);
    setState('previewMode', 'component');
  },
  setColorMode(mode: 'light' | 'dark'): void {
    setState('colorMode', mode);
  },
  setViewport(viewport: ThemePreviewViewport): void {
    setState('viewport', viewport);
  },
  resetDraft(): void {
    const pack = JSON.parse(state.savedSnapshot) as ReaderThemePackV1;
    setState('draftPack', pack);
    bumpDraftRevision();
    setState('dirty', false);
  },
};

export type ThemeStudioStore = typeof themeStudioStore;
