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
  getThemeTargetChain,
  normalizeActiveThemePresetByTarget,
  THEME_TARGET_IDS,
  type ActiveThemePresetByTarget,
  type ThemeTargetId,
} from '@/lib/theme/theme-targets';
import {
  getActiveThemePackSnapshot,
  getActiveThemeTargetPackSnapshot,
  getActiveViewerThemePackSnapshot,
  useActiveThemePackRevision,
  useActiveThemeTargetRevision,
  useActiveViewerThemePackRevision,
} from '@/stores/theme-active-pack';

export interface ThemePackRuntimeContextValue {
  appPack: () => ReaderThemePackV1 | null;
  viewerPack: () => ReaderThemePackV1 | null;
  targetPack: (target: ThemeTargetId) => ReaderThemePackV1 | null;
  resolveAssetUrl: (assetId: string) => string | undefined;
}

const ThemePackRuntimeContext = createContext<ThemePackRuntimeContextValue>();

export function useThemePackRuntime(): ThemePackRuntimeContextValue {
  const ctx = useContext(ThemePackRuntimeContext);
  if (!ctx) {
    return {
      appPack: () => null,
      viewerPack: () => null,
      targetPack: () => null,
      resolveAssetUrl: () => undefined,
    };
  }
  return ctx;
}

export interface ThemePackRuntimeProviderProps {
  children: JSX.Element;
}

export function ThemePackRuntimeProvider(props: ThemePackRuntimeProviderProps) {
  const [activeByTarget, setActiveByTarget] = createSignal<ActiveThemePresetByTarget>({});
  const [packsByPresetId, setPacksByPresetId] = createSignal<Record<string, ReaderThemePackV1>>({});
  const [assetUrlMap, setAssetUrlMap] = createSignal<Record<string, string>>({});

  createEffect(() => {
    useActiveThemePackRevision();
    useActiveViewerThemePackRevision();
    useActiveThemeTargetRevision();
    const stored = settingsStore.state.app.activeThemePresetByTarget;
    // 逐键读取，确保 Solid store 对任一目标变更都能触发刷新。
    const reactiveValue = Object.fromEntries(
      THEME_TARGET_IDS.map((target) => [target, stored?.[target]]),
    );
    const active = normalizeActiveThemePresetByTarget(reactiveValue, settingsStore.state.app);
    setActiveByTarget(active);

    const ids = [...new Set(Object.values(active).filter(Boolean))] as string[];
    const appSnapshot = getActiveThemePackSnapshot();
    const viewerSnapshot = getActiveViewerThemePackSnapshot();
    let cancelled = false;
    void Promise.all(
      ids.map(async (id) => {
        if (appSnapshot?.id === id) return appSnapshot;
        if (viewerSnapshot?.id === id) return viewerSnapshot;
        for (const target of THEME_TARGET_IDS) {
          const snapshot = getActiveThemeTargetPackSnapshot(target);
          if (active[target] === id && snapshot?.id === id) return snapshot;
        }
        return (await getThemePreset(id))?.manifest ?? null;
      }),
    ).then((packs) => {
      if (cancelled) return;
      const next: Record<string, ReaderThemePackV1> = {};
      packs.forEach((pack) => {
        if (pack) next[pack.id] = pack;
      });
      setPacksByPresetId(next);
    });
    onCleanup(() => {
      cancelled = true;
    });
  });

  const targetPack = (target: ThemeTargetId): ReaderThemePackV1 | null => {
    const active = activeByTarget();
    const packs = packsByPresetId();
    for (const candidate of getThemeTargetChain(target)) {
      const presetId = active[candidate];
      if (presetId && packs[presetId]) return packs[presetId]!;
    }
    return null;
  };
  const appPack = () => targetPack('app');
  const viewerPack = () => targetPack('module.reading');

  createEffect(() => {
    const packs = Object.values(packsByPresetId());
    const manifest = mergeThemeAssetManifests(...packs.map((pack) => pack.assets));
    const presetIds = packs.map((pack) => pack.id);
    const assetOwnerById: Record<string, string> = {};
    for (const pack of packs) {
      for (const assetId of Object.keys(pack.assets ?? {})) {
        assetOwnerById[assetId] = pack.id;
      }
    }
    let cancelled = false;

    void (async () => {
      const map: Record<string, string> = {};
      for (const assetId of Object.keys(manifest)) {
        const ownerId = assetOwnerById[assetId];
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
    targetPack,
    resolveAssetUrl: (assetId: string) => assetUrlMap()[assetId],
  };

  return (
    <ThemePackRuntimeContext.Provider value={value}>
      {props.children}
    </ThemePackRuntimeContext.Provider>
  );
}
