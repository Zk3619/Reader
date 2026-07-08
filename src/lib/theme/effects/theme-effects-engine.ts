/**
 * 统一主题特效引擎 — mouse-animations + 自研回退
 */

import type { ThemeEffectConfig, ThemeScopeId } from '@/lib/theme/schema/theme-pack-v1';
import type { ReaderThemePackV1 } from '@/lib/theme/schema/theme-pack-v1';
import { BackgroundParallaxEffectEngine } from '@/lib/theme/effects/background-parallax';
import { MouseGlowEffectEngine } from '@/lib/theme/effects/mouse-glow';
import { MouseTrailEffectEngine } from '@/lib/theme/effects/mouse-trail';

export type EffectEngineHandle = { destroy: () => void };

type MouseAnimModule = typeof import('mouse-animations');

let mouseAnimModule: MouseAnimModule | null = null;

async function loadMouseAnimations(): Promise<MouseAnimModule> {
  if (!mouseAnimModule) {
    mouseAnimModule = await import('mouse-animations');
  }
  return mouseAnimModule;
}

export interface StartThemeEffectsOptions {
  container: HTMLElement;
  effects: ThemeEffectConfig[];
  scope: ThemeScopeId;
  pack?: ReaderThemePackV1;
  resolveAssetUrl?: (assetId: string) => string | undefined;
  /** 全局模式启用 mouse-animations（点击粒子/涟漪/自定义指针） */
  preferLibrary?: boolean;
}

export async function startThemeEffects(
  options: StartThemeEffectsOptions,
): Promise<EffectEngineHandle[]> {
  const { container, effects, scope, resolveAssetUrl, preferLibrary = false } = options;
  const handles: EffectEngineHandle[] = [];
  const scoped = effects.filter((e) => e.enabled !== false && e.scope === scope);

  let ma: MouseAnimModule | null = null;

  for (const effect of scoped) {
    if (effect.type === 'mouseTrail') {
      const fallback = new MouseTrailEffectEngine(container, {
        color: effect.color,
        length: effect.length,
        size: effect.size,
        fadeMs: effect.fadeMs,
      });
      fallback.start();
      handles.push({ destroy: () => fallback.stop() });
      continue;
    }

    if (effect.type === 'mouseGlow') {
      const glow = new MouseGlowEffectEngine(container, {
        radius: effect.radius,
        color: effect.color,
        intensity: effect.intensity,
      });
      glow.start();
      handles.push({ destroy: () => glow.stop() });
      continue;
    }

    if (effect.type === 'backgroundParallax') {
      const parallax = new BackgroundParallaxEffectEngine(container, {
        maxShiftPx: effect.maxShiftPx,
      });
      parallax.start();
      handles.push({ destroy: () => parallax.stop() });
      continue;
    }

    if (effect.type === 'clickRipple' || effect.type === 'backgroundRipple') {
      if (preferLibrary) {
        ma ??= await loadMouseAnimations();
        const ripple = new ma.Ripple({
          color: effect.color,
          duration: effect.durationMs ?? 600,
          maxSize: effect.type === 'clickRipple' ? (effect.maxSize ?? 100) : 100,
        });
        handles.push({ destroy: () => ripple.destroy() });
      }
      continue;
    }

    if (effect.type === 'clickParticles') {
      if (preferLibrary) {
        ma ??= await loadMouseAnimations();
        const particles = new ma.Particles({
          count: effect.count ?? 20,
          colors: effect.colors ?? ['#0891b2', '#22d3ee', '#059669'],
          size: effect.size ?? 6,
          spread: effect.spread ?? 8,
        });
        handles.push({ destroy: () => particles.destroy() });
      }
      continue;
    }

    if (effect.type === 'customCursor') {
      if (!preferLibrary) continue;
      ma ??= await loadMouseAnimations();
      const src =
        (effect.assetId && resolveAssetUrl?.(effect.assetId)) ||
        effect.src ||
        undefined;
      const hoverSrc =
        (effect.hoverAssetId && resolveAssetUrl?.(effect.hoverAssetId)) || undefined;
      const activeSrc =
        (effect.activeAssetId && resolveAssetUrl?.(effect.activeAssetId)) || undefined;

      if (effect.mode === 'ring' || !src) {
        const cursor = new ma.CustomCursor({
          innerSize: effect.innerSize ?? 8,
          outerSize: effect.outerSize ?? 36,
          innerColor: effect.innerColor ?? '#0891b2',
          outerColor: effect.outerColor ?? 'rgba(8, 145, 178, 0.45)',
          smoothness: effect.smoothness ?? 0.15,
          hideDefault: effect.hideDefault !== false,
        });
        handles.push({ destroy: () => cursor.destroy() });
      } else {
        const states: Record<string, string> = {};
        if (hoverSrc) states.hover = hoverSrc;
        if (activeSrc) states.active = activeSrc;
        const image = new ma.Image({
          src,
          width: effect.width ?? 32,
          height: effect.height ?? 32,
          offsetX: effect.offsetX ?? 0,
          offsetY: effect.offsetY ?? 0,
          smoothness: effect.smoothness ?? 1,
          hideDefault: effect.hideDefault !== false,
          overrideAll: true,
          states: Object.keys(states).length > 0 ? states : undefined,
        });
        handles.push({ destroy: () => image.destroy() });
      }
    }
  }

  return handles;
}

export function destroyThemeEffects(handles: EffectEngineHandle[]): void {
  while (handles.length > 0) {
    handles.pop()?.destroy();
  }
}
