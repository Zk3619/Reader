/**
 * RIFE Web：闸门 + ORT 实推理入口
 * @see rife-session.ts · docs/VIDEO_WEB_ENHANCE.md
 */

import { PipelineEpoch } from '@/lib/media/video/enhance/media-clock';

export type RifeCascadeGateInput = {
  codedHeight: number;
  maxInputHeight: number;
  sourceFps: number;
  maxInputFps: number;
  displayRefreshHz: number;
  frameInterpEnabled: boolean;
  watchdogAllowsRife: boolean;
  /** 最终呈现高度（CSS contain × dpr）；用于抬高推理分辨率，减少放大发糊 */
  displayTargetHeight?: number;
};

export type RifeCascadeDecision =
  | { runRife: true; downsampleMax: number }
  | { runRife: false; reason: string };

export function decideRifeCascade(input: RifeCascadeGateInput): RifeCascadeDecision {
  if (!input.frameInterpEnabled) return { runRife: false, reason: 'disabled' };
  if (!input.watchdogAllowsRife) return { runRife: false, reason: 'watchdog' };
  if (input.codedHeight > input.maxInputHeight) {
    return { runRife: false, reason: 'maxInputHeight' };
  }
  if (input.sourceFps >= input.maxInputFps) {
    return { runRife: false, reason: 'maxInputFps' };
  }
  if (input.sourceFps >= input.displayRefreshHz - 0.5) {
    return { runRife: false, reason: 'sourceFps >= refresh' };
  }
  // 推理高度：固定 ≤720（计划级联），清晰度交给后级 Anime4K 拉回显示
  const processH = Math.min(720, input.codedHeight, input.maxInputHeight);
  return { runRife: true, downsampleMax: Math.max(240, processH) };
}

let ortProbeCache: boolean | null = null;

export async function probeOrtWebgpuRealtime(): Promise<boolean> {
  if (ortProbeCache != null) return ortProbeCache;
  try {
    if (!('gpu' in navigator)) {
      ortProbeCache = false;
      return false;
    }
    const { ensureRifeSession, getRifeSessionInfo } = await import(
      '@/lib/media/video/enhance/rife-session'
    );
    const info = await ensureRifeSession();
    ortProbeCache = !!info || !!getRifeSessionInfo();
    // 无模型时仍探测 ORT EP 是否可加载
    if (!ortProbeCache) {
      const ort = await import('onnxruntime-web/webgpu').catch(() => null);
      ortProbeCache = !!ort;
    }
    return ortProbeCache;
  } catch {
    ortProbeCache = false;
    return false;
  }
}

export function clearOrtProbeCache(): void {
  ortProbeCache = null;
}

export function guardRifeEpoch(
  epoch: PipelineEpoch,
  submittedEpoch: number,
  dispose?: () => void,
): boolean {
  if (epoch.isCurrent(submittedEpoch)) return true;
  dispose?.();
  return false;
}

export {
  ensureRifeSession,
  getRifeSessionInfo,
  isRifeSessionInitFailed,
  packRifeInput,
  releaseRifeSession,
  resolveRifeOnnxPath,
  runRifeInterpolate,
  captureImageData,
} from '@/lib/media/video/enhance/rife-session';
