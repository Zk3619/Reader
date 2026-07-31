/**
 * Douyin / BiliBangumi / Instagram / Reddit / Niconico — 高价值站点精简实现。
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class DouyinIE extends InfoExtractor {
  static IE_NAME = 'douyin';
  static IE_DESC = '抖音';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?douyin\.com\/(?:video|note)\/(?<id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const id = this._match_id(url);
    if (!id) throw new ExtractorError('Unable to extract Douyin id', { expected: true });

    const headers = {
      Referer: 'https://www.douyin.com/',
      'User-Agent': UA,
    };

    // 优先 aweme detail API；失败回退网页 RENDER_DATA / __NEXT_DATA__
    const detailJson = await this._download_json<{
      aweme_detail?: Record<string, unknown>;
    }>(
      `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${id}`,
      id,
      'Downloading Douyin detail',
      { headers, fatal: false },
    );

    let detail = detailJson?.aweme_detail as Record<string, unknown> | undefined;
    if (!detail) {
      const webpage = await this._download_webpage(url, id, 'Downloading Douyin webpage', {
        headers,
        fatal: false,
      });
      detail = extractDouyinDetail(webpage || '') || undefined;
    }
    if (!detail) {
      throw new ExtractorError(
        '无法提取抖音详情（可能需要新鲜 cookies / s_v_web_id）',
        { expected: true },
      );
    }

    const video = (detail.video || {}) as Record<string, unknown>;
    const formats: Format[] = [];
    const pushUrl = (u: unknown, fid: string) => {
      const s = typeof u === 'string' ? u : Array.isArray(u) ? String(u[0] || '') : '';
      if (!s) return;
      formats.push({
        format_id: fid,
        url: s,
        ext: 'mp4',
        protocol: 'https',
        vcodec: 'h264',
        acodec: 'aac',
        http_headers: headers,
      });
    };

    const playAddr = video.play_addr as Record<string, unknown> | undefined;
    const downloadAddr = video.download_addr as Record<string, unknown> | undefined;
    pushUrl(playAddr?.url_list, 'play');
    pushUrl(downloadAddr?.url_list, 'download');
    const bitRate = (video.bit_rate as Record<string, unknown>[]) || [];
    bitRate.forEach((b, i) => {
      const addr = b.play_addr as Record<string, unknown> | undefined;
      pushUrl(addr?.url_list, `br-${i}`);
    });

    if (!formats.length) throw new ExtractorError('No Douyin media URL', { expected: true });

    const author = (detail.author || {}) as Record<string, unknown>;
    const desc = String(detail.desc || detail.preview_title || id);
    return {
      id,
      title: desc,
      description: desc,
      duration: Number(video.duration || detail.duration) / (Number(video.duration) > 1000 ? 1000 : 1) || null,
      uploader: String(author.nickname || author.unique_id || '') || undefined,
      thumbnail: String(
        ((video.cover || video.origin_cover) as Record<string, unknown>)?.url_list
          ? (((video.cover || video.origin_cover) as Record<string, unknown>).url_list as string[])[0]
          : '',
      ) || undefined,
      webpage_url: `https://www.douyin.com/video/${id}`,
      original_url: url,
      formats,
      extractor: 'douyin',
      extractor_key: 'Douyin',
      http_headers: headers,
    };
  }
}

function extractDouyinDetail(webpage: string): Record<string, unknown> | null {
  const patterns = [
    /<script[^>]*id="RENDER_DATA"[^>]*>([^<]+)<\/script>/i,
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/,
  ];
  for (const re of patterns) {
    const m = webpage.match(re);
    if (!m?.[1]) continue;
    try {
      let raw = m[1];
      if (re.source.includes('RENDER_DATA')) {
        raw = decodeURIComponent(raw);
      }
      const data = JSON.parse(raw) as Record<string, unknown>;
      const detail =
        findAwemeDetail(data) ||
        ((data as { aweme?: { detail?: Record<string, unknown> } }).aweme?.detail);
      if (detail) return detail;
    } catch {
      /* continue */
    }
  }
  return null;
}

