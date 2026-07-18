/**
 * Spider 引擎接口
 */

import type { Result, Site } from '../types';

export type SpiderMethod =
  | 'homeContent'
  | 'homeVideoContent'
  | 'categoryContent'
  | 'detailContent'
  | 'searchContent'
  | 'playerContent'
  | 'liveContent'
  | 'action'
  | 'proxy';

export interface CategoryArgs {
  tid: string;
  pg: string;
  filter: boolean;
  extend: Record<string, string>;
}

export interface SearchArgs {
  key: string;
  quick: boolean;
  pg?: string;
}

export interface PlayerArgs {
  flag: string;
  id: string;
  vipFlags: string[];
}

export interface SpiderEngine {
  readonly kind: string;
  supports(site: Site): boolean;
  homeContent(site: Site, filter: boolean): Promise<Result>;
  homeVideoContent(site: Site): Promise<Result>;
  categoryContent(site: Site, args: CategoryArgs): Promise<Result>;
  detailContent(site: Site, ids: string[]): Promise<Result>;
  searchContent(site: Site, args: SearchArgs): Promise<Result>;
  playerContent(site: Site, args: PlayerArgs): Promise<Result>;
  destroy?(siteKey: string): Promise<void> | void;
}

export function emptyResult(): Result {
  return { list: [], class: [] };
}

export function parseResultJson(raw: string): Result {
  if (!raw || !raw.trim()) return emptyResult();
  try {
    const data = JSON.parse(raw) as Result;
    return data ?? emptyResult();
  } catch {
    return emptyResult();
  }
}
