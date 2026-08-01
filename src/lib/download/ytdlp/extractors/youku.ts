/**
 * YoukuIE / YoukuShowIE — aligned with yt-dlp youku.py
 */

import { InfoExtractor, ExtractorError } from '../common';
import type { Format, VideoInfo } from '../types';
import { js_to_json, str_or_none } from '../utils';

const YOUKU_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function stripJsonp(text: string): string {
  const m = text.match(/^[^(]+\(([\s\S]*)\)\s*;?\s*$/);
  return m?.[1]?.trim() || text.trim();
}

function getElementByClass(html: string, className: string): string | null {
  const re = new RegExp(
    `<([a-z]+)[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/\\1>`,
    'i',
  );
  const m = html.match(re);
  return m?.[2] ?? null;
}

function protoRelative(url: string, scheme = 'https:'): string {
  if (url.startsWith('//')) return `${scheme}${url}`;
  return url;
}

function getYsuid(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let suffix = '';
  for (let i = 0; i < 3; i++) suffix += letters[Math.floor(Math.random() * letters.length)];
  return `${Math.floor(Date.now() / 1000)}${suffix}`;
}

const FORMAT_NAME_MAP: Record<string, string> = {
  '3gp': 'h6',
  '3gphd': 'h5',
  flv: 'h4',
  flvhd: 'h4',
  mp4: 'h3',
  mp4hd: 'h3',
  mp4hd2: 'h4',
  mp4hd3: 'h4',
  hd2: 'h2',
  hd3: 'h1',
};

export class YoukuIE extends InfoExtractor {
  static IE_NAME = 'youku';
  static IE_DESC = '优酷';
  static _VALID_URL =
    /(?:https?:\/\/(?:(?:v|play(?:er)?)\.(?:youku|tudou)\.com\/(?:v_show\/id_|player\.php\/sid\/)|video\.tudou\.com\/v\/)|youku:)(?<id>[A-Za-z0-9]+)(?:\.html|\/v\.swf|)/i;

  private formatName(streamType?: string | null): string | undefined {
    if (!streamType) return undefined;
    return FORMAT_NAME_MAP[streamType] || streamType;
  }

  private async fetchCna(videoId: string): Promise<string> {
    try {
      const http = await import('@/lib/http');
      const res = await http.request('https://log.mmstat.com/eg.js', {
        method: 'GET',
        headers: { 'User-Agent': YOUKU_UA },
        useBackendHttp: true,
        ignorePageNavigationAbort: true,
      });
      const rawHeaders = res.headers as Headers | Record<string, string>;
      const etag =
        (typeof (rawHeaders as Headers).get === 'function'
          ? (rawHeaders as Headers).get('etag') || (rawHeaders as Headers).get('ETag')
          : (rawHeaders as Record<string, string>).etag ||
            (rawHeaders as Record<string, string>).ETag) || '';
      if (etag.length >= 2) return etag.slice(1, -1);
    } catch {
      /* fallback below */
    }
    this.report_warning(`${videoId}: unable to read Youku cna etag, using synthetic utid`);
    return getYsuid();
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const cna = await this.fetchCna(videoId);

    const headers = {
      Referer: url,
      'User-Agent': YOUKU_UA,
      ...this.geo_verification_headers(),
    };

    const query: Record<string, string> = {
      vid: videoId,
      ccode: '0564',
      client_ip: '192.168.1.1',
      utid: cna,
      client_ts: String(Date.now() / 1000),
    };
    const videoPassword = this.params.videopassword as string | undefined;
    if (videoPassword) query.password = videoPassword;

    const json = await this._download_json<{ data?: Record<string, unknown> }>(
      'https://ups.youku.com/ups/get.json',
      videoId,
      'Downloading Youku JSON metadata',
      { query, headers },
    );
    const data = json.data;
    if (!data) throw new ExtractorError('Empty Youku API response', { expected: true });

    const error = data.error as Record<string, unknown> | undefined;
    if (error) {
      const note = String(error.note || '');
      if (note.includes('因版权原因无法观看此视频')) {
        this.raise_geo_restricted('Sorry, this video is available in China only');
      }
      if (note.includes('该视频被设为私密')) {
        throw new ExtractorError('Youku said: Sorry, this video is private', { expected: true });
      }
      throw new ExtractorError(
        `Youku server reported error ${String(error.code || '')}${note ? `: ${note}` : ''}`,
        { expected: true },
      );
    }

    const videoData = data.video as Record<string, unknown>;
    const streams = ((data.stream as Record<string, unknown>[]) || []).filter(
      (s) => s.channel_type !== 'tail',
    );

    const formats: Format[] = streams
      .filter((s) => s.m3u8_url)
      .map((stream) => ({
        url: String(stream.m3u8_url),
        format_id: this.formatName(String(stream.stream_type || '')) || String(stream.stream_type || '0'),
        ext: 'mp4',
        protocol: 'm3u8_native' as const,
        filesize: intOrNone(stream.size),
        width: intOrNone(stream.width),
        height: intOrNone(stream.height),
        http_headers: headers,
      }));

    if (!formats.length) {
      throw new ExtractorError('No Youku formats found', { expected: true });
    }

    const uploader = data.uploader as Record<string, unknown> | undefined;
    return {
      id: videoId,
      title: String(videoData.title || videoId),
      formats,
      duration: Number(videoData.seconds) || null,
      thumbnail: str_or_none(videoData.logo) || undefined,
      uploader: str_or_none(videoData.username) || undefined,
      uploader_id: str_or_none(videoData.userid) || undefined,
      uploader_url: str_or_none(uploader?.homepage) || undefined,
      tags: (videoData.tags as string[]) || undefined,
      webpage_url: url,
      original_url: url,
      extractor: 'youku',
      extractor_key: 'Youku',
      http_headers: headers,
    };
  }
}

export class YoukuShowIE extends InfoExtractor {
  static IE_NAME = 'youku:show';
  static IE_DESC = 'Youku show playlist';
  static _VALID_URL = /https?:\/\/list\.youku\.com\/show\/id_(?<id>[0-9a-z]+)\.html/i;

  private async extractEntries(
    playlistDataUrl: string,
    showId: string,
    note: string,
    query: Record<string, string>,
  ): Promise<[string | null, VideoInfo[] | null]> {
    query.callback = 'cb';
    const text = await this._download_webpage(playlistDataUrl, showId, note, {
      query,
      headers: { 'User-Agent': YOUKU_UA },
    });
    const parsed = this._parse_json(stripJsonp(text), showId, js_to_json, false) as {
      html?: string;
    } | null;
    const playlistData = parsed?.html;
    if (!playlistData) return [null, null];

    const dramaList =
      getElementByClass(playlistData, 'p-drama-grid') ||
      getElementByClass(playlistData, 'p-drama-half-row');
    if (!dramaList) throw new ExtractorError('No Youku episodes found', { expected: true });

    const videoUrls = [...dramaList.matchAll(/<a[^>]+href="([^"]+)"/gi)].map((m) => m[1]!);
    const entries = videoUrls.map((videoUrl) =>
      this.url_result(protoRelative(videoUrl, 'http:'), 'Youku'),
    );
    return [playlistData, entries];
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const showId = this._match_id(url);
    const webpage = await this._download_webpage(url, showId, 'Downloading Youku show webpage', {
      headers: { 'User-Agent': YOUKU_UA },
    });

    const pageConfigRaw = this._search_regex(
      /var\s+PageConfig\s*=\s*({.+});/,
      webpage,
      'page config',
    );
    const pageConfig = this._parse_json(pageConfigRaw!, showId, js_to_json) as {
      showid?: string;
    };
    if (!pageConfig.showid) {
      throw new ExtractorError('Unable to extract Youku show id', { expected: true });
    }

    const entries: VideoInfo[] = [];
    const [firstPage, initialEntries] = await this.extractEntries(
      'http://list.youku.com/show/module',
      showId,
      'Downloading initial playlist data page',
      { id: pageConfig.showid, tab: 'showInfo' },
    );
    if (initialEntries) entries.push(...initialEntries);

    const firstPageReloadId = firstPage
      ? this._html_search_regex(/<div[^>]+id="(reload_\d+)"/, firstPage, 'first page reload id')
      : null;
    const reloadIds = firstPage
      ? [...firstPage.matchAll(/<li[^>]+data-id="([^"]+)"/gi)].map((m) => m[1]!)
      : [];

    for (const [idx, reloadId] of reloadIds.entries()) {
      if (reloadId === firstPageReloadId) continue;
      const [, newEntries] = await this.extractEntries(
        'http://list.youku.com/show/episode',
        showId,
        `Downloading playlist data page ${idx + 1}`,
        { id: pageConfig.showid, stage: reloadId },
      );
      if (newEntries) entries.push(...newEntries);
    }

    const desc = this._html_search_meta('description', webpage, undefined, false);
    const playlistTitle = desc ? desc.split(',')[0] : null;
    const detailLi = getElementByClass(webpage, 'p-intro');
    const playlistDescription = detailLi
      ? getElementByClass(detailLi, 'intro-more')?.replace(/<[^>]+>/g, '').trim() || null
      : null;

    return this.playlist_result(entries, showId, playlistTitle, playlistDescription);
  }
}

function intOrNone(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