function findAwemeDetail(obj: unknown, depth = 0): Record<string, unknown> | null {
  if (!obj || depth > 8) return null;
  if (typeof obj !== 'object') return null;
  const rec = obj as Record<string, unknown>;
  if (rec.aweme_detail && typeof rec.aweme_detail === 'object') {
    return rec.aweme_detail as Record<string, unknown>;
  }
  if (rec.awemeId && rec.video) return rec;
  for (const v of Object.values(rec)) {
    const hit = findAwemeDetail(v, depth + 1);
    if (hit) return hit;
  }
  return null;
}

export class BiliBangumiIE extends InfoExtractor {
  static IE_NAME = 'bilibili:bangumi';
  static IE_DESC = 'Bilibili bangumi episode';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?bilibili\.com\/bangumi\/play\/ep(?<id>\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const id = this._match_id(url);
    if (!id) throw new ExtractorError('Unable to extract bangumi ep id', { expected: true });

    const headers = {
      Referer: url,
      Origin: 'https://www.bilibili.com',
      'User-Agent': UA,
    };

    const webpage = await this._download_webpage(url, id, 'Downloading bangumi webpage', {
      headers,
      fatal: false,
    });
    if (webpage?.includes('您所在的地区无法观看本片')) {
      throw new ExtractorError('该番剧在当前地区不可用', { expected: true });
    }

    let playInfo =
      extractJsonAssign(webpage || '', /playurlSSRData\s*=/) ||
      (await this._download_json<Record<string, unknown>>(
        `https://api.bilibili.com/pgc/player/web/v2/playurl?fnval=12240&ep_id=${id}`,
        id,
        'Downloading bangumi playurl',
        { headers, fatal: false },
      ));

    playInfo = unwrapBangumiPlay(playInfo);
    const videoInfo = (playInfo?.video_info || playInfo || {}) as Record<string, unknown>;
    const formats = parseBiliDashFormats(videoInfo, headers);
    if (!formats.length) {
      throw new ExtractorError('番剧无可下载格式（可能需大会员）', { expected: true });
    }

    const season = await this._download_json<{
      result?: {
        title?: string;
        episodes?: Array<{ id?: number; title?: string; long_title?: string; cover?: string }>;
      };
    }>(
      `https://api.bilibili.com/pgc/view/web/season?ep_id=${id}`,
      id,
      'Downloading bangumi season',
      { headers, fatal: false },
    );
    const ep =
      season?.result?.episodes?.find((e) => String(e.id) === id) ||
      season?.result?.episodes?.[0];
    const title =
      (ep ? `${ep.title || ''} ${ep.long_title || ''}`.trim() : '') ||
      season?.result?.title ||
      `ep${id}`;

    return {
      id,
      title,
      thumbnail: ep?.cover,
      webpage_url: `https://www.bilibili.com/bangumi/play/ep${id}`,
      original_url: url,
      formats,
      extractor: 'bilibili:bangumi',
      extractor_key: 'BiliBiliBangumi',
      http_headers: headers,
    };
  }
}

function unwrapBangumiPlay(play: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!play) return {};
  let cur: Record<string, unknown> = play;
  if (cur.raw && typeof cur.raw === 'object') cur = cur.raw as Record<string, unknown>;
  if (cur.data && typeof cur.data === 'object') cur = cur.data as Record<string, unknown>;
  if (cur.result && typeof cur.result === 'object') cur = cur.result as Record<string, unknown>;
  return cur;
}

