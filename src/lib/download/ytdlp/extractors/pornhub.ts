/**
 * PornHubIE / PornHubUserIE / PornHubPlaylistIE — aligned with yt-dlp pornhub.py
 * (flashvars, JS media vars, get_media API, user/playlist delegation).
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';

const VIDEO_VALID_URL =
  /https?:\/\/(?:(?:[a-zA-Z0-9.-]+\.)?(?<host>pornhub(?:premium)?\.(?:com|net|org)|pornhubvybmsymdol4iibwgwtkpwmeyd6luq2gxajgjzfjvotyt5zhyd\.onion)\/(?:(?:view_video\.php|video\/show)\?viewkey=|embed\/)|(?:www\.)?thumbzilla\.com\/video\/)(?<id>[\da-z]+)/i;

const USER_VALID_URL =
  /https?:\/\/(?:[a-zA-Z0-9.-]+\.)?(?<host>pornhub(?:premium)?\.(?:com|net|org)|pornhubvybmsymdol4iibwgwtkpwmeyd6luq2gxajgjzfjvotyt5zhyd\.onion)\/(?:(?:user|channel)s|model|pornstar)\/(?<id>[^/?#&]+)(?:[?#&]|\/(?!videos)|$)/i;

const PLAYLIST_VALID_URL =
  /https?:\/\/(?:[^/]+\.)?(?<host>pornhub(?:premium)?\.(?:com|net|org)|pornhubvybmsymdol4iibwgwtkpwmeyd6luq2gxajgjzfjvotyt5zhyd\.onion)\/playlist\/(?<id>[^/?#&]+)/i;

function phHeaders(host: string): Record<string, string> {
  return {
    Origin: `https://www.${host}`,
    Referer: `https://www.${host}/`,
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };
}

function intOrNone(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function urlOrNone(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  return /^https?:\/\//i.test(v) ? v : null;
}

function extFromUrl(u: string): string {
  const m = /\.(\w+)(?:\?|$)/i.exec(u);
  return m?.[1]?.toLowerCase() || 'mp4';
}

function extractJsVars(webpage: string, prefixPattern: string): Record<string, string> {
  const re = new RegExp(`(var\\s+(?:${prefixPattern})_.+)`, 's');
  const block = webpage.match(re)?.[1];
  if (!block) return {};
  const vars: Record<string, string> = {};
  for (const assn of block.split(';')) {
    const trimmed = assn.replace(/^var\s+/, '').trim();
    if (!trimmed.includes('=')) continue;
    const eq = trimmed.indexOf('=');
    const name = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    value = value.replace(/^['"]|['"]$/g, '');
    if (name) vars[name] = value;
  }
  return vars;
}

function parseQualityItems(raw: string, videoId: string, ie: InfoExtractor): string[] {
  const urls: string[] = [];
  try {
    const items = ie._parse_json<unknown[]>(raw, videoId, null, false);
    if (!Array.isArray(items)) return urls;
    for (const item of items) {
      if (item && typeof item === 'object') {
        const u = urlOrNone((item as Record<string, unknown>).url);
        if (u) urls.push(u);
      }
    }
  } catch {
    /* ignore */
  }
  return urls;
}

abstract class PornHubBaseIE extends InfoExtractor {
  protected hostFromMatch(m: RegExpMatchArray): string {
    return m.groups?.host || 'pornhub.com';
  }
}

export class PornHubIE extends PornHubBaseIE {
  static IE_NAME = 'pornhub';
  static IE_DESC = 'PornHub and Thumbzilla';
  static _VALID_URL = VIDEO_VALID_URL;
  static _NETRC_MACHINE = 'pornhub';
  static _TESTS = [
    { url: 'http://www.pornhub.com/view_video.php?viewkey=648719015', only_matching: true },
    { url: 'https://www.pornhub.com/embed/648719015', only_matching: true },
  ];

