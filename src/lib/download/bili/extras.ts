/**
 * 附加资源：弹幕 / 字幕 / NFO / AI / 互动视频 / 历史
 */

import {
  BiliError,
  durationLabel,
  getRandomInRange,
  timestampLabel,
} from './error';
import { tryFetch } from './http';
import { DanmakuEventToXML } from './dm';
import type { MediaItem, MediaNfo } from './types';

export async function getUserInfo(id?: number | string) {
  const mid = id;
  if (mid == null || mid === '') throw new BiliError('缺少 mid');
  const info = (
    (await tryFetch('https://api.bilibili.com/x/space/wbi/acc/info', {
      auth: 'wbi',
      params: { mid },
    })) as { data: { name: string; mid: number; face: string } }
  ).data;
  return { name: info.name, mid: info.mid, avatar: info.face };
}

export async function getEdgeInfo(
  aid: number,
  graph_version: number,
  edge_id?: number,
) {
  const response = await tryFetch(
    'https://api.bilibili.com/x/stein/edgeinfo_v2',
    { auth: 'wbi', params: { aid, graph_version, edge_id } },
  );
  return (response as { data: Record<string, unknown> }).data;
}

export async function getPlayerInfo(aid: number, cid: number) {
  const response = await tryFetch('https://api.bilibili.com/x/player/wbi/v2', {
    params: { aid, cid },
    auth: 'wbi',
  });
  return (response as { data: Record<string, unknown> }).data;
}

export async function getAISummary(
  item: MediaItem,
  options?: { check?: boolean },
): Promise<Uint8Array | -1 | boolean> {
  if (!item.aid || !item.cid) throw new BiliError('No aid or cid found');
  const response = await tryFetch(
    'https://api.bilibili.com/x/web-interface/view/conclusion/get',
    { auth: 'wbi', params: { aid: item.aid, cid: item.cid } },
  );
  const body = response as {
    data: {
      model_result: {
        result_type: number;
        summary?: string;
        outline?: Array<{
          title: string;
          timestamp: number;
          part_outline: Array<{ content: string; timestamp: number }>;
        }>;
      };
    };
  };
  const result = body.data.model_result;
  if (options?.check) return Boolean(result.result_type);
  if (!result.result_type) return -1;
  let text = `# ${item.title} - ${item.bvid}\n\n${result.summary}\n\n`;
  if (result.result_type === 2 && result.outline) {
    for (const section of result.outline) {
      text += `## ${section.title} - [${durationLabel(section.timestamp)}](https://www.bilibili.com/video/${item.bvid}?t=${section.timestamp})\n\n`;
      for (const part of section.part_outline) {
        text += `- ${part.content} - [${durationLabel(part.timestamp)}](https://www.bilibili.com/video/${item.bvid}?t=${part.timestamp})\n\n`;
      }
    }
  }
  return new TextEncoder().encode(text);
}

export type SubtitleMeta = { lan: string; lan_doc: string; subtitle_url: string };

export async function getSubtitle(
  item: MediaItem,
  options?: { name?: false | string },
): Promise<SubtitleMeta[] | Uint8Array | -1> {
  if (!item.aid || !item.cid) throw new BiliError('No aid or cid found');
  const playerInfo = await getPlayerInfo(item.aid, item.cid);
  const subtitles = (
    (playerInfo.subtitle as { subtitles?: SubtitleMeta[] } | undefined)
      ?.subtitles ?? []
  ) as SubtitleMeta[];
  if (!options?.name) return subtitles;
  const _url = subtitles.find((v) => v.lan === options.name)?.subtitle_url;
  if (!_url) return -1;
  const subtitle = (await tryFetch(
    _url.startsWith('//') ? `https:${_url}` : _url,
    { ignoreErr: true },
  )) as { body: Array<{ from: number; to: number; content: string }> };
  const getTime = (s: number) =>
    new Date(s * 1000).toISOString().slice(11, 23).replace('.', ',');
  return new TextEncoder().encode(
    subtitle.body
      .map(
        (l, i) =>
          `${i + 1}\n${getTime(l.from)} --> ${getTime(l.to)}\n${l.content}`,
      )
      .join('\n\n'),
  );
}

