/**
 * 主题特效宿主 — 预览沙盒用容器级引擎；全局应用时可启用 mouse-animations
 */

import { createEffect, onCleanup } from 'solid-js';
import type { ThemeEffectConfig, ThemeScopeId } from '@/lib/theme/schema/theme-pack-v1';
import {
  destroyThemeEffects,
  startThemeEffects,
  type EffectEngineHandle,
} from '@/lib/theme/effects/theme-effects-engine';
import { settingsStore } from '@/stores/settings';

export interface ThemeEffectsHostProps {
  effects?: ThemeEffectConfig[];
  scope: ThemeScopeId;
  containerRef?: HTMLElement | undefined;
  class?: string;
  /** true = 全页 mouse-animations；false = 仅容器内自研引擎（预览沙盒） */
  globalMode?: boolean;
  resolveAssetUrl?: (assetId: string) => string | undefined;
}

function respectsReducedMotion(): boolean {
  if (settingsStore.state.app.reduceMotion) return true;
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ThemeEffectsHost(props: ThemeEffectsHostProps) {
  let rootEl: HTMLDivElement | undefined;
  let handles: EffectEngineHandle[] = [];
  let starting = false;

  async function restart(): Promise<void> {
    if (starting) return;
    starting = true;
    destroyThemeEffects(handles);
    handles = [];

    const container = props.containerRef ?? rootEl;
    if (!container || respectsReducedMotion()) {
      starting = false;
      return;
    }

    const list = props.effects ?? [];
    if (list.length === 0) {
      starting = false;
      return;
    }

    handles = await startThemeEffects({
      container,
      effects: list,
      scope: props.scope,
      resolveAssetUrl: props.resolveAssetUrl,
      preferLibrary: props.globalMode ?? false,
    });

    starting = false;
  }

  createEffect(() => {
    props.effects;
    props.scope;
    props.containerRef;
    props.globalMode;
    props.resolveAssetUrl;
    void restart();
  });

  onCleanup(() => destroyThemeEffects(handles));

  return (
    <div
      ref={rootEl}
      class={props.class ?? 'pointer-events-none absolute inset-0 z-2'}
      data-theme-effects-host={props.scope}
      aria-hidden="true"
    />
  );
}
