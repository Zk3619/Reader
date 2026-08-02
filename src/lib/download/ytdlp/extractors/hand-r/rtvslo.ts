/** RTVSLO* — ported from yt-dlp rtvslo.py (main paths) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Thumbnail, Subtitle, VideoInfo } from '../../types';
import { int_or_none, parse_duration, traverse_obj, unified_timestamp, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, htmlExtractTitle, urljoin } from './_helpers';

async function extractWowzaFormats(
  ie: InfoExtractor,
  rawUrl: string,
  videoId: string,
  skipProtocols: string[] = [],
): Promise<Format[]> {
  const url = rawUrl.replace(/^rmtp/, 'rtmp').replace(/"\s*\+\s*"/g, '');
  if (/^rtmp/i.test(url)) {
    const m = url.match(/^(?<url>rtmp[s]?:\/\/[^/]+\/(?<app>[^/]+))\/(?<playpath>.+)$/i);
    if (m?.groups) {
      return [{ url, format_id: 'rtmp', protocol: 'rtmp', app: m.groups.app, play_path: m.groups.playpath }];
    }
    return [{ url, format_id: 'rtmp', protocol: 'rtmp' }];
  }
  const base = url.replace(/\/(?:manifest|playlist|jwplayer)\.(?:m3u8|f4m|mpd|smil)/, '');
  const httpBase = base.replace(/^rtmp(s)?:/, 'http$1:');
  if (skipProtocols.includes('smil') && /\.smil/i.test(httpBase)) return [];
  return (await extractM3u8FormatsAndSubtitles(ie, `${httpBase}/playlist.m3u8`, videoId, 'hls')).formats;
}

export class RTVSLOIE extends InfoExtractor {
  static IE_NAME = 'rtvslo.si';
  static _VALID_URL =
    /https?:\/\/(?:(?:365|4d)\.rtvslo\.si\/arhiv\/[^/?#&;]+|(?:www\.)?rtvslo\.si\/rtv365\/arhiv)\/(?<id>\d+)/;
  static _GEO_COUNTRIES = ['SI'];
  static apiUrl(action: string, id: string) {
    return `https://api.rtvslo.si/ava/${action}/${id}?client_id=82013fb3a531d5414f478747c1aca622`;
  }
  static SUB_LANGS_MAP: Record<string, string> = { Slovenski: 'sl' };

  async _real_extract(url: string): Promise<VideoInfo> {
    const vId = this._match_id(url);
    const metaResp = await this._download_json<{ response?: Record<string, unknown> }>(
      RTVSLOIE.apiUrl('getRecordingDrm', vId),
      vId,
    );
    const meta = metaResp.response || {};

    const thumbs: Thumbnail[] = Object.entries((meta.images as Record<string, string>) || {}).map(([k, v]) => ({
      id: k,
      url: v,
      http_headers: { Accept: 'image/jpeg' },
    }));

    const subs: Record<string, Subtitle[]> = {};
    for (const s of (traverse_obj(meta, ['subs']) as Array<Record<string, unknown>>) ||
      (traverse_obj(meta, ['subtitles']) as Array<Record<string, unknown>>) ||
      []) {
      const lang = RTVSLOIE.SUB_LANGS_MAP[String(s.language || '')] || String(s.language || 'und');
      const subUrl = s.file as string | undefined;
      if (!subUrl) continue;
      (subs[lang] ||= []).push({
        url: subUrl,
        ext: String(s.format || 'vtt').toLowerCase(),
      });
    }

    const jwt = meta.jwt as string | undefined;
    if (!jwt) throw new ExtractorError('Site did not provide an authentication token, cannot proceed.');

    const mediaResp = await this._download_json<{ response?: Record<string, unknown> }>(
      RTVSLOIE.apiUrl('getMedia', vId),
      vId,
      undefined,
      { query: { jwt } },
    );
    const media = mediaResp.response || {};

    const formats: Format[] = [];
    const skipProtocols = ['smil', 'f4m', 'dash'];
    const adaptiveUrl = url_or_none(traverse_obj(media, ['addaptiveMedia', 'hls_sec']) as string);
    if (adaptiveUrl) {
      formats.push(...(await extractWowzaFormats(this, adaptiveUrl, vId, skipProtocols)));
    }

    const adaptiveSl = url_or_none(traverse_obj(media, ['addaptiveMedia_sl', 'hls_sec']) as string);
    if (adaptiveSl) {
      for (const f of await extractWowzaFormats(this, adaptiveSl, vId, skipProtocols)) {
        formats.push({
          ...f,
          format_id: `sign-${f.format_id}`,
          format_note: 'Sign language interpretation',
          preference: -10,
        });
      }
    }

    for (const mediafile of (media.mediaFiles as Array<Record<string, unknown>>) || []) {
      const streams = (mediafile.streams as Record<string, unknown>) || {};
      const httpsUrl = url_or_none(streams.https);
      if (httpsUrl) {
        formats.push({
          url: httpsUrl,
          format_id: String(mediafile.mediaType || 'https').toLowerCase(),
          width: int_or_none(mediafile.width) ?? undefined,
          height: int_or_none(mediafile.height) ?? undefined,
          tbr: int_or_none(mediafile.bitrate) ?? undefined,
          filesize: int_or_none(mediafile.filesize) ?? undefined,
        });
      }
      const hlsSec = url_or_none(streams.hls_sec);
      if (hlsSec) {
        formats.push(...(await extractWowzaFormats(this, hlsSec, vId, skipProtocols)));
      }
    }

    if (formats.some((x) => x.url?.includes('intermission.mp4'))) {
      this.raise_geo_restricted(undefined, RTVSLOIE._GEO_COUNTRIES);
    }

    const domain = traverse_obj(meta, ['canonical', 'domain']) as string | undefined;
    const path = traverse_obj(meta, ['canonical', 'path']) as string | undefined;

    return {
      id: vId,
      webpage_url: domain && path ? `${domain}${path}` : undefined,
      title: meta.title as string | undefined,
      formats,
      subtitles: subs,
      thumbnails: thumbs,
      description: meta.description as string | undefined,
      timestamp: unified_timestamp(
        (meta.broadcastDate as string) || (traverse_obj(meta, ['broadcastDates', 0]) as string),
      ) ?? undefined,
      release_timestamp: unified_timestamp(meta.recordingDate as string) ?? undefined,
      duration: (meta.duration as number) || parse_duration(meta.length as string) || undefined,
      tags: meta.genre as string[] | undefined,
      series: meta.showName as string | undefined,
      series_id: meta.showId as string | undefined,
    };
  }
}

export class RTVSLOShowIE extends InfoExtractor {
  static IE_NAME = 'rtvslo.si:show';
  static _VALID_URL = /https?:\/\/(?:365|4d)\.rtvslo\.si\/oddaja\/[^/?#&]+\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const entries = [...webpage.matchAll(/<a [^>]*\bhref="(\/arhiv\/[^"]+)"/g)].map((m) =>
      this.url_result(urljoin('https://365.rtvslo.si', m[1]!), 'RTVSLO'),
    );
    return this.playlist_result(
      entries,
      playlistId,
      htmlExtractTitle(webpage) ?? undefined,
      this._og_search_description(webpage) ?? undefined,
    );
  }
}
