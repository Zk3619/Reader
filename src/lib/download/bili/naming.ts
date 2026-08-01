/**
 * 三级命名模板 + organize
 */

import { getBiliDownloadConfigSync } from './config';
import { sanitizeFilename, timestampLabel } from './error';
import type { MediaItem, MediaNfo, TaskType } from './types';

export type NamingContext = {
  item: MediaItem;
  nfo: MediaNfo;
  taskType?: TaskType;
  res?: number;
  abr?: number;
  enc?: number;
  fmt?: string;
  index?: number;
  downtime?: number;
};

function formatToken(
  template: string,
  ctx: NamingContext,
): string {
  const downtime = ctx.downtime ?? Math.floor(Date.now() / 1000);
  const map: Record<string, string | number | undefined> = {
    showtitle: ctx.nfo.showtitle ?? ctx.item.title,
    title: ctx.item.title,
    container: ctx.nfo.showtitle ?? 'bilibili',
    mediaType: ctx.item.type,
    taskType: ctx.taskType ?? 'media',
    index: ctx.index ?? ctx.item.index,
    pubtime: ctx.item.pubtime
      ? timestampLabel(ctx.item.pubtime).replace(/[:\s]/g, '-')
      : '',
    downtime: timestampLabel(downtime).replace(/[:\s]/g, '-'),
    upper: ctx.nfo.upper?.name,
    upperid: ctx.nfo.upper?.mid,
    aid: ctx.item.aid,
    sid: ctx.item.sid,
    fid: ctx.item.fid,
    cid: ctx.item.cid,
    bvid: ctx.item.bvid,
    epid: ctx.item.epid,
    ssid: ctx.item.ssid,
    opid: ctx.item.opid,
    res: ctx.res,
    abr: ctx.abr,
    enc: ctx.enc,
    fmt: ctx.fmt,
  };

  return template.replace(
    /\{(\w+)(?::([^}]+))?\}/g,
    (_m, key: string, fmt?: string) => {
      if ((key === 'pubtime' || key === 'downtime') && fmt) {
        const ts = key === 'pubtime' ? ctx.item.pubtime : downtime;
        // 简易替换常用格式
        const label = timestampLabel(ts).replace(/[:\s]/g, '-');
        return label;
      }
      const v = map[key];
      return v == null ? '' : String(v);
    },
  );
}

export function buildPaths(ctx: NamingContext): {
  series: string;
  item: string;
  file: string;
  relativeDir: string;
} {
  const cfg = getBiliDownloadConfigSync();
  const series = sanitizeFilename(formatToken(cfg.format.series, ctx));
  const item = sanitizeFilename(formatToken(cfg.format.item, ctx));
  const file = sanitizeFilename(formatToken(cfg.format.file, ctx));
  const parts: string[] = [];
  if (cfg.organize.topFolder) parts.push(series);
  if (cfg.organize.subFolder) parts.push(item);
  return {
    series,
    item,
    file,
    relativeDir: parts.join('/'),
  };
}
