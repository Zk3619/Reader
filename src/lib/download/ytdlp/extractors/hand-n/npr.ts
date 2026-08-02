/** NprIE — ported from yt-dlp npr.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, url_or_none } from '../../utils';

const KNOWN_FORMATS = ['threegp', 'm3u8', 'smil', 'mp4', 'mp3'] as const;

export class NprIE extends InfoExtractor {
  static IE_NAME = 'Npr';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?npr\.org\/(?:sections\/[^/]+\/)?\d{4}\/\d{2}\/\d{2}\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const resp = await this._download_json<{ list?: { story?: Array<Record<string, unknown>> } }>(
      'http://api.npr.org/query',
      playlistId,
      undefined,
      {
        query: {
          id: playlistId,
          fields: 'audio,multimedia,title',
          format: 'json',
          apiKey: 'MDAzMzQ2MjAyMDEyMzk4MTU1MDg3ZmM3MQ010',
        },
      },
    );
    const story = resp.list?.story?.[0] || {};
    const playlistTitle = str_or_none((story.title as Record<string, unknown>)?.$text) ?? undefined;

    const entries: VideoInfo[] = [];
    const mediaList = [
      ...((story.audio as Array<Record<string, unknown>>) || []),
      ...((story.multimedia as Array<Record<string, unknown>>) || []),
    ];

    for (const media of mediaList) {
      const mediaId = String(media.id ?? '');
      const formats: Format[] = [];
      const formatObj = (media.format as Record<string, unknown>) || {};
      for (const formatId of KNOWN_FORMATS) {
        let formatsEntry = formatObj[formatId];
        if (!formatsEntry) continue;
        if (Array.isArray(formatsEntry)) formatsEntry = formatsEntry[0];
        const formatUrl = str_or_none((formatsEntry as Record<string, unknown>).$text);
        if (!formatUrl) continue;
        if (formatId === 'm3u8') {
          formats.push(
            ...(await this._extract_m3u8_formats(formatUrl, mediaId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
          );
        } else if (formatId !== 'smil') {
          formats.push({ url: formatUrl, format_id: formatId });
        }
      }

      const streamObj = (media.stream as Record<string, unknown>) || {};
      const hlsUrl = url_or_none((streamObj.hlsUrl as Record<string, unknown>)?.$text);
      if (hlsUrl) {
        formats.push(
          ...(await this._extract_m3u8_formats(hlsUrl, mediaId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
        );
      }

      if (!formats.length) {
        const webpage = await this._download_webpage(url, playlistId, undefined, { fatal: false });
        if (webpage) {
          const ldMatches = [...webpage.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
          for (const lm of ldMatches) {
            try {
              const ld = JSON.parse(lm[1]!);
              const items = Array.isArray(ld) ? ld : [ld];
              for (const item of items) {
                const subjectOf = item.subjectOf as Array<{ embedUrl?: string }> | undefined;
                const embedUrl = subjectOf?.map((s) => s.embedUrl).find(Boolean);
                if (embedUrl) {
                  formats.push(
                    ...(await this._extract_m3u8_formats(embedUrl, mediaId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
                  );
                  break;
                }
              }
            } catch {
              /* ignore */
            }
          }
        }
      }

      entries.push({
        id: mediaId,
        title: str_or_none((media.title as Record<string, unknown>)?.$text) || playlistTitle,
        thumbnail: str_or_none((media.altImageUrl as Record<string, unknown>)?.$text) ?? undefined,
        duration: int_or_none((media.duration as Record<string, unknown>)?.$text) ?? undefined,
        formats,
      });
    }

    return this.playlist_result(entries, playlistId, playlistTitle);
  }
}
