// @ts-nocheck
/** ZypeIE â€?ported from yt-dlp zype.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { dict_get, int_or_none, js_to_json, parse_iso8601 } from '../../utils';

export class ZypeIE extends InfoExtractor {
  static IE_NAME = 'zype';
  static _ID_RE = '[\\da-fA-F]+';
  static _COMMON_RE =
    '//player\\.zype\\.com/embed/%s\\.(?:js|json|html)\\?.*?(?:access_token|(?:ap[ip]|player)_key)=';
  static _VALID_URL = new RegExp(
    `https?:${ZypeIE._COMMON_RE.replace('%s', `(?<id>${ZypeIE._ID_RE})`)}[^&]+`,
  );
  static _EMBED_REGEX = [
    new RegExp(
      `<script[^>]+\\bsrc=(["'])(?<url>(?:https?:)?${ZypeIE._COMMON_RE.replace('%s', ZypeIE._ID_RE)}.+?)\\1`,
    ),
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    let response: Record<string, any>;

    try {
      response = (
        await this._download_json<{ response?: Record<string, any> }>(
          url.replace(/\.(?:js|html)\?/, '.json?'),
          videoId,
        )
      ).response || {};
    } catch (e) {
      const msg = e instanceof ExtractorError ? e.message : String(e);
      if (/HTTP (?:400|401|403)/i.test(msg)) {
        throw new ExtractorError('Access denied by Zype API', { expected: true, cause: e });
      }
      throw e;
    }

    const body = response.body;
    const video = (response.video || {}) as Record<string, any>;
    const subtitles: Record<string, Subtitle[]> = {};
    const formats: Format[] = [];
    let textTracks: unknown = null;

    if (body && typeof body === 'object' && !Array.isArray(body)) {
      for (const output of (body.outputs || []) as Array<Record<string, any>>) {
        const outputUrl = output.url;
        if (!outputUrl) continue;
        const name = output.name;
        if (name === 'm3u8') {
          formats.push(
            ...(await this._extract_m3u8_formats(
              String(outputUrl),
              videoId,
              'mp4',
              'm3u8_native',
              undefined,
              undefined,
              'hls',
              undefined,
              false,
            )),
          );
        } else {
          const f: Format = {
            format_id: name || undefined,
            tbr: int_or_none(output.bitrate) ?? undefined,
            url: String(outputUrl),
          };
          if (name === 'm4a' || name === 'mp3') {
            f.vcodec = 'none';
          } else {
            f.height = int_or_none(output.height) ?? undefined;
            f.width = int_or_none(output.width) ?? undefined;
          }
          formats.push(f);
        }
      }
      textTracks = body.subtitles || [];
    } else if (typeof body === 'string') {
      let m3u8Url = this._search_regex(
        /(["'])(?<url>(?:(?!\1).)+\.m3u8(?:(?!\1).)*)\1/,
        body,
        'm3u8 url',
        null,
        false,
        'url',
      );
      if (!m3u8Url) {
        const source = this._search_regex(/sources\s*:\s*\[\s*({.+?})\s*\]/s, body, 'source', null, false);
        if (source) {
          const getAttr = (key: string): string | null =>
            this._search_regex(
              new RegExp(`\\b${key}\\s*:\\s*([\\'\\"])(?<val>(?:(?!\\1).)+)\\1`),
              source,
              key,
              null,
              false,
              'val',
            );
          if (getAttr('integration') === 'verizon-media') {
            const vId = getAttr('id');
            if (vId) m3u8Url = `https://content.uplynk.com/${vId}.m3u8`;
          }
        }
      }
      if (m3u8Url) {
        formats.push(
          ...(await this._extract_m3u8_formats(
            m3u8Url,
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            'hls',
          )),
        );
      }
      const tracksRaw = this._search_regex(
        /textTracks\s*:\s*(\[[^\]]+\])/,
        body,
        'text tracks',
        null,
        false,
      );
      if (tracksRaw) textTracks = this._parse_json(tracksRaw, videoId, js_to_json, false);
    }

    for (const textTrack of (Array.isArray(textTracks) ? textTracks : []) as Array<Record<string, any>>) {
      const ttUrl = dict_get(textTrack, ['file', 'src']);
      if (!ttUrl) continue;
      const lang = String(textTrack.label || 'English');
      subtitles[lang] ||= [];
      subtitles[lang]!.push({ url: String(ttUrl) });
    }

    const thumbnails = (video.thumbnails || [])
      .map((thumbnail: Record<string, any>) => {
        if (!thumbnail.url) return null;
        return {
          url: String(thumbnail.url),
          width: int_or_none(thumbnail.width) ?? undefined,
          height: int_or_none(thumbnail.height) ?? undefined,
        };
      })
      .filter(Boolean);

    return {
      id: videoId,
      display_id: video.friendly_title || undefined,
      title: String(video.title || videoId),
      thumbnails: thumbnails as VideoInfo['thumbnails'],
      description: (dict_get(video, ['description', 'ott_description', 'short_description']) as string) || undefined,
      timestamp: parse_iso8601(video.published_at) ?? undefined,
      duration: int_or_none(video.duration) ?? undefined,
      view_count: int_or_none(video.request_count) ?? undefined,
      average_rating: int_or_none(video.rating) ?? undefined,
      season_number: int_or_none(video.season) ?? undefined,
      episode_number: int_or_none(video.episode) ?? undefined,
      formats,
      subtitles,
    };
  }
}
