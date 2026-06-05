/**
 * Legado java.ajax 的缓存、挂起索引与耗时（Web 端模拟同步阻塞）
 */

import { installScriptDateShim } from '@/lib/js-engine/legado/script-date-shim';
import { SuspendScript } from '@/lib/js-engine/legado/suspend-script';

export type AjaxCoordinatorMode = 'suspend' | 'two-pass';

/** 失败/空响应不写入缓存，避免 two-pass 后续轮次永远命中空串 */
export function shouldCacheLegadoAjaxBody(body: string): boolean {
  return body !== '';
}

export function readLegadoAjaxCache(
  cache: Map<string, string>,
  resolvedUrl: string,
): string | undefined {
  if (!cache.has(resolvedUrl)) return undefined;
  const body = cache.get(resolvedUrl)!;
  if (!shouldCacheLegadoAjaxBody(body)) {
    cache.delete(resolvedUrl);
    return undefined;
  }
  return body;
}

export function writeLegadoAjaxCache(
  cache: Map<string, string>,
  resolvedUrl: string,
  body: string,
): void {
  if (!shouldCacheLegadoAjaxBody(body)) return;
  cache.set(resolvedUrl, body);
}

export class AjaxCoordinator {
  readonly cache = new Map<string, string>();
  readonly durationCache = new Map<string, number>();
  readonly results: string[] = [];
  readIndex = 0;
  writeIndex = 0;
  lastAjaxDurationMs: number | undefined;
  pendingSuspend: SuspendScript | null = null;

  private readonly dateShim = installScriptDateShim();

  constructor(
    readonly mode: AjaxCoordinatorMode,
    /** QuickJS 路径在 VM 内注入 Date 修正，不用宿主 PatchedDate */
    private readonly useHostDateShim = true
  ) {}

  get PatchedDate(): DateConstructor {
    return this.dateShim.PatchedDate;
  }

  recordDuration(resolvedUrl: string, durationMs: number, apply?: (ms: number) => void): void {
    if (durationMs < 0) return;
    this.durationCache.set(resolvedUrl, durationMs);
    this.lastAjaxDurationMs = durationMs;
    if (apply) apply(durationMs);
    else if (this.useHostDateShim) this.dateShim.applyAjaxDuration(durationMs);
  }

  restoreDuration(resolvedUrl: string, apply?: (ms: number) => void): void {
    const d = this.durationCache.get(resolvedUrl);
    if (d != null && d >= 0) {
      this.lastAjaxDurationMs = d;
      if (apply) apply(d);
      else if (this.useHostDateShim) this.dateShim.applyAjaxDuration(d);
    }
  }

  /** suspend 模式：仅按 results[readIndex] 顺序 replay（禁止 URL cache，避免同 URL 多次 ajax 串响应） */
  getCachedResponse(resolvedUrl: string, apply?: (ms: number) => void): string | undefined {
    if (this.mode === 'suspend') {
      const out = this.results[this.readIndex];
      if (out !== undefined) {
        this.readIndex += 1;
        this.restoreDuration(resolvedUrl, apply);
        return out;
      }
      return undefined;
    }
    const cached = readLegadoAjaxCache(this.cache, resolvedUrl);
    if (cached !== undefined) {
      this.restoreDuration(resolvedUrl, apply);
      return cached;
    }
    return undefined;
  }

  resetReplayIndices(): void {
    this.results.length = 0;
    this.readIndex = 0;
    this.writeIndex = 0;
  }

  storeResult(
    writeIndex: number,
    resolvedUrl: string,
    body: string,
    requestStart: number
  ): void {
    const durationMs = Date.now() - requestStart;
    // 仅缓存耗时；Date boost 在 getCachedResponse 回放时注入，避免挂起重跑时 date1 误消费 boost
    this.recordDuration(resolvedUrl, durationMs);
    this.results[writeIndex] = body;
    if (this.mode === 'two-pass') {
      writeLegadoAjaxCache(this.cache, resolvedUrl, body);
    }
  }
}
