import { analyzeString } from '@/lib/rule-engine';
import type { BookSource } from '@/types';

export async function assertLoginCheckPassed(
  source: BookSource,
  body: string,
  requestUrl: string,
): Promise<void> {
  const loginCheckJs = source.loginCheckJs?.trim();
  if (!loginCheckJs) return;
  const result = (await analyzeString(loginCheckJs, {
    content: body,
    contentType: body.trim().startsWith('{') || body.trim().startsWith('[') ? 'json' : 'html',
    baseUrl: requestUrl,
    source: source as unknown as Record<string, unknown>,
    result: body,
  })).trim();
  const lowered = result.toLowerCase();
  if (!result || lowered === 'false' || lowered === '0' || lowered === 'null' || lowered === 'undefined') {
    throw new Error(`登录状态校验失败: ${source.sourceName}`);
  }
}
