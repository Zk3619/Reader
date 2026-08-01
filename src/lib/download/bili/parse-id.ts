/**
 * 解析 B 站链接 / 裸 ID / 分享文案 / b23 短链
 */

import { BiliError } from './error';
import { tryFetch } from './http';
import type { MediaType, ParseIdResult } from './types';

export async function parseId(
  input: string,
  ignore?: boolean,
): Promise<ParseIdResult> {
  const raw = input.trim();
  const err = () => new BiliError('无效的 B 站链接或 ID');

  if (/^(av\d+|BV\w{10}|ep\d+|ss\d+|md\d+|au\d+|am\d+|cv\d+)$/i.test(raw)) {
    const map: Record<string, MediaType> = {
      av: 'video',
      bv: 'video',
      ep: 'bangumi',
      ss: 'bangumi',
      md: 'bangumi',
      au: 'music',
      am: 'musicList',
      cv: 'opus',
    };
    const prefix = raw.slice(0, 2).toLowerCase();
    return { id: raw, type: map[prefix] };
  }

  let url: URL;
  try {
    const picked = input
      .split(/\s+/)
      .find(
        (v) =>
          /^(?:https?:\/\/)?(?:[\w-]+\.)*(?:bilibili\.com|b23\.tv)\/.+$/i.test(
            v,
          ) && /^[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/.test(v),
      );
    url = new URL(
      picked
        ? /^https?:\/\//i.test(picked)
          ? picked
          : `https://${picked}`
        : /\.(bilibili\.com|b23\.tv)$/i.test(raw)
          ? `https://${raw}`
          : raw,
    );
  } catch {
    if (ignore) return { id: raw };
    throw err();
  }

  const host = url.hostname.toLowerCase();
  if (!/^(?:([a-z0-9-]+\.)*bilibili\.com|b23\.tv)$/i.test(host)) {
    throw err();
  }
  const segs = url.pathname.slice(1).split('/');
  const prms = url.searchParams;

  if (host === 'b23.tv') {
    const redirected = (await tryFetch(url.href, { type: 'url' })) as string;
    return parseId(redirected);
  }

  if (host === 'space.bilibili.com') {
    const mid = segs[0];
    const type = segs[1];
    if (type === 'favlist') {
      const fid = url.searchParams.get('fid');
      return {
        id: mid,
        type: 'favorite',
        target: /^\d+$/.test(fid ?? '') ? Number(fid) : undefined,
      };
    }
    if ((segs[2] ?? type) === 'video' || type === 'lists' || segs.length === 1) {
      const id = input.match(/\/lists\/(\d+)/)?.[1];
      return {
        id: mid!,
        type: 'userVideo',
        target: /^\d+$/.test(id ?? '') ? Number(id) : undefined,
      };
    }
    if (segs[2] === 'opus' || type === 'article') {
      return { id: mid!, type: 'userOpus' };
    }
    if (segs[2] === 'audio' || type === 'audio') {
      return { id: mid!, type: 'userAudio' };
    }
    throw err();
  }

  let type = segs[0];
  let id = segs[1];
  if (/^(BV\w{10}|av\d+)$/i.test(id ?? '')) {
    return { id: id!, type: 'video' };
  }
  if (/(au\d+|am\d+)/i.test(id ?? '')) {
    if (id!.toLowerCase().startsWith('au')) return { id: id!, type: 'music' };
    if (id!.toLowerCase().startsWith('am')) return { id: id!, type: 'musicList' };
  }
  if (/(cv\d+)/i.test(id ?? '') || type === 'opus') {
    return { id: id!, type: 'opus' };
  }
  if (type === 'watchlater') {
    return { id: '', type: 'watchLater' };
  }

  id = segs[2];
  if (/(ep\d+|ss\d+|md\d+)/i.test(id ?? '')) {
    if (type === 'bangumi') return { id: id!, type: 'bangumi' };
    if (type === 'cheese') return { id: id!, type: 'lesson' };
  }
  if (/rl\d+/i.test(id ?? '')) {
    return { id: id!, type: 'opusList' };
  }

  type = segs[1];
  if (type === 'watchlater') {
    const vid = prms.get('aid') ?? prms.get('oid') ?? prms.get('bvid');
    if (vid) return { id: vid, type: 'video' };
  }
  throw err();
}
