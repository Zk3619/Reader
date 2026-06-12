/**
 * 书源图片验证码 / 输入框（对齐 Legado SourceVerificationHelp + VerificationCodeDialog）
 */

import { getLegadoSourceKey } from '@/lib/js-engine/legado/source-script-shared';

export class SourceVerificationCancelledError extends Error {
  constructor() {
    super('用户取消了验证输入');
    this.name = 'SourceVerificationCancelledError';
  }
}

export function isSourceVerificationCancelledError(error: unknown): boolean {
  return error instanceof SourceVerificationCancelledError;
}

export type SourceVerificationRequest = {
  imageUrl: string;
  sourceKey: string;
  sourceName: string;
};

type SourceVerificationHandler = (request: SourceVerificationRequest) => Promise<string>;

let handler: SourceVerificationHandler | null = null;

const inflight = new Map<string, Promise<string>>();
/** 同一次刷新内重复 resolve sortUrl 时复用用户输入，避免连弹多次 */
const resultCache = new Map<string, string>();

function verificationCacheKey(request: SourceVerificationRequest): string {
  return `${request.sourceKey}\0${request.imageUrl}`;
}

/** 由 App 挂载 SourceVerificationDialog 时注册 */
export function registerSourceVerificationHandler(fn: SourceVerificationHandler | null): void {
  handler = fn;
}

/** 切换 RSS 分类等场景下清除缓存，下次进入「搜索」可重新输入 */
export function clearSourceVerificationResultCache(sourceKey?: string): void {
  if (!sourceKey) {
    resultCache.clear();
    return;
  }
  const prefix = `${sourceKey}\0`;
  for (const key of resultCache.keys()) {
    if (key.startsWith(prefix)) resultCache.delete(key);
  }
}

/** 打开验证码/输入对话框并等待用户提交（空字符串表示取消） */
export function promptSourceVerificationCode(
  request: SourceVerificationRequest,
): Promise<string> {
  const key = verificationCacheKey(request);
  if (resultCache.has(key)) {
    return Promise.resolve(resultCache.get(key)!);
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  if (!handler) {
    console.warn('[source-verification] 未注册对话框处理器', request.sourceName);
    return Promise.resolve('');
  }

  const promise = handler(request)
    .then((value) => {
      const trimmed = value.trim();
      if (!trimmed) {
        throw new SourceVerificationCancelledError();
      }
      resultCache.set(key, trimmed);
      return trimmed;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

/** 供测试或调试：当前源是否已有验证输入缓存 */
export function peekSourceVerificationResult(
  source: { sourceUrl: string; bookSourceUrl?: string },
  imageUrl: string,
): string | undefined {
  const sourceKey = getLegadoSourceKey(source as never);
  return resultCache.get(`${sourceKey}\0${imageUrl}`);
}
