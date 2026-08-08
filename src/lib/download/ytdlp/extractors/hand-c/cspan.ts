/**
 * CSpanIE / CSpanCongressIE — ported from yt-dlp cspan.py
 *
 * 旧 `/video/?…` 常 302 到 `/program/…/<progId>`（站点改版后常无 jwsetup）。
 * 注意：Python 里 `if {}` 为假，JS 里空对象为真 —— 必须显式判断 keys。
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  determine_ext,
  extract_attributes,
  find_xpath_attr,
  get_element_by_class,
  int_or_none,
  js_to_json,
  parse_qs,
  smuggle_url,
  str_to_int,
  unescapeHTML,
  url_or_none,
} from '../../utils';
import { parseIso8601, parseJwplayerData } from './_helpers';

function getTextAttr(d: unknown, attr: string): string | undefined {
  if (!d || typeof d !== 'object') return undefined;
  const v = (d as Record<string, unknown>)[attr];
  if (v == null) return undefined;
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (typeof v === 'object' && v && '#text' in (v as object)) {
    return String((v as { '#text'?: unknown })['#text'] ?? '');
  }
  return undefined;
}

function nonEmptyObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length > 0;
}

/** C-SPAN ajax-player 常把 files/qualities 写成单对象而非数组。 */
export function asRecordList(v: unknown): Record<string, unknown>[] {
  if (v == null) return [];
  if (Array.isArray(v)) {
    return v.flatMap((x) => asRecordList(x));
  }
  if (typeof v !== 'object') return [];
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o);
  if (!keys.length) return [];
  // XML→JSON 包装：{ file: {...} } / { quality: [...] }
  if (
    'file' in o &&
    typeof o.file === 'object' &&
    !('path' in o) &&
    !('qualities' in o) &&
    !('bitrate' in o) &&
    !('height' in o)
  ) {
    return asRecordList(o.file);
  }
  if ('quality' in o && !('file' in o) && !('path' in o) && !('bitrate' in o)) {
    return asRecordList(o.quality);
  }
  if ('path' in o || 'qualities' in o || 'bitrate' in o || 'height' in o || 'length' in o) return [o];
  const vals = Object.values(o).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
  return vals.length ? vals.flatMap((x) => asRecordList(x)) : [];
}

