/**
 * Theme Draft 运行时 — 将 draft pack 注入 ThemedComponentBackground
 */

import { createContext, createEffect, createMemo, createSignal, onCleanup, useContext, type Accessor } from 'solid-js';
import type { JSX } from 'solid-js';
import type { ReaderThemePackV1, ThemeApplyScope } from '@/lib/theme/schema/theme-pack-v1';
import { mergeThemeAssetManifests } from '@/lib/theme/component-background';
import { resolveThemeAssetUrl, revokeThemeAssetUrls } from '@/lib/theme/theme-asset-storage';
import type { ThemePackRuntimeContextValue } from '@/components/theme/ThemePackRuntimeProvider';

const ThemeDraftRuntimeContext = createContext<ThemePackRuntimeContextValue>();

export function useThemeDraftRuntime(): ThemePackRuntimeContextValue | undefined {
  return useContext(ThemeDraftRuntimeContext);
}

export interface ThemeDraftRuntimeProviderProps {
  pack: ReaderThemePackV1 | Accessor<ReaderThemePackV1>;
  scope: ThemeApplyScope;
  /** 与 themeStudioStore.draftRevision 同步，确保预览订阅深层变更 */
  revision?: number | Accessor<number>;
  children: JSX.Element;
}

function readAccessor<T>(value: T | Accessor<T>): T {
  return typeof value === 'function' ? (value as Accessor<T>)() : value;
}

function trackPackSections(pack: ReaderThemePackV1): void {
  void pack.app?.tokens;
  void pack.app?.components;
  void pack.app?.typography;
  void pack.app?.motion;
  void pack.viewer?.shared;
  void pack.viewer?.text;
  void pack.viewer?.components;
  void pack.assets;
  void pack.advanced;
}

export function ThemeDraftRuntimeProvider(props: ThemeDraftRuntimeProviderProps) {
  const [assetUrlMap, setAssetUrlMap] = createSignal<Record<string, string>>({});

  const appPack = createMemo(() => {
    void readAccessor(props.revision ?? 0);
    if (props.scope === 'viewer') return null;
    const pack = readAccessor(props.pack);
    if (pack.scopes?.app === false) return null;
    if (!pack.app) return null;
    trackPackSections(pack);
    return pack;
  });

  const viewerPack = createMemo(() => {
    void readAccessor(props.revision ?? 0);
    if (props.scope === 'app') return null;
    const pack = readAccessor(props.pack);
    if (pack.scopes?.viewer === false) return null;
    if (!pack.viewer) return null;
    trackPackSections(pack);
    return pack;
  });

  createEffect(() => {
    void readAccessor(props.revision ?? 0);
    const pack = readAccessor(props.pack);
    trackPackSections(pack);
    const manifest = mergeThemeAssetManifests(pack.assets, pack.assets);
    let cancelled = false;

    void (async () => {
      const map: Record<string, string> = {};
      for (const assetId of Object.keys(manifest)) {
        const url = await resolveThemeAssetUrl(pack.id, assetId, manifest);
        if (url) map[assetId] = url;
      }
      if (!cancelled) setAssetUrlMap(map);
    })();

    onCleanup(() => {
      cancelled = true;
      revokeThemeAssetUrls(pack.id);
    });
  });

  const value: ThemePackRuntimeContextValue = {
    appPack,
    viewerPack,
    resolveAssetUrl: (assetId: string) => assetUrlMap()[assetId],
  };

  return (
    <ThemeDraftRuntimeContext.Provider value={value}>
      {props.children}
    </ThemeDraftRuntimeContext.Provider>
  );
}
