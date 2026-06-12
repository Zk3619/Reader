/**

 * RSS 源 Web API（对齐 Legado RssSourceController.kt）

 */



import * as rssDb from '@/lib/database/rss-sources';

import { parseRssSourceJson } from '@/lib/book-source/import-rss-source';

import { legadoErr, legadoOk, type LegadoReturnData } from '@/lib/web-api/return-data';

import { queryParam } from '@/lib/web-api/query';

import type { NewRssSource, RssSource } from '@/types';



function parseSingleRssSource(raw: string | null): NewRssSource | null {

  if (!raw?.trim()) return null;

  try {

    const parsed = JSON.parse(raw) as unknown;

    const text = JSON.stringify(Array.isArray(parsed) ? parsed : [parsed]);

    return parseRssSourceJson(text)[0] ?? null;

  } catch {

    return null;

  }

}



function parseRssSourceList(raw: string | null): NewRssSource[] {

  if (!raw?.trim()) return [];

  try {

    const parsed = JSON.parse(raw) as unknown;

    const text = JSON.stringify(Array.isArray(parsed) ? parsed : [parsed]);

    return parseRssSourceJson(text);

  } catch {

    return [];

  }

}



export async function getAllRssSourcesApi(): Promise<LegadoReturnData<RssSource[]>> {

  const sources = await rssDb.getAllRssSources();

  if (sources.length === 0) return legadoErr('源列表为空');

  return legadoOk(sources);

}



export async function getRssSourceApi(

  query: Record<string, string> | undefined,

): Promise<LegadoReturnData<RssSource>> {

  const url = queryParam(query, 'url');

  if (!url) return legadoErr('未找到源');

  const source = await rssDb.getRssSource(url);

  if (!source) return legadoErr('未找到源');

  return legadoOk(source);

}



export async function saveRssSourceApi(postData: string | null): Promise<LegadoReturnData<null>> {

  const source = parseSingleRssSource(postData);

  if (!source?.sourceUrl?.trim() || !source.sourceName?.trim()) {

    return legadoErr('格式不对');

  }

  await rssDb.insertRssSource(source);

  return legadoOk(null);

}



export async function saveRssSourcesApi(

  postData: string | null,

): Promise<LegadoReturnData<NewRssSource[]>> {

  const sources = parseRssSourceList(postData);

  if (sources.length === 0) return legadoErr('转换源失败');

  const saved: NewRssSource[] = [];

  for (const source of sources) {

    if (!source.sourceUrl?.trim() || !source.sourceName?.trim()) continue;

    await rssDb.insertRssSource(source);

    saved.push(source);

  }

  if (saved.length === 0) return legadoErr('转换源失败');

  return legadoOk(saved);

}



export async function deleteRssSourcesApi(postData: string | null): Promise<LegadoReturnData<string>> {

  const sources = parseRssSourceList(postData);

  if (sources.length === 0) return legadoErr('没有传递数据');

  for (const item of sources) {

    const url = item.sourceUrl?.trim();

    if (!url) continue;

    await rssDb.deleteRssSource(url);

  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('rss-sources-refresh'));
  }

  return legadoOk('已执行');

}


