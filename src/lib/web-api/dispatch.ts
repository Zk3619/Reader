/**
 * Legado Web 服务 API 路由分发
 */

import {
  addLocalBookApi,
  deleteBookApi,
  getBookContentApi,
  getBookshelfApi,
  getChapterListApi,
  getReadConfigApi,
  refreshTocApi,
  saveBookApi,
  saveBookProgressApi,
  saveReadConfigApi,
} from '@/lib/web-api/book-controller';
import { getBookImageApi, getCoverApi } from '@/lib/web-api/book-image-api';
import {
  deleteBookSourcesApi,
  getAllBookSourcesApi,
  getBookSourceApi,
  saveBookSourceApi,
  saveBookSourcesApi,
} from '@/lib/web-api/book-source-controller';
import { backupApi, getBackupPreviewApi } from '@/lib/web-api/backup-controller';
import {
  deleteReplaceRuleApi,
  getAllReplaceRulesApi,
  saveReplaceRuleApi,
  testReplaceRuleApi,
} from '@/lib/web-api/replace-rule-controller';
import {
  deleteRssSourcesApi,
  getAllRssSourcesApi,
  getRssSourceApi,
  saveRssSourceApi,
  saveRssSourcesApi,
} from '@/lib/web-api/rss-source-controller';
import { normalizeLegadoApiPath, isLegadoWebApiPath } from '@/lib/web-api/paths';
import { parseQueryString } from '@/lib/web-api/query';
import { jsonApiResult, type WebApiDispatchResult } from '@/lib/web-api/response';
import { legadoErr, legadoOk } from '@/lib/web-api/return-data';

export type WebApiMethod = 'GET' | 'POST' | 'OPTIONS';

export interface WebApiRequest {
  path: string;
  method: WebApiMethod;
  body?: string | null;
  query?: Record<string, string>;
}

export { isLegadoWebApiPath };

export async function dispatchLegadoWebApi(
  request: WebApiRequest,
): Promise<WebApiDispatchResult> {
  const fullPath = request.path;
  const path = normalizeLegadoApiPath(fullPath);
  const query =
    request.query ?? parseQueryString(fullPath.includes('?') ? fullPath.slice(fullPath.indexOf('?')) : '');
  const method = request.method.toUpperCase() as WebApiMethod;

  if (method === 'OPTIONS') {
    return jsonApiResult(legadoOk(null));
  }

  if (method === 'GET' && path === '/api') {
    const { getWebServicePort } = await import('@/lib/web-api/config');
    const { buildWebServiceRootPayload } = await import('@/lib/web-api/service-info');
    const { fetchLocalNetworkAddresses } = await import('@/lib/web-api/local-addresses');
    const port = await getWebServicePort();
    const addresses = await fetchLocalNetworkAddresses(port);
    return jsonApiResult(buildWebServiceRootPayload(port, addresses));
  }

  if (method === 'GET') {
    switch (path) {
      case '/getBookSources':
        return jsonApiResult(await getAllBookSourcesApi());
      case '/getBookSource':
        return jsonApiResult(await getBookSourceApi(query));
      case '/getRssSources':
        return jsonApiResult(await getAllRssSourcesApi());
      case '/getRssSource':
        return jsonApiResult(await getRssSourceApi(query));
      case '/getReplaceRules':
        return jsonApiResult(await getAllReplaceRulesApi());
      case '/getBookshelf':
        return jsonApiResult(await getBookshelfApi());
      case '/getChapterList':
        return jsonApiResult(await getChapterListApi(query));
      case '/refreshToc':
        return jsonApiResult(await refreshTocApi(query));
      case '/getBookContent':
        return jsonApiResult(await getBookContentApi(query));
      case '/getReadConfig':
        return jsonApiResult(await getReadConfigApi());
      case '/backupPreview':
        return jsonApiResult(await getBackupPreviewApi());
      case '/backup':
        return backupApi();
      case '/cover':
        return getCoverApi(query);
      case '/image':
        return getBookImageApi(query);
      default:
        break;
    }
  }

  if (method === 'POST') {
    const body = request.body ?? null;
    switch (path) {
      case '/saveBookSource':
        return jsonApiResult(await saveBookSourceApi(body));
      case '/saveBookSources':
        return jsonApiResult(await saveBookSourcesApi(body));
      case '/deleteBookSources':
        return jsonApiResult(await deleteBookSourcesApi(body));
      case '/saveRssSource':
        return jsonApiResult(await saveRssSourceApi(body));
      case '/saveRssSources':
        return jsonApiResult(await saveRssSourcesApi(body));
      case '/deleteRssSources':
        return jsonApiResult(await deleteRssSourcesApi(body));
      case '/saveReplaceRule':
        return jsonApiResult(await saveReplaceRuleApi(body));
      case '/deleteReplaceRule':
        return jsonApiResult(await deleteReplaceRuleApi(body));
      case '/testReplaceRule':
        return jsonApiResult(await testReplaceRuleApi(body));
      case '/saveBook':
        return jsonApiResult(await saveBookApi(body));
      case '/deleteBook':
        return jsonApiResult(await deleteBookApi(body));
      case '/saveBookProgress':
        return jsonApiResult(await saveBookProgressApi(body));
      case '/addLocalBook':
        return jsonApiResult(await addLocalBookApi());
      case '/saveReadConfig':
        return jsonApiResult(await saveReadConfigApi(body));
      default:
        break;
    }
  }

  return jsonApiResult(legadoErr(`未知 API: ${path}`));
}

