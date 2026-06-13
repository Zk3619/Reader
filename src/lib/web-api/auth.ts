/**
 * Web 服务认证（对齐 Legado AppConfig.webServiceAuthEnabled / webServiceToken）
 */

import {
  getWebServiceToken,
  isWebServiceAuthEnabled,
} from '@/lib/web-api/config';
import { legadoErr, type LegadoReturnData } from '@/lib/web-api/return-data';
import type { WebApiRequest } from '@/lib/web-api/dispatch';

function extractToken(
  query?: Record<string, string>,
  headers?: Record<string, string>,
): string | undefined {
  const fromQuery = query?.token?.trim();
  if (fromQuery) return fromQuery;

  const auth = headers?.authorization ?? headers?.Authorization;
  if (auth) {
    const trimmed = auth.trim();
    if (trimmed.toLowerCase().startsWith('bearer ')) {
      return trimmed.slice(7).trim();
    }
    return trimmed;
  }

  const headerToken = headers?.token ?? headers?.Token;
  return headerToken?.trim();
}

/** 未通过时返回错误响应；通过时返回 null */
export async function assertWebApiAuthorized(
  request: WebApiRequest,
): Promise<LegadoReturnData<null> | null> {
  if (!(await isWebServiceAuthEnabled())) return null;

  const expected = (await getWebServiceToken()).trim();
  if (!expected) {
    return legadoErr('Web 服务已启用认证但未配置 Token');
  }

  const token = extractToken(request.query, request.headers);
  if (!token || token !== expected) {
    return legadoErr('Unauthorized: invalid or missing token');
  }
  return null;
}

export { extractToken };
