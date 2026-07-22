/**
 * MusicFree 主题动效层（多槽位 iframe：app / header / body / music-bar 等）
 */

import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type Component,
} from 'solid-js';
import {
  getActiveMfThemeEffect,
  getActiveMfThemeIframes,
  shouldUseMfThemeIframeEffect,
  shouldUseSakuraCanvasFallback,
  subscribeMfThemePack,
} from '@/lib/media/audio/online/mf-plugin/theme-pack';
import { mountSakuraPetalsLayer } from '@/lib/media/audio/online/mf-plugin/mf-theme-presets/sakura-canvas';
import { MfThemeIframeSlot } from '@/lib/media/audio/online/mf-plugin/MfThemeIframeSlot';
import type { MfThemeIframeSlot as MfSlotName } from '@/lib/media/audio/online/mf-plugin/mf-theme-presets/types';

const SLOT_CONTAINER_CLASS: Record<string, string> = {
  app: 'absolute inset-0 z-0 h-full w-full',
  header: 'absolute inset-0 z-0 h-full w-full',
  body: 'absolute inset-0 z-0 h-full w-full',
  'music-bar': 'absolute inset-0 z-0 h-full w-full',
  'side-bar': 'absolute inset-0 z-0 h-full w-full',
  page: 'absolute inset-0 z-0 h-full w-full',
};

export const MusicHubMfThemeLayer: Component = () => {
  const [rev, setRev] = createSignal(0);
  const effect = () => {
    rev();
    return getActiveMfThemeEffect();
  };
  const iframes = () => {
    rev();
    return getActiveMfThemeIframes();
  };

  onMount(() => {
    const unsub = subscribeMfThemePack(() => setRev((v) => v + 1));
    let canvasCleanup: (() => void) | undefined;
    createEffect(() => {
      rev();
      canvasCleanup?.();
      canvasCleanup = undefined;
      if (shouldUseSakuraCanvasFallback(effect())) {
        const hub = document.querySelector<HTMLElement>('[data-music-hub="true"]');
        if (hub) canvasCleanup = mountSakuraPetalsLayer(hub);
      }
    });
    onCleanup(() => {
      unsub();
      canvasCleanup?.();
    });
  });

  const appUrl = () => iframes().app;

  return (
    <Show when={shouldUseMfThemeIframeEffect(effect()) && appUrl()}>
      <MfThemeIframeSlot
        slot="app"
        src={appUrl()}
        class={SLOT_CONTAINER_CLASS.app}
        title="MusicFree 主题背景"
      />
    </Show>
  );
};

/** 挂载在 Hub 各容器内的槽位 iframe */
export const MusicHubMfThemeSlotLayer: Component<{ slot: MfSlotName }> = (
  props,
) => {
  const [rev, setRev] = createSignal(0);
  const src = () => {
    rev();
    const map = getActiveMfThemeIframes();
    return map[props.slot] ?? null;
  };
  const showSlot = () => {
    rev();
    if (props.slot === 'app') return false;
    if (!shouldUseMfThemeIframeEffect(getActiveMfThemeEffect())) return false;
    return !!src();
  };

  onMount(() => {
    const unsub = subscribeMfThemePack(() => setRev((v) => v + 1));
    onCleanup(unsub);
  });

  return (
    <Show when={showSlot()}>
      <MfThemeIframeSlot
        slot={props.slot}
        src={src()}
        class={SLOT_CONTAINER_CLASS[props.slot] ?? 'absolute inset-0 z-0'}
      />
    </Show>
  );
};

/** 批量渲染非 app 槽位（用于调试或全屏覆盖） */
export const MusicHubMfThemeExtraSlots: Component = () => {
  const [rev, setRev] = createSignal(0);
  const slots = () => {
    rev();
    const map = getActiveMfThemeIframes();
    return (Object.keys(map) as MfSlotName[]).filter((s) => s !== 'app' && map[s]);
  };

  onMount(() => {
    const unsub = subscribeMfThemePack(() => setRev((v) => v + 1));
    onCleanup(unsub);
  });

  return (
    <For each={slots()}>
      {(slot) => <MusicHubMfThemeSlotLayer slot={slot} />}
    </For>
  );
};
