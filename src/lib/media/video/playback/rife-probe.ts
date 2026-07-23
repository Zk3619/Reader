/**
 * RIFE 运行时探测（桌面）
 */

import { invoke } from '@tauri-apps/api/core';
import type { RifeProbeStatus } from '@/lib/media/video/playback/frame-interp';

export async function probeRifeStatus(): Promise<RifeProbeStatus> {
  try {
    const raw = await invoke<{
      available?: boolean;
      backend?: 'trt' | 'dml' | 'ncnn' | null;
      detail?: string;
      scriptPath?: string;
      models?: string[];
      hasTrt?: boolean;
      hasDml?: boolean;
      hasNcnn?: boolean;
    }>('video_rife_status');
    return {
      available: !!raw.available,
      backend: raw.backend ?? null,
      detail: raw.detail || '',
      scriptPath: raw.scriptPath || '',
      models: Array.isArray(raw.models) ? raw.models : [],
      hasTrt: !!raw.hasTrt,
      hasDml: !!raw.hasDml,
      hasNcnn: !!raw.hasNcnn,
    };
  } catch (e) {
    return {
      available: false,
      backend: null,
      detail: e instanceof Error ? e.message : String(e),
      scriptPath: '',
      models: [],
      hasTrt: false,
      hasDml: false,
      hasNcnn: false,
    };
  }
}