  private async downloadVideoPage(host: string, videoId: string, platform: string): Promise<string> {
    const headers = { ...phHeaders(host), Cookie: `platform=${platform}; age_verified=1; accessAgeDisclaimerPH=1` };
    return this._download_webpage(
      `https://www.${host}/view_video.php?viewkey=${videoId}`,
      videoId,
      `Downloading ${platform} webpage`,
      { headers },
    );
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = url.match(VIDEO_VALID_URL);
    if (!m?.groups?.id) throw new ExtractorError('Unable to extract PornHub viewkey', { expected: true });
    const host = this.hostFromMatch(m);
    const videoId = m.groups.id;

    let webpage = await this.downloadVideoPage(host, videoId, 'pc');

    const errorMsg = this._html_search_regex(
      [
        /<div[^>]+class=(["'])(?:(?!\1).)*\b(?:removed|userMessageSection)\b(?:(?!\1).)*\1[^>]*>(?<error>.+?)<\/div>/s,
        /<section[^>]+class=["']noVideo["'][^>]*>(?<error>.+?)<\/section>/s,
      ],
      webpage,
      'error message',
      null,
      false,
      'error',
    );
    if (errorMsg) {
      throw new ExtractorError(`PornHub said: ${errorMsg.replace(/\s+/g, ' ')}`, { expected: true });
    }
    if (/class=["']geoBlocked["']|>\s*This content is unavailable in your country/.test(webpage)) {
      this.raise_geo_restricted('PornHub geo restricted');
    }

    const title =
      this._html_search_meta('twitter:title', webpage, null, false) ||
      this._html_search_regex(
        [
          /<h1[^>]+class=["']title["'][^>]*>(?<title>.+?)<\/h1>/s,
          /<div[^>]+data-video-title=(["'])(?<title>(?:(?!\1).)+)\1/,
          /shareTitle["']\s*[=:]\s*(["'])(?<title>(?:(?!\1).)+)\1/,
        ],
        webpage,
        'title',
        videoId,
        false,
        'title',
      ) ||
      videoId;

    const videoUrls: Array<[string, number | null]> = [];
    const seen = new Set<string>();

    const addUrl = (u: unknown, height: number | null = null) => {
      const s = urlOrNone(u);
      if (!s || seen.has(s)) return;
      seen.add(s);
      videoUrls.push([s, height]);
    };

    const flashvarsRaw = this._search_regex(
      /var\s+flashvars_\d+\s*=\s*({.+?});/,
      webpage,
      'flashvars',
      '{}',
      false,
    );
    const flashvars = this._parse_json<Record<string, unknown>>(flashvarsRaw, videoId, null, false) || {};
    let thumbnail = urlOrNone(flashvars.image_url) || undefined;
    let duration = intOrNone(flashvars.video_duration);
    const mediaDefs = flashvars.mediaDefinitions;
    if (Array.isArray(mediaDefs)) {
      for (const def of mediaDefs) {
        if (!def || typeof def !== 'object') continue;
        addUrl((def as Record<string, unknown>).videoUrl, intOrNone((def as Record<string, unknown>).quality));
      }
    }

    if (!videoUrls.length) {
      const jsVars = extractJsVars(webpage, 'media|quality|qualityItems');
      for (const [key, val] of Object.entries(jsVars)) {
        if (key.startsWith('qualityItems_')) {
          for (const u of parseQualityItems(val, videoId, this)) addUrl(u);
        } else if (key.startsWith('media_') || key.startsWith('quality_')) {
          addUrl(val);
        }
      }
    }

    if (!videoUrls.length && /<[^>]+\bid=["']lockedPlayer/.test(webpage)) {
      throw new ExtractorError(`Video ${videoId} is locked`, { expected: true });
    }

    if (!videoUrls.length) {
      webpage = await this.downloadVideoPage(host, videoId, 'tv');
      const tvVars = extractJsVars(webpage, '.+?mediastring.+?');
      if (tvVars.mediastring) addUrl(tvVars.mediastring);
    }

    for (const m2 of webpage.matchAll(
      /<a[^>]+\bclass=["']downloadBtn\b[^>]+\bhref=(["'])(?<url>(?:(?!\1).)+)\1/gi,
    )) {
      addUrl(m2.groups?.url);
    }

    const headers = phHeaders(host);
    const formats: Format[] = [];
    let uploadDate: string | undefined;

    const addFormat = async (formatUrl: string, height: number | null) => {
      const ext = extFromUrl(formatUrl);
      if (ext === 'mpd') {
        formats.push(...(await this._extract_mpd_formats(formatUrl, videoId, 'dash', undefined, false, { headers })));
        return;
      }
      if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(
            formatUrl,
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            'hls',
            undefined,
            false,
            { headers },
          )),
        );
        return;
      }
      if (!uploadDate) {
        const ud = /\/(\d{6}\/\d{2})\//.exec(formatUrl)?.[1];
        if (ud) uploadDate = ud.replace('/', '');
      }
      if (!height) {
        height = intOrNone(/(?<height>\d+)[pP]?_\d+[kK]/.exec(formatUrl)?.groups?.height);
      }
      formats.push({
        url: formatUrl,
        format_id: height ? `${height}p` : `http-${formats.length}`,
        height,
        ext: ext === 'mp4' ? 'mp4' : ext,
        protocol: 'https',
        http_headers: headers,
      });
    };

    for (const [videoUrl, height] of videoUrls) {
      if (videoUrl.includes('/video/get_media')) {
        const medias = await this._download_json<unknown[]>(videoUrl, videoId, 'Downloading get_media', {
          headers,
          fatal: false,
        });
        if (Array.isArray(medias)) {
          for (const media of medias) {
            if (!media || typeof media !== 'object') continue;
            const u = urlOrNone((media as Record<string, unknown>).videoUrl);
            if (u) await addFormat(u, intOrNone((media as Record<string, unknown>).quality));
          }
        }
        continue;
      }
      await addFormat(videoUrl, height);
    }

    if (!formats.length) throw new ExtractorError('No PornHub formats found', { expected: true });

    const modelProfile =
      this._search_json<Record<string, unknown>>(/var\s+MODEL_PROFILE\s*=/, webpage, 'model profile', videoId, {
        fatal: false,
        default: {},
      }) || {};
    const uploader =
      this._html_search_regex(
        /From:&nbsp;.+?<(?:a\b[^>]+\bhref=["']\/(?:(?:user|channel)s|model|pornstar)\/|span\b[^>]+\bclass=["']username)[^>]+>(.+?)</s,
        webpage,
        'uploader',
        null,
        false,
      ) || String(modelProfile.username || '') || undefined;

    return {
      id: videoId,
      title: title || videoId,
      uploader,
      uploader_id: String(modelProfile.modelProfileLink || '').replace(/^\/model\//, '') || undefined,
      upload_date: uploadDate,
      thumbnail,
      duration,
      formats: this._sort_formats(formats),
      age_limit: 18,
      webpage_url: `https://www.${host}/view_video.php?viewkey=${videoId}`,
      original_url: url,
      extractor: 'pornhub',
      extractor_key: 'PornHub',
      http_headers: headers,
    };
  }
}

export class PornHubUserIE extends PornHubBaseIE {
  static IE_NAME = 'pornhubuser';
  static IE_DESC = 'PornHub user/model/pornstar';
  static _VALID_URL = USER_VALID_URL;
  static _NETRC_MACHINE = 'pornhub';

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = url.match(USER_VALID_URL);
    if (!m?.groups?.id) throw new ExtractorError('Unable to extract PornHub user id', { expected: true });
    const userId = m.groups.id;
    const base = m[0].replace(/[?#&].*$/, '').replace(/\/$/, '');
    const pageMatch = /[?&]page=(\d+)/.exec(url);
    const videosUrl = pageMatch ? `${base}/videos?page=${pageMatch[1]}` : `${base}/videos`;
    return this.url_result(videosUrl, 'PornHubPagedVideoList', userId);
  }
}

export class PornHubPlaylistIE extends PornHubBaseIE {
  static IE_NAME = 'pornhubplaylist';
  static IE_DESC = 'PornHub playlists';
  static _VALID_URL = PLAYLIST_VALID_URL;
  static _NETRC_MACHINE = 'pornhub';

  private extractEntries(webpage: string, host: string): VideoInfo[] {
    const container =
      this._search_regex(/(<div[^>]+class=["']container.+)/s, webpage, 'container', webpage, false) || webpage;
    const entries: VideoInfo[] = [];
    const seen = new Set<string>();
    for (const m of container.matchAll(
      /href="?\/?(view_video\.php\?[^"]*\bviewkey=[\da-z]+[^"]*)"[^>]*\s+title="([^"]+)"/gi,
    )) {
      const viewkey = /viewkey=([\da-z]+)/i.exec(m[1]!)?.[1];
      if (!viewkey || seen.has(viewkey)) continue;
      seen.add(viewkey);
      entries.push(
        this.url_result(`https://www.${host}/${m[1]!.replace(/^\/?/, '')}`, 'PornHub', viewkey, m[2]),
      );
    }
    return entries;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = url.match(PLAYLIST_VALID_URL);
    if (!m?.groups?.id) throw new ExtractorError('Unable to extract PornHub playlist id', { expected: true });
    const host = this.hostFromMatch(m);
    const playlistId = m.groups.id;
    const headers = {
      ...phHeaders(host),
      Cookie: 'age_verified=1; accessAgeDisclaimerPH=1',
    };

    const webpage = await this._download_webpage(
      `https://www.${host}/playlist/${playlistId}`,
      playlistId,
      'Downloading playlist page 1',
      { headers },
    );

    const playlistIdJs =
      this._search_regex(/var\s+playlistId\s*=\s*"([^"]+)"/, webpage, 'playlist_id', playlistId, false) ||
      playlistId;
    const videoCount = intOrNone(
      this._search_regex(/var\s+itemsCount\s*=\s*([0-9]+)\s*\|\|/, webpage, 'video_count', null, false),
    );
    const token = this._search_regex(/var\s+token\s*=\s*"([^"]+)"/, webpage, 'token', '', false);

    const entries = this.extractEntries(webpage, host);

    if (token && videoCount && videoCount > 36) {
      const pageCount = Math.ceil((videoCount - 36) / 40) + 1;
      for (let page = 2; page <= pageCount; page++) {
        const chunk = await this._download_webpage(
          `https://www.${host}/playlist/viewChunked`,
          playlistId,
          `Downloading playlist page ${page}`,
          {
            headers,
            query: { id: playlistIdJs, page: String(page), token },
          },
        );
        const chunkEntries = this.extractEntries(chunk, host);
        if (!chunkEntries.length) break;
        entries.push(...chunkEntries);
      }
    }

    if (!entries.length) throw new ExtractorError('Empty PornHub playlist', { expected: true });
    return this.playlist_result(entries, playlistId);
  }
}