function extractJsonAssign(webpage: string, startRe: RegExp): Record<string, unknown> | null {
  const m = webpage.match(startRe);
  if (!m || m.index == null) return null;
  const start = webpage.indexOf('{', m.index);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < webpage.length && i < start + 2_000_000; i++) {
    const ch = webpage[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(webpage.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function parseBiliDashFormats(
  videoInfo: Record<string, unknown>,
  headers: Record<string, string>,
): Format[] {
  const formats: Format[] = [];
  const dash = (videoInfo.dash || {}) as {
    video?: Array<Record<string, unknown>>;
    audio?: Array<Record<string, unknown>>;
  };
  for (const v of dash.video || []) {
    const u = String(v.baseUrl || v.base_url || '');
    if (!u) continue;
    formats.push({
      format_id: `dash-v-${v.id || formats.length}`,
      url: u,
      ext: 'mp4',
      protocol: 'https',
      width: Number(v.width) || null,
      height: Number(v.height) || null,
      vcodec: String(v.codecs || 'h264').split('.')[0] || 'h264',
      acodec: 'none',
      http_headers: headers,
    });
  }
  for (const a of dash.audio || []) {
    const u = String(a.baseUrl || a.base_url || '');
    if (!u) continue;
    formats.push({
      format_id: `dash-a-${a.id || formats.length}`,
      url: u,
      ext: 'm4a',
      protocol: 'https',
      vcodec: 'none',
      acodec: String(a.codecs || 'aac').split('.')[0] || 'aac',
      http_headers: headers,
    });
  }
  const durl = (videoInfo.durl as Array<Record<string, unknown>>) || [];
  durl.forEach((d, i) => {
    const u = String(d.url || '');
    if (!u) return;
    formats.push({
      format_id: `durl-${i}`,
      url: u,
      ext: 'mp4',
      protocol: 'https',
      vcodec: 'h264',
      acodec: 'aac',
      http_headers: headers,
    });
  });
  return formats;
}

export class InstagramIE extends InfoExtractor {
  static IE_NAME = 'instagram';
  static IE_DESC = 'Instagram';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?instagram\.com(?:\/[^/?#]+)?\/(?:p|tv|reels?)\/(?<id>[^/?#&]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const id = this._match_id(url);
    if (!id) throw new ExtractorError('Unable to extract Instagram id', { expected: true });

    const headers = {
      'User-Agent': UA,
      Referer: 'https://www.instagram.com/',
    };
    const webpage = await this._download_webpage(
      `https://www.instagram.com/p/${id}/`,
      id,
      'Downloading Instagram webpage',
      { headers },
    );

    const formats: Format[] = [];
    const push = (u: string | undefined, fid: string) => {
      if (!u) return;
      formats.push({
        format_id: fid,
        url: u.replace(/\\u0026/g, '&'),
        ext: 'mp4',
        protocol: 'https',
        vcodec: 'h264',
        acodec: 'aac',
        http_headers: headers,
      });
    };

    // embed / sharedData / meta og:video
    const videoMeta = webpage.match(
      /<meta[^>]+property=["']og:video(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    );
    push(videoMeta?.[1], 'og');

    const contentUrl = webpage.match(/"video_url"\s*:\s*"([^"]+)"/);
    push(contentUrl?.[1]?.replace(/\\u0026/g, '&').replace(/\\\//g, '/'), 'json');

    const additional = webpage.matchAll(/"video_versions"\s*:\s*\[([\s\S]*?)\]/g);
    for (const m of additional) {
      const urls = [...m[1].matchAll(/"url"\s*:\s*"([^"]+)"/g)];
      urls.forEach((u, i) => push(u[1]?.replace(/\\u0026/g, '&').replace(/\\\//g, '/'), `vv-${i}`));
    }

    if (!formats.length) {
      throw new ExtractorError(
        '无法提取 Instagram 媒体（页面可能需登录）',
        { expected: true },
      );
    }

    const title =
      webpage.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      `Instagram ${id}`;
    const thumb = webpage.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    )?.[1];

    return {
      id,
      title: decodeHtml(title),
      thumbnail: thumb,
      webpage_url: `https://www.instagram.com/p/${id}/`,
      original_url: url,
      formats,
      extractor: 'instagram',
      extractor_key: 'Instagram',
      http_headers: headers,
    };
  }
}

export class RedditIE extends InfoExtractor {
  static IE_NAME = 'reddit';
  static IE_DESC = 'Reddit';
  static _VALID_URL =
    /https?:\/\/(?:\w+\.)?reddit(?:media)?\.com\/(?<slug>(?:(?:r|user)\/[^/]+\/)?comments\/(?<id>[^/?#&]+))/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const id = m?.groups?.id || this._match_id(url);
    const slug = m?.groups?.slug;
    if (!id || !slug) throw new ExtractorError('Unable to extract Reddit id', { expected: true });

    const headers = {
      'User-Agent': UA,
      Accept: 'application/json',
    };
    const data = await this._download_json<unknown>(
      `https://www.reddit.com/${slug}/.json`,
      id,
      'Downloading Reddit JSON',
      { headers },
    );

    const post = extractRedditPost(data);
    if (!post) throw new ExtractorError('Unable to parse Reddit post', { expected: true });

    const title = String(post.title || id);
    const redditVideo =
      ((post.secure_media || post.media) as Record<string, unknown> | undefined)?.reddit_video as
        | Record<string, unknown>
        | undefined;

    const formats: Format[] = [];
    if (redditVideo?.fallback_url) {
      formats.push({
        format_id: 'fallback',
        url: String(redditVideo.fallback_url).replace(/&amp;/g, '&'),
        ext: 'mp4',
        protocol: 'https',
        width: Number(redditVideo.width) || null,
        height: Number(redditVideo.height) || null,
        vcodec: 'h264',
        acodec: 'aac',
        http_headers: { 'User-Agent': UA },
      });
      const hls = redditVideo.hls_url ? String(redditVideo.hls_url) : '';
      if (hls) {
        formats.push({
          format_id: 'hls',
          url: hls.replace(/&amp;/g, '&'),
          ext: 'mp4',
          protocol: 'm3u8_native',
          vcodec: 'unknown',
          acodec: 'unknown',
        });
      }
    }

    // 外链视频
    if (!formats.length && post.url && /\.(mp4|webm|mov)(\?|$)/i.test(String(post.url))) {
      formats.push({
        format_id: 'direct',
        url: String(post.url),
        ext: 'mp4',
        protocol: 'https',
        vcodec: 'h264',
        acodec: 'aac',
      });
    }

    if (!formats.length) {
      throw new ExtractorError('该 Reddit 帖子无托管视频', { expected: true });
    }

    return {
      id: String(redditVideo?.fallback_url || id).match(/v\.redd\.it\/([^/?#]+)/)?.[1] || id,
      display_id: id,
      title,
      uploader: String(post.author || '') || undefined,
      thumbnail: String(post.thumbnail || '') || undefined,
      duration: Number(redditVideo?.duration) || null,
      webpage_url: `https://www.reddit.com/${slug}`,
      original_url: url,
      formats,
      extractor: 'reddit',
      extractor_key: 'Reddit',
    };
  }
}

function extractRedditPost(data: unknown): Record<string, unknown> | null {
  if (!Array.isArray(data)) return null;
  const listing = data[0] as { data?: { children?: Array<{ data?: Record<string, unknown> }> } };
  return listing?.data?.children?.[0]?.data || null;
}

export class NiconicoIE extends InfoExtractor {
  static IE_NAME = 'niconico';
  static IE_DESC = 'ニコニコ動画';
  static _VALID_URL =
    /https?:\/\/(?:(?:embed|sp|www)\.)?nicovideo\.jp\/(?:shorts|watch)\/(?<id>(?:[a-z]{2})?\d+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const id = this._match_id(url);
    if (!id) throw new ExtractorError('Unable to extract niconico id', { expected: true });

    const headers = { 'User-Agent': UA, Referer: 'https://www.nicovideo.jp/' };
    const webpage = await this._download_webpage(
      `https://www.nicovideo.jp/watch/${id}`,
      id,
      'Downloading niconico webpage',
      { headers },
    );

    const apiData =
      extractJsonAssign(webpage, /data-api-data="/) ||
      extractNicoApiDataAttr(webpage) ||
      extractJsonAssign(webpage, /server-response/);

    const video = (apiData?.video || apiData?.media || apiData || {}) as Record<string, unknown>;
    const title =
      String(
        (video as { title?: string }).title ||
          webpage.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1] ||
          id,
      );

    const formats: Format[] = [];
    // 新 delivery：尝试 media.domand / session API 线索中的 m3u8
    const m3u8Matches = [
      ...webpage.matchAll(/https?:\\\/\\\/[^\s"']+\.m3u8[^\s"']*/g),
      ...webpage.matchAll(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/g),
    ];
    for (const mm of m3u8Matches) {
      const u = mm[0].replace(/\\\//g, '/').replace(/\\u0026/g, '&');
      formats.push({
        format_id: 'hls',
        url: u,
        ext: 'mp4',
        protocol: 'm3u8_native',
        vcodec: 'unknown',
        acodec: 'unknown',
        http_headers: headers,
      });
      break;
    }

    // 旧 flash/smile 直链偶发残留
    const smile = webpage.match(/https?:\/\/[^\s"']*smile-video[^\s"']*/);
    if (smile) {
      formats.push({
        format_id: 'smile',
        url: smile[0].replace(/&amp;/g, '&'),
        ext: 'mp4',
        protocol: 'https',
        vcodec: 'h264',
        acodec: 'aac',
        http_headers: headers,
      });
    }

    // delivery API：若有 accessRightKey / video.id，尝试创建 session
    if (!formats.length) {
      const delivery = await tryNiconicoDelivery(this, id, apiData, headers);
      formats.push(...delivery);
    }

    if (!formats.length) {
      throw new ExtractorError(
        '无法提取 niconico 播放地址（可能需登录或新版 delivery 会话）',
        { expected: true },
      );
    }

    return {
      id,
      title: decodeHtml(title),
      webpage_url: `https://www.nicovideo.jp/watch/${id}`,
      original_url: url,
      formats,
      extractor: 'niconico',
      extractor_key: 'Niconico',
      http_headers: headers,
    };
  }
}

function extractNicoApiDataAttr(webpage: string): Record<string, unknown> | null {
  const m = webpage.match(/data-api-data="([^"]+)"/);
  if (!m?.[1]) return null;
  try {
    return JSON.parse(decodeHtml(m[1])) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function tryNiconicoDelivery(
  ie: InfoExtractor,
  id: string,
  apiData: Record<string, unknown> | null,
  headers: Record<string, string>,
): Promise<Format[]> {
  if (!apiData) return [];
  const media = (apiData.media as Record<string, unknown>) || {};
  const domand = (media.domand as Record<string, unknown>) || {};
  const accessRightKey = String(domand.accessRightKey || '');
  const videos = (domand.videos as Array<Record<string, unknown>>) || [];
  const audios = (domand.audios as Array<Record<string, unknown>>) || [];
  if (!accessRightKey || !videos.length) return [];

  const videoId = String(videos[0]?.id || '');
  const audioId = String(audios[0]?.id || '');
  if (!videoId) return [];

  const watchTrackId = String(
    ((apiData.client as Record<string, unknown>)?.watchTrackId as string) || 'NicoGoogle_0',
  );

  const resp = await ie._download_json<{
    data?: { contentUrl?: string };
    meta?: { status?: number };
  }>(
    `https://nvapi.nicovideo.jp/v1/watch/${id}/access-rights/hls?actionTrackId=${encodeURIComponent(watchTrackId)}`,
    id,
    'Creating niconico HLS session',
    {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'X-Access-Right-Key': accessRightKey,
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0',
      },
      data: JSON.stringify({
        outputs: audioId ? [[videoId, audioId]] : [[videoId]],
      }),
      fatal: false,
    },
  );

  const contentUrl = resp?.data?.contentUrl;
  if (!contentUrl) return [];
  return [
    {
      format_id: 'domand-hls',
      url: contentUrl,
      ext: 'mp4',
      protocol: 'm3u8_native',
      vcodec: 'unknown',
      acodec: 'unknown',
      http_headers: headers,
    },
  ];
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\\u0026/g, '&');
}
