/**
 * getPlayUrl — DASH / MP4 / FLV（对照 BiliTools getPlayUrl）
 */

import { BiliError } from './error';
import { tryFetch } from './http';
import { isBiliLoggedIn } from './session';
import type { MediaItem, MediaType, PlayUrlProvider, PlayUrlResult, StreamFormat } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = any;

export async function getPlayUrl(
  item: MediaItem,
  type: MediaType,
  codec: StreamFormat,
): Promise<PlayUrlProvider> {
  let url = 'https://api.bilibili.com';
  const loggedIn = isBiliLoggedIn();
  const params: Record<string, number | undefined> = {
    qn: loggedIn ? 127 : 64,
    fnver: 0,
    fnval: 16,
    fourk: 1,
  };
  switch (codec) {
    case 'flv':
      params.fnval = 0;
      break;
    case 'mp4':
      params.fnval = 1;
      break;
    case 'dash':
      params.fnval = loggedIn ? 4048 : 16;
      break;
  }
  const itemType = item.type || type;
  switch (itemType) {
    case 'video':
      url += '/x/player/wbi/playurl';
      Object.assign(params, { avid: item.aid, cid: item.cid });
      break;
    case 'bangumi':
      url += '/pgc/player/web/v2/playurl';
      Object.assign(params, { ep_id: item.epid, season_id: item.ssid });
      break;
    case 'lesson':
      url += '/pugv/player/web/playurl';
      Object.assign(params, {
        avid: item.aid,
        cid: item.cid,
        ep_id: item.epid,
        season_id: item.ssid,
      });
      break;
    case 'music':
      url = 'https://www.bilibili.com/audio/music-service-c/web/url';
      Object.assign(params, { sid: item.sid, privilege: 2, quality: 0 });
      break;
    default:
      if (item.sid) {
        url = 'https://www.bilibili.com/audio/music-service-c/web/url';
        Object.assign(params, { sid: item.sid, privilege: 2, quality: 0 });
      } else if (item.epid || item.ssid) {
        url += '/pgc/player/web/v2/playurl';
        Object.assign(params, { ep_id: item.epid, season_id: item.ssid });
      } else {
        url += '/x/player/wbi/playurl';
        Object.assign(params, { avid: item.aid, cid: item.cid });
      }
      break;
  }

  const body = (await tryFetch(url, {
    params,
    auth: 'wbi',
  })) as AnyRec;

  if (itemType === 'music' || url.includes('music-service')) {
    const data = body.data;
    const audio = [
      {
        id: ({ 0: 30228, 1: 30280, 2: 30380, 3: 30252 } as Record<number, number>)[
          data.type
        ] ?? -1,
        baseUrl: data.cdns[0],
        backupUrl: data.cdns,
      },
    ];
    return { audio, codec: 'dash' };
  }

  const data = (body.result?.video_info ?? body?.result ?? body?.data) as AnyRec;
  if (!data) throw new BiliError(body.message || '无播放地址', { code: body.code });

  if (data.durls?.length) {
    const video = data.durls.map((v: AnyRec) => ({
      id: v.quality,
      baseUrl: v.durl[0].url,
      backupUrl: v.durl[0].backup_url,
      size: v.durl[0].size,
    }));
    return { video, codec: 'mp4' };
  }
  if (data.durl?.length) {
    const video = (
      await Promise.all(
        (data.accept_quality as number[]).map(async (qn) => {
          params.qn = qn;
          const info =
            qn === data.quality
              ? body
              : ((await tryFetch(url, { params, auth: 'wbi' })) as AnyRec);
          const result = info.result?.video_info ?? info?.result ?? info?.data;
          const durl = result.durl?.[0];
          if (durl) {
            return {
              id: result.quality,
              baseUrl: durl.url,
              backupUrl: durl.backup_url,
              size: durl.size,
            } as PlayUrlResult;
          }
          return null;
        }),
      )
    ).filter(Boolean) as PlayUrlResult[];
    const outCodec: StreamFormat = String(data.accept_format || '').includes(
      'flv',
    )
      ? 'flv'
      : 'mp4';
    return { video, codec: outCodec };
  }
  if (data.dash) {
    const video = data.dash.video?.length ? data.dash.video : [];
    const audio = [
      ...(data.dash.audio?.length ? data.dash.audio : []),
      ...(data.dash.dolby?.audio?.length ? [data.dash.dolby.audio[0]] : []),
      ...(data.dash.flac?.audio ? [data.dash.flac.audio] : []),
    ];
    return { video, audio, codec: 'dash' };
  }
  throw new BiliError(body.message || '无法解析播放地址', { code: body.code });
}

export function streamUrlOf(r: PlayUrlResult): string {
  return r.baseUrl || r.base_url || r.backupUrl?.[0] || r.backup_url?.[0] || '';
}

export async function getCid(aid: number): Promise<number> {
  const body = (await tryFetch(
    'https://api.bilibili.com/x/player/pagelist',
    { params: { aid } },
  )) as AnyRec;
  return body.data[0].cid as number;
}