function programIdFromUrl(u: string): string | undefined {
  return /\/program\/(?:[^/?#]+\/)*(\d+)\/?(?:[?#]|$)/i.exec(u)?.[1];
}

function clipIdFromUrl(u: string): string | undefined {
  // /video/?c4486943/… 或 query 里的 clip
  const m = /[?&]c([0-9a-f]+)\b/i.exec(u) || /\/video\/\?c([0-9a-f]+)/i.exec(u);
  return m?.[1];
}

const CSPAN_STREAM_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function streamHeaders(referer: string, m3u8Url?: string): Record<string, string> {
  // iphone CDN 片段常要求同源 Referer；m3u8-N 则用节目页
  const isIphone = /iphone\.c-spanvideo\.org/i.test(m3u8Url || '');
  return {
    Referer: isIphone ? 'https://iphone.c-spanvideo.org/' : referer || 'https://www.c-span.org/',
    Origin: 'https://www.c-span.org',
    'User-Agent': CSPAN_STREAM_UA,
    Accept: '*/*',
  };
}

/**
 * ajax-player 常给已失效的 iphone.* 主清单；页面 JWPlayer 多用 m3u8-0/1。
 * 探测顺序：m3u8-N 优先，iphone / seed 殿后。
 */
export function expandCspanHlsCandidates(
  seed: string | undefined,
  kind: 'program' | 'clip',
  id: string,
): string[] {
  const out: string[] = [];
  const push = (u?: string | null) => {
    const x = url_or_none(u || undefined);
    if (x && !out.includes(x)) out.push(x);
  };
  if (kind === 'clip') {
    push(`https://m3u8-0.c-spanvideo.org/clip/clip.${id}.m3u8`);
    push(`https://m3u8-1.c-spanvideo.org/clip/clip.${id}.m3u8`);
    push(`https://iphone.c-spanvideo.org/m3u8/clip.${id}.m3u8`);
  } else {
    push(`https://m3u8-1.c-spanvideo.org/program/program.${id}.m3u8`);
    push(`https://m3u8-0.c-spanvideo.org/program/program.${id}.m3u8`);
    push(`https://m3u8-1.c-spanvideo.org/program/program.${id}.tsc.m3u8`);
    push(`https://m3u8-0.c-spanvideo.org/program/program.${id}.tsc.m3u8`);
    push(`https://iphone.c-spanvideo.org/m3u8/program.${id}.m3u8`);
  }
  // JW 给出的 m3u8-N 提到最前；iphone seed 保持殿后（已在列表中）
  if (seed && /m3u8-\d\.c-spanvideo\.org/i.test(seed)) {
    const normalized = url_or_none(seed);
    if (normalized) {
      const rest = out.filter((u) => u !== normalized);
      return [normalized, ...rest];
    }
  }
  push(seed);
  return out;
}

export class CSpanIE extends InfoExtractor {
  static IE_NAME = 'CSpan';
  static IE_DESC = 'C-SPAN';
  static _VALID_URL = [
    /https?:\/\/(?:www\.)?c-span\.org\/video\/\?(?<id>[0-9a-f]+)/i,
    /https?:\/\/(?:www\.)?c-span\.org\/program\/(?:[^/?#]+\/)*(?<id>\d+)\/?(?:[?#]|$)/i,
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    let videoId = this._match_id(url);

    // 跟随重定向拿最终 URL（旧 video/? 常跳到 /program/…/315139）
    const resp = await this._request_webpage(url, videoId, 'Downloading webpage');
    if (!resp) throw new ExtractorError('Unable to download C-SPAN webpage', { expected: true });
    const webpage = resp.text;
    const pageUrl = resp.url || url;

    const progFromPage =
      programIdFromUrl(pageUrl) ||
      programIdFromUrl(
        this._html_search_regex(
          /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
          webpage,
          'canonical',
          null,
          false,
        ) || '',
      ) ||
      this._search_regex(
        /(?:data-(?:prog|program)id|["']programId["']\s*[:=]\s*["']?|clipprog\s*=\s*)(\d+)/i,
        webpage,
        'program id',
        null,
        false,
      ) ||
      undefined;
    if (progFromPage) videoId = progFromPage;

    const hdrsFor = (m3u8Url?: string) => streamHeaders(pageUrl, m3u8Url);
    const addReferer = (formats: Format[], m3u8Url?: string) => {
      const h = hdrsFor(m3u8Url);
      for (const f of formats) {
        f.http_headers = { ...h, ...(f.http_headers || {}) };
      }
    };

    /** 整次 extract 内每个 m3u8 只探测一次，避免 JW/ajax/CDN 三段重复刷 403。 */
    const probedHls = new Set<string>();
    const probeHlsUrl = async (m3u8Url: string, id: string, formatId = 'hls'): Promise<Format[]> => {
      if (probedHls.has(m3u8Url)) return [];
      probedHls.add(m3u8Url);
      const headers = hdrsFor(m3u8Url);
      try {
        const probed = await this._extract_m3u8_formats(
          m3u8Url,
          id,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          formatId,
          undefined,
          false,
          { headers },
        );
        if (probed.length) {
          addReferer(probed, m3u8Url);
          return probed;
        }
      } catch {
        /* try next candidate */
      }
      return [];
    };

    const probeHlsCandidates = async (
      seeds: Array<string | undefined>,
      kind: 'program' | 'clip',
      id: string,
    ): Promise<Format[]> => {
      const queue = seeds.some(Boolean)
        ? seeds.flatMap((seed) => expandCspanHlsCandidates(seed, kind, id))
        : expandCspanHlsCandidates(undefined, kind, id);
      for (const cand of queue) {
        const fmts = await probeHlsUrl(cand, id);
        if (fmts.length) return fmts;
      }
      return [];
    };

    const finish = (info: Partial<VideoInfo> & { formats: Format[] }): VideoInfo => ({
      id: info.id || videoId,
      title: info.title || this._og_search_title(webpage) || videoId,
      thumbnail: info.thumbnail || this._og_search_thumbnail(webpage) || undefined,
      description: info.description || this._og_search_description(webpage) || undefined,
      formats: info.formats,
      subtitles: info.subtitles,
      duration: info.duration,
      webpage_url: pageUrl,
      http_headers: hdrsFor(),
    });

    // Brightcove embed（无 &vod）
    if (!/[&?]vod\b/i.test(url) && !/[&?]vod\b/i.test(pageUrl)) {
      const bc = this._search_regex(
        /(<[^>]+id=['"]brightcove-player-embed['"][^>]+>)/i,
        webpage,
        'brightcove embed',
        null,
        false,
      );
      if (bc) {
        const bcAttr = extract_attributes(bc);
        const bcId = bcAttr['data-bcid'];
        if (bcId) {
          const brightcoveUrl =
            `http://players.brightcove.net/${bcAttr['data-bcaccountid'] || '3162030207001'}/` +
            `${bcAttr['data-noprebcplayerid'] || 'SyGGpuJy3g'}_` +
            `${bcAttr['data-newbcplayerid'] || 'default'}/index.html?videoId=${bcId}`;
          return this.url_result(smuggle_url(brightcoveUrl, { source_url: pageUrl }));
        }
      }
    }

    // JWPlayer setup（对齐 Python：空 dict 不算成功）
    const jwsetupRaw = this._search_regex(/jwsetup\s*=\s*({.+?})\s*;/s, webpage, 'jwsetup', null, false);
    const jwsetup = jwsetupRaw
      ? this._parse_json<Record<string, unknown>>(js_to_json(jwsetupRaw), videoId, null, false)
      : null;

    if (nonEmptyObject(jwsetup)) {
      const info = await parseJwplayerData(this, jwsetup, videoId, {
        requireTitle: false,
        m3u8Id: 'hls',
        baseUrl: pageUrl,
      });
      if (info.formats?.length) {
        addReferer(info.formats);
        for (const subs of Object.values(info.subtitles || {})) {
          for (const subtitle of subs) {
            let ext = determine_ext(subtitle.url);
            if (ext === 'php') ext = 'vtt';
            subtitle.ext = ext;
          }
        }
        const ldInfo = this._search_json_ld(webpage, videoId, { fatal: false });
        const title =
          get_element_by_class('video-page-title', webpage) ||
          this._og_search_title(webpage) ||
          undefined;
        const description =
          this._html_search_regex(
            /itemprop=["']description["'][^>]*>([\s\S]*?)<\/[^>]+>/,
            webpage,
            'description',
            null,
            false,
          ) ||
          this._html_search_meta(['og:description', 'description'], webpage) ||
          undefined;
        const uploadDate = this._html_search_regex(
          /itemprop=["']uploadDate["'][^>]*content=["']([^"']+)["']/,
          webpage,
          'upload date',
          null,
          false,
        );
        const location = this._html_search_regex(
          /itemprop=["']contentLocation["'][^>]*content=["']([^"']+)["']/,
          webpage,
          'location',
          null,
          false,
        );
        const thumbnail = this._html_search_regex(
          /itemprop=["']thumbnailUrl["'][^>]*content=["']([^"']+)["']/,
          webpage,
          'thumbnail',
          null,
          false,
        );
        const duration = int_or_none(
          this._search_regex(/jwsetup\.seclength\s*=\s*(\d+);/, webpage, 'duration', null, false),
        );
        const viewCount = str_to_int(
          this._search_regex(
            /<span[^>]+class=['"]views['"][^>]*>([\d,]+)\s+Views<\/span>/,
            webpage,
            'views',
            null,
            false,
          ),
        );

        return {
          ...ldInfo,
          ...info,
          id: videoId,
          title,
          thumbnail: thumbnail ?? undefined,
          description,
          timestamp: (uploadDate ? parseIso8601(uploadDate) : undefined) ?? undefined,
          location,
          duration: duration ?? undefined,
          view_count: viewCount ?? undefined,
          webpage_url: pageUrl,
        } as VideoInfo;
      }
    }

    // 解析 clip/program id（JW / CDN 猜测都要用）
    let videoType: 'clip' | 'program' = 'program';
    let mediaId: string | null = null;

    const clipIdMatch =
      webpage.match(/id=['"]clipid['"]\s*value=['"](\d+)['"]/i) ||
      webpage.match(/data-clipid=["'](\d+)["']/i);
    const progIdMatch =
      webpage.match(/id=['"]clipprog['"]\s*value=['"](\d+)['"]/i) ||
      webpage.match(/data-progid=["'](\d+)["']/i) ||
      webpage.match(/jwsetup\.clipprog\s*=\s*(\d+)/i);

    if (clipIdMatch?.[1]) {
      mediaId = clipIdMatch[1];
      videoType = 'clip';
    } else if (progIdMatch?.[1]) {
      mediaId = progIdMatch[1];
      videoType = 'program';
    } else if (progFromPage) {
      mediaId = progFromPage;
      videoType = 'program';
    } else if (clipIdFromUrl(pageUrl) || clipIdFromUrl(url)) {
      mediaId = clipIdFromUrl(pageUrl) || clipIdFromUrl(url) || null;
      videoType = 'clip';
    } else if (/^\d+$/.test(videoId)) {
      mediaId = videoId;
      videoType = 'program';
    }

    const streamId = mediaId || videoId;

    // 1) 页面 / JW 暴露的真实播放地址（常为 m3u8-0/1；优先于 ajax 的 iphone 死链）
    const pageM3u8Seeds = [
      ...[...webpage.matchAll(/https?:\\?\/\\?\/m3u8-\d\.c-spanvideo\.org\/[^"'\s\\]+/gi)].map((m) =>
        m[0]!.replace(/\\\//g, '/'),
      ),
      ...[...webpage.matchAll(/https?:\/\/(?:m3u8-\d|iphone)\.c-spanvideo\.org\/[^"'\s]+/gi)].map(
        (m) => m[0]!,
      ),
    ];
    const jwMediaId =
      this._search_regex(/"mediaid"\s*:\s*"([A-Za-z0-9_-]+)"/i, webpage, 'jw mediaid', null, false) ||
      this._search_regex(
        /cdn\.jwplayer\.com\/v2\/media\/([A-Za-z0-9_-]+)/i,
        webpage,
        'jwplayer media',
        null,
        false,
      ) ||
      this._search_regex(
        /cdn\.jwplayer\.com\/players\/([A-Za-z0-9_-]+)-[A-Za-z0-9_-]+\.html/i,
        webpage,
        'jwplayer embed',
        null,
        false,
      );

    if (jwMediaId) {
      try {
        const media = await this._download_json<{
          playlist?: Array<{
            title?: string;
            image?: string;
            sources?: Array<{ file?: string; type?: string; height?: number; width?: number; label?: string }>;
            tracks?: Array<{ file?: string; kind?: string; label?: string }>;
            duration?: number;
          }>;
        }>(`https://cdn.jwplayer.com/v2/media/${jwMediaId}`, streamId, 'Downloading JWPlayer media', {
          headers: { Referer: 'https://www.c-span.org/' },
          fatal: false,
        });
        const item = media?.playlist?.[0];
        if (item?.sources?.length) {
          const formats: Format[] = [];
          const hlsSeeds: string[] = [...pageM3u8Seeds];
          for (const src of item.sources) {
            const file = url_or_none(src.file);
            if (!file) continue;
            if (/\.m3u8/i.test(file) || /mpegurl/i.test(String(src.type || ''))) {
              hlsSeeds.push(file);
            } else {
              formats.push({
                format_id: src.label || String(src.height || 'http'),
                url: file,
                height: int_or_none(src.height) ?? undefined,
                width: int_or_none(src.width) ?? undefined,
                ext: determine_ext(file) || 'mp4',
                http_headers: hdrsFor(),
              });
            }
          }
          if (!formats.length) {
            formats.push(...(await probeHlsCandidates(hlsSeeds, videoType, streamId)));
          }
          if (formats.length) {
            const subtitles: Record<string, Subtitle[]> = {};
            for (const tr of item.tracks || []) {
              if (!tr.file || !/captions|subtitles/i.test(String(tr.kind || 'captions'))) continue;
              (subtitles.en ||= []).push({
                url: tr.file,
                ext: determine_ext(tr.file) || 'vtt',
                name: tr.label,
              });
            }
            return finish({
              id: videoType === 'clip' ? `c${streamId}` : streamId,
              title: item.title,
              thumbnail: item.image,
              formats,
              subtitles,
              duration: int_or_none(item.duration) ?? undefined,
            });
          }
        }
      } catch {
        /* fall through */
      }
    }

    if (pageM3u8Seeds.length) {
      const formats = await probeHlsCandidates(pageM3u8Seeds, videoType, streamId);
      if (formats.length) {
        return finish({
          id: videoType === 'clip' ? `c${streamId}` : streamId,
          formats,
        });
      }
    }

    // 2) ajax-player：progressive qualities 优先；HLS path 展开 CDN 候选后探测
    if (mediaId) {
      try {
        const player = await this._download_json<{
          video?: Record<string, unknown>;
        }>(
          `https://www.c-span.org/assets/player/ajax-player.php?os=android&html5=${videoType}&id=${mediaId}`,
          mediaId,
          'Downloading C-SPAN player JSON',
          { headers: { Referer: pageUrl }, fatal: false },
        );
        const data = (player?.video || player) as Record<string, unknown> | undefined;
        const status = String(data?.['@status'] ?? data?.status ?? '');
        if (data && (!status || /success/i.test(status))) {
          let title =
            this._og_search_title(webpage) ||
            get_element_by_class('video-page-title', webpage) ||
            mediaId;
          let thumbnail = this._og_search_thumbnail(webpage) || undefined;
          try {
            const xml = await this._download_xml(
              `https://www.c-span.org/common/services/flashXml.php?${videoType}id=${mediaId}`,
              mediaId,
              'Downloading C-SPAN flashXml',
              { headers: { Referer: pageUrl }, fatal: false },
            );
            if (xml) {
              title = (find_xpath_attr(xml, 'string', 'name', 'title') || title)?.trim() || title;
              thumbnail =
                find_xpath_attr(xml, 'string', 'name', 'poster')?.trim() || thumbnail;
            }
          } catch {
            /* ignore */
          }

          const description = this._html_search_meta('description', webpage) || undefined;
          const files = asRecordList(data.files);
          const capfile = getTextAttr(data, 'capfile') || url_or_none(data.capfile as string);
          const entries: VideoInfo[] = [];

          for (let partnum = 0; partnum < files.length; partnum++) {
            const f = files[partnum]!;
            const formats: Format[] = [];
            for (const q of asRecordList(f.qualities)) {
              const file =
                unescapeHTML(getTextAttr(q, 'file') || '') ||
                url_or_none(q.file as string) ||
                '';
              if (!file) continue;
              formats.push({
                format_id: `${getTextAttr(q, 'bitrate') || ''}-${getTextAttr(q, 'height') || ''}p`,
                url: file,
                height: int_or_none(getTextAttr(q, 'height')) ?? undefined,
                tbr: int_or_none(getTextAttr(q, 'bitrate')) ?? undefined,
                ext: determine_ext(file) || 'mp4',
                http_headers: hdrsFor(),
              });
            }
            if (!formats.length) {
              const path =
                unescapeHTML(getTextAttr(f, 'path') || '') ||
                url_or_none(f.path as string) ||
                '';
              if (path && !(determine_ext(path) === 'm3u8' || /\.m3u8/i.test(path))) {
                formats.push({
                  url: path,
                  ext: determine_ext(path) || 'mp4',
                  http_headers: hdrsFor(),
                });
              } else {
                formats.push(
                  ...(await probeHlsCandidates([path || undefined, ...pageM3u8Seeds], videoType, mediaId)),
                );
              }
            }
            if (!formats.length) continue;
            addReferer(formats);
            entries.push({
              id: `${mediaId}_${partnum + 1}`,
              title: files.length === 1 ? title : `${title} part ${partnum + 1}`,
              formats,
              description,
              thumbnail,
              duration: int_or_none(getTextAttr(f, 'length')) ?? undefined,
              subtitles: capfile
                ? {
                    en: [{ url: capfile, ext: determine_ext(capfile) || 'dfxp' }],
                  }
                : undefined,
              webpage_url: pageUrl,
            });
          }

          if (entries.length === 1) {
            return {
              ...entries[0]!,
              id: videoType === 'clip' ? `c${mediaId}` : mediaId,
            };
          }
          if (entries.length > 1) {
            return this.playlist_result(
              entries,
              videoType === 'clip' ? `c${mediaId}` : mediaId,
              title,
              description,
            );
          }
        }
      } catch (e) {
        this.report_warning(`ajax-player failed: ${(e as Error).message || e}`);
      }
    }

    // 3) 仅按 id 猜 CDN（无 soft 死链）
    if (mediaId || /^\d+$/.test(videoId)) {
      const formats = await probeHlsCandidates(pageM3u8Seeds, videoType, streamId);
      if (formats.length) {
        return finish({
          id: videoType === 'clip' ? `c${streamId}` : streamId,
          formats,
        });
      }
    }

    const errEl = get_element_by_class('VLplayer-error-message', webpage);
    if (errEl) throw new ExtractorError(errEl, { expected: true });
    throw new ExtractorError(
      'C-SPAN stream unavailable (HLS returned 403). The site player may also fail for this program; try a newer /program/ URL or JWPlayer embed.',
      { expected: true },
    );
  }
}

export class CSpanCongressIE extends InfoExtractor {
  static IE_NAME = 'CSpanCongress';
  static _VALID_URL = /https?:\/\/(?:www\.)?c-span\.org\/congress\//;

  async _real_extract(url: string): Promise<VideoInfo> {
    const query = parse_qs(url);
    const videoDate = query.date?.[0];
    const chamber = query.chamber?.[0] || 'senate';
    let videoId = videoDate ? `${chamber}_${videoDate}` : chamber;
    const webpage = await this._download_webpage(url, videoId);
    if (!videoDate) {
      const jwpDate = /jwsetup\.clipprogdate\s*=\s*'(?<date>\d{4}-\d{2}-\d{2})'/.exec(webpage);
      if (jwpDate) videoId = `${videoId}_${jwpDate.groups!.date}`;
    }
    const jwplayerRaw = this._search_regex(/jwsetup\s*=\s*({(?:.|\n)[^;]+});/, webpage, 'player config');
    const jwplayerData = this._parse_json<Record<string, unknown>>(js_to_json(jwplayerRaw!), videoId)!;

    const rawTitle =
      this._html_search_regex(/<title[^>]*>([^<]+)<\/title>/i, webpage, 'title', null, false) ||
      videoId;
    const title = rawTitle.split('|')[0]!.replace(/\s+/g, ' ').trim();
    const description =
      this._og_search_description(webpage) ||
      this._html_search_meta('description', webpage, 'description', false) ||
      undefined;

    const info = await parseJwplayerData(this, jwplayerData, videoId, { requireTitle: false });

    return {
      ...info,
      title,
      description,
      http_headers: { Referer: 'https://www.c-span.org/' },
    };
  }
}