export async function getNfo(
  item: MediaItem,
  nfo: MediaNfo,
  type: 'album' | 'nfo',
): Promise<Uint8Array> {
  const mode =
    type === 'album'
      ? 'album'
      : item.type === 'video'
        ? 'movie'
        : item.type === 'bangumi' || item.type === 'lesson'
          ? 'episodedetails'
          : 'movie';
  const doc = document.implementation.createDocument('', mode, null);
  const root = doc.documentElement;
  const add = (k: string, v?: string | number | null, node: Node = root) => {
    const el = doc.createElement(k);
    el.textContent = String(v ?? '');
    node.appendChild(el);
    return el;
  };
  if (mode === 'album') add('title', nfo.showtitle);
  else if (mode === 'movie') {
    add('title', item.title);
    add('originaltitle', nfo.showtitle);
  } else add('title', item.title);

  const summary = await getAISummary(item);
  if (summary !== -1 && summary !== true && summary !== false) {
    add(
      'plot',
      new TextDecoder().decode(summary) +
        '\n' +
        (mode === 'album' ? (nfo.intro ?? item.desc) : item.desc),
    );
  } else {
    add('plot', mode === 'album' ? (nfo.intro ?? item.desc) : item.desc);
  }
  if (mode === 'album') {
    const el = add('thumb', 'poster.jpg');
    el.setAttribute('preview', 'poster.jpg');
  } else {
    for (const v of nfo.thumbs) {
      const el = add('thumb', v.url);
      el.setAttribute('preview', v.url);
    }
  }
  add('runtime', Math.round(item.duration / 60));
  add(
    'premiered',
    timestampLabel(item.pubtime, 'Asia/Shanghai').split(' ')[0],
  );
  if (nfo.upper?.name) add('director', nfo.upper.name);
  for (const v of new Set(nfo.tags ?? [])) {
    add('genre', v);
    add('tag', v);
  }
  nfo.credits?.actors?.forEach((v, i) => {
    const node = add('actor', '');
    add('name', v.name, node);
    add('role', v.role, node);
    add('order', i + 1, node);
  });
  nfo.credits?.staff?.forEach((v) => add(v.role ?? 'credits', v.name));
  (['aid', 'sid', 'fid', 'cid', 'bvid', 'epid', 'ssid'] as const).forEach((k) => {
    if (item[k] != null) add(`bili:${k}`, item[k] as string | number);
  });
  const xml = new XMLSerializer().serializeToString(doc);
  return new TextEncoder().encode(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + xml,
  );
}

export async function getDanmaku(
  cb: (content: number, chunk: number) => void,
  item: MediaItem,
  date?: false | string,
): Promise<Uint8Array> {
  if (!item.aid || !item.cid) throw new BiliError('No aid or cid found');
  const doc = document.implementation.createDocument('', 'i', null);
  const oid = item.cid;
  if (date) {
    const buffer = (await tryFetch(
      'https://api.bilibili.com/x/v2/dm/web/history/seg.so',
      { type: 'binary', params: { type: 1, oid, date } },
    )) as ArrayBuffer;
    DanmakuEventToXML(new Uint8Array(buffer), doc);
  } else {
    const content = Math.max(1, Math.ceil((item.duration ?? 0) / 360));
    cb(content + 1, 1);
    for (let i = 1; i <= content; i++) {
      cb(content + 1, i);
      const buffer = (await tryFetch(
        'https://api.bilibili.com/x/v2/dm/wbi/web/seg.so',
        {
          type: 'binary',
          auth: 'wbi',
          params: { type: 1, oid, pid: item.aid, segment_index: i },
        },
      )) as ArrayBuffer;
      DanmakuEventToXML(new Uint8Array(buffer), doc);
      await new Promise((r) => setTimeout(r, getRandomInRange(100, 500)));
    }
  }
  const xml = new XMLSerializer().serializeToString(doc);
  return new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?>' + xml);
}

export async function getHistoryCursor() {
  const response = await tryFetch(
    'https://api.bilibili.com/x/web-interface/history/cursor',
    { params: { ps: 20, view_at: 0 } },
  );
  return (response as { data: Record<string, unknown> }).data;
}

export async function getHistorySearch(params: {
  pn: number;
  keyword: string;
  business: string;
  add_time_start: number;
  add_time_end: number;
  arc_max_duration: number;
  arc_min_duration: number;
  device_type: number;
}) {
  const response = await tryFetch(
    'https://api.bilibili.com/x/web-interface/history/search',
    { params },
  );
  return (
    (response as { data: { list: Array<Record<string, unknown>> } }).data
      ?.list ?? []
  );
}

export async function getHistoryList(viewAt = 0, ps = 20) {
  const response = await tryFetch(
    'https://api.bilibili.com/x/web-interface/history/cursor',
    { params: { ps, view_at: viewAt } },
  );
  return (response as {
    data: {
      list: Array<{
        title: string;
        cover: string;
        history: {
          bvid?: string;
          cid?: number;
          oid?: number;
          page?: number;
          business?: string;
        };
        progress?: number;
        duration?: number;
        author_name?: string;
        author_mid?: number;
        view_at?: number;
      }>;
      cursor: { max: number; view_at: number };
    };
  }).data;
}
