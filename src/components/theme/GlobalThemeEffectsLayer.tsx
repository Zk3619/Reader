/**
 * 全局主题特效层 — app / viewer 域独立挂载
 */

import { createEffect, createMemo, onCleanup, Show } from 'solid-js';
import {
  destroyThemeEffects,
  startThemeEffects,
  type EffectEngineHandle,
} from '@/lib/theme/effects/theme-effects-engine';
import { TsParticlesLayerHost } from '@/lib/theme/effects/TsParticlesLayerHost';
import type { ReaderThemePackV1, ThemeScopeId, ThreeJsEffectConfig } from '@/lib/theme/schema/theme-pack-v1';
import { resolveThemeAssetUrl } from '@/lib/theme/theme-asset-storage';
import { useThemePackRuntime } from '@/components/theme/ThemePackRuntimeProvider';
import { settingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';

export type ThemeEffectsDomain = 'app' | 'viewer';

const VIEWER_SCOPES = new Set<ThemeScopeId>([
  'viewer',
  'readerContent',
  'readerChrome',
  'readerBackground',
]);

function effectMatchesDomain(scope: ThemeScopeId, domain: ThemeEffectsDomain): boolean {
  if (domain === 'app') return scope === 'app';
  return VIEWER_SCOPES.has(scope);
}

function threeJsMatchesDomain(config: ThreeJsEffectConfig | undefined, domain: ThemeEffectsDomain): boolean {
  if (!config?.enabled) return false;
  const scope = config.scope ?? (domain === 'viewer' ? 'readerBackground' : 'appShell');
  if (domain === 'app') return scope === 'app' || scope === 'appShell';
  return VIEWER_SCOPES.has(scope);
}

export interface GlobalThemeEffectsLayerProps {
  pack?: ReaderThemePackV1 | null;
  domain?: ThemeEffectsDomain;
  class?: string;
  /** 嵌入预览容器内时使用 absolute，避免 fixed 脱离预览区域 */
  embedded?: boolean;
}

export function GlobalThemeEffectsLayer(props: GlobalThemeEffectsLayerProps) {
  const runtime = useThemePackRuntime();
  const domain = () => props.domain ?? 'app';
  const pack = createMemo(() => {
    if (props.pack !== undefined) return props.pack;
    return domain() === 'viewer' ? runtime.viewerPack() : runtime.appPack();
  });

  let layerRef: HTMLDivElement | undefined;
  let handles: EffectEngineHandle[] = [];

  const domainEffects = createMemo(() =>
    (pack()?.advanced?.effects ?? []).filter((e) => effectMatchesDomain(e.scope, domain())),
  );

  const particlesConfig = createMemo(() => {
    const cfg = pack()?.advanced?.threeJs;
    return threeJsMatchesDomain(cfg, domain()) ? cfg : undefined;
  });

  createEffect(() => {
    const currentPack = pack();
    destroyThemeEffects(handles);
    handles = [];

    if (!currentPack || !layerRef) return;
    if (settingsStore.state.app.reduceMotion) return;

    const effects = domainEffects();
    const particles = particlesConfig();
    if (effects.length === 0 && !particles?.enabled) return;

    void (async () => {
      const urlMap: Record<string, string> = {};
      for (const id of Object.keys(currentPack.assets ?? {})) {
        const url = await resolveThemeAssetUrl(currentPack.id, id, currentPack.assets);
        if (url) urlMap[id] = url;
      }

      if (!layerRef) return;

      const scopes = [...new Set(effects.map((e) => e.scope))];
      for (const scope of scopes) {
        const scoped = effects.filter((e) => e.scope === scope);
        if (scoped.length === 0) continue;
        const batch = await startThemeEffects({
          container: layerRef,
          effects: scoped,
          scope,
          preferLibrary: true,
          resolveAssetUrl: (assetId) => urlMap[assetId],
        });
        handles.push(...batch);
      }
    })();
  });

  onCleanup(() => destroyThemeEffects(handles));

  return (
    <Show when={particlesConfig()?.enabled || domainEffects().length > 0}>
      <div
        ref={layerRef}
        class={cn(
          'pointer-events-none absolute inset-0 z-40',
          domain() === 'app' && !props.embedded && 'fixed',
          props.class,
        )}
        data-theme-global-effects={domain()}
        aria-hidden="true"
      >
        <TsParticlesLayerHost config={particlesConfig()} />
      </div>
    </Show>
  );
}

export function ViewerGlobalThemeEffectsLayer(props: { class?: string }) {
  return <GlobalThemeEffectsLayer domain="viewer" class={props.class} />;
}
