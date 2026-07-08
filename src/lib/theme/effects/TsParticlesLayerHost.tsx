/**
 * tsParticles 背景粒子层（Schema advanced.threeJs）
 */

import { createEffect, onCleanup, onMount } from 'solid-js';
import type { ThreeJsEffectConfig, ThemeScopeId } from '@/lib/theme/schema/theme-pack-v1';

export interface TsParticlesLayerHostProps {
  config?: ThreeJsEffectConfig;
  scope?: ThemeScopeId;
  class?: string;
}

const PRESET_OPTIONS: Record<
  NonNullable<ThreeJsEffectConfig['preset']>,
  () => Record<string, unknown>
> = {
  particles: () => ({
    background: { color: { value: 'transparent' } },
    fpsLimit: 60,
    particles: {
      number: { value: 60, density: { enable: true } },
      color: { value: '#0891b2' },
      opacity: { value: 0.45 },
      size: { value: { min: 1, max: 3 } },
      move: { enable: true, speed: 1.2 },
      links: { enable: false },
    },
  }),
  stars: () => ({
    background: { color: { value: 'transparent' } },
    particles: {
      number: { value: 120 },
      color: { value: '#ffffff' },
      opacity: { value: 0.6 },
      size: { value: 1.5 },
      move: { enable: false },
    },
  }),
  snow: () => ({
    background: { color: { value: 'transparent' } },
    particles: {
      number: { value: 80 },
      color: { value: '#ffffff' },
      opacity: { value: 0.8 },
      size: { value: { min: 1, max: 4 } },
      move: { enable: true, speed: 1.5, direction: 'bottom' as const },
    },
  }),
  firefly: () => ({
    background: { color: { value: 'transparent' } },
    particles: {
      number: { value: 40 },
      color: { value: '#fbbf24' },
      opacity: { value: { min: 0.1, max: 0.6 } },
      size: { value: { min: 1, max: 3 } },
      move: { enable: true, speed: 0.6, random: true },
    },
  }),
  links: () => ({
    background: { color: { value: 'transparent' } },
    particles: {
      number: { value: 50 },
      color: { value: '#0891b2' },
      links: { enable: true, distance: 120, opacity: 0.35, width: 1 },
      move: { enable: true, speed: 0.8 },
      opacity: { value: 0.5 },
      size: { value: 2 },
    },
  }),
  bubbles: () => ({
    background: { color: { value: 'transparent' } },
    particles: {
      number: { value: 30 },
      color: { value: '#22d3ee' },
      opacity: { value: 0.35 },
      size: { value: { min: 8, max: 24 } },
      move: { enable: true, speed: 1, direction: 'top' as const },
    },
  }),
  aurora: () => ({
    background: { color: { value: 'transparent' } },
    particles: {
      number: { value: 35 },
      color: { value: ['#0891b2', '#059669', '#6366f1'] },
      opacity: { value: 0.25 },
      size: { value: { min: 40, max: 120 } },
      move: { enable: true, speed: 0.4, random: true },
      shape: { type: 'circle' },
    },
  }),
};

let engineLoaded = false;

export function TsParticlesLayerHost(props: TsParticlesLayerHostProps) {
  let hostEl: HTMLDivElement | undefined;
  const containerId = `tsp-${Math.random().toString(36).slice(2, 9)}`;

  async function mountParticles(): Promise<(() => void) | undefined> {
    const cfg = props.config;
    if (!cfg?.enabled || !hostEl) return undefined;

    const { tsParticles } = await import('@tsparticles/engine');
    if (!engineLoaded) {
      const { loadSlim } = await import('@tsparticles/slim');
      await loadSlim(tsParticles);
      engineLoaded = true;
    }

    hostEl.id = containerId;

    let options: Record<string, unknown> = PRESET_OPTIONS[cfg.preset]?.() ?? PRESET_OPTIONS.particles();
    if (cfg.optionsJson) {
      try {
        options = { ...options, ...JSON.parse(cfg.optionsJson) };
      } catch {
        /* keep preset */
      }
    }

    const container = await tsParticles.load({ id: containerId, element: hostEl, options });

    return () => {
      void container?.destroy();
    };
  }

  let cleanup: (() => void) | undefined;

  onMount(() => {
    void mountParticles().then((fn) => {
      cleanup = fn;
    });
  });

  createEffect(() => {
    props.config;
    cleanup?.();
    cleanup = undefined;
    void mountParticles().then((fn) => {
      cleanup = fn;
    });
  });

  onCleanup(() => cleanup?.());

  return (
    <div
      ref={hostEl}
      class={props.class ?? 'pointer-events-none absolute inset-0 z-0'}
      data-theme-particles={props.config?.preset ?? 'none'}
      aria-hidden="true"
    />
  );
}
