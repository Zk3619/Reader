/**
 * 运行时主题包上下文 — 资产 URL 解析 + app/viewer pack
 */

import { createContext, createEffect, createSignal, onCleanup, useContext } from 'solid-js';
import type { JSX } from 'solid-js';
import type { ReaderThemePackV1 } from '@/lib/theme/schema/theme-pack-v1';
import { mergeThemeAssetManifests } from '@/lib/theme/component-background';
import { resolveThemeAssetUrl, revokeThemeAssetUrls } from '@/lib/theme/theme-asset-storage';
import { getThemePreset } from '@/lib/database/theme-presets';
import { settingsStore } from '@/stores/settings';
import {
  getActiveThemePackSnapshot,
  getActiveViewerThemePackSnapshot,
  useActiveThemePackRevision,
  useActiveViewerThemePackRevision,
} from '@/stores/theme-active-pack';

export interface ThemePackRuntimeContextValue {
  appPack: () => ReaderThemePackV1 | null;
  viewerPack: () => ReaderThemePackV1 | null;
  resolveAssetUrl: (assetId: string) => string | undefined;
}

const ThemePackRuntimeContext = createContext<ThemePackRuntimeContextValue>();

export function useThemePackRuntime(): ThemePackRuntimeContextValue {
  const ctx = useContext(ThemePackRuntimeContext);
  if (!ctx) {
    return {
      appPack: () => null,
      viewerPack: () => null,
      resolveAssetUrl: () => undefined,
    };
  }
  return ctx;
}

export interface ThemePackRuntimeProviderProps {
  children: JSX.Element;
}

export function ThemePackRuntimeProvider(props: ThemePackRuntimeProviderProps) {
  const [appPack, setAppPack] = createSignal<ReaderThemePackV1 | null>(null);
  const [viewerPack, setViewerPack] = createSignal<ReaderThemePackV1 | null>(null);
  const [assetUrlMap, setAssetUrlMap] = createSignal<Record<string, string>>({});

  createEffect(() => {
    useActiveThemePackRevision();
    const presetId = settingsStore.state.app.activeThemePresetId;
    if (!presetId) {
      setAppPack(null);
      return;
    }
    const snapshot = getActiveThemePackSnapshot();
    if (snapshot?.id === presetId) {
      setAppPack(snapshot);
      return;
    }
    void getThemePreset(presetId).then((record) => {
      setAppPack(record?.manifest ?? null);
    });
  });

  createEffect(() => {
    useActiveViewerThemePackRevision();
    const presetId = settingsStore.state.app.activeViewerThemePresetId;
    if (!presetId) {
      setViewerPack(null);
      return;
    }
    const snapshot = getActiveViewerThemePackSnapshot();
    if (snapshot?.id === presetId) {
      setViewerPack(snapshot);
      return;
    }
    void getThemePreset(presetId).then((record) => {
      setViewerPack(record?.manifest ?? null);
    });
  });

  createEffect(() => {
    const app = appPack();
    const viewer = viewerPack();
    const manifest = mergeThemeAssetManifests(app?.assets, viewer?.assets);
    const presetIds = [...new Set([app?.id, viewer?.id].filter(Boolean))] as string[];
    let cancelled = false;

    void (async () => {
      const map: Record<string, string> = {};
      for (const assetId of Object.keys(manifest)) {
        const ownerId =
          (app?.assets?.[assetId] ? app.id : undefined) ??
          (viewer?.assets?.[assetId] ? viewer.id : undefined) ??
          app?.id ??
          viewer?.id;
        if (!ownerId) continue;
        const url = await resolveThemeAssetUrl(ownerId, assetId, manifest);
        if (url) map[assetId] = url;
      }
      if (!cancelled) setAssetUrlMap(map);
    })();

    onCleanup(() => {
      cancelled = true;
      for (const id of presetIds) revokeThemeAssetUrls(id);
    });
  });

  const value: ThemePackRuntimeContextValue = {
    appPack,
    viewerPack,
    resolveAssetUrl: (assetId: string) => assetUrlMap()[assetId],
  };

  return (
    <ThemePackRuntimeContext.Provider value={value}>
      {props.children}
    </ThemePackRuntimeContext.Provider>
  );
}
