/**
 * MuxIE — ported from yt-dlp mux.py
 */

import { InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import { extract_attributes, filter_dict, parse_qs, smuggle_url, unsmuggle_url, update_url_query } from '../../utils';
import { extractM3u8FormatsAndSubtitles } from './_helpers';

export class MuxIE extends InfoExtractor {
  static IE_NAME = 'mux';
  static _VALID_URL = /https?:\/\/(?:stream\.new\/v|player\.mux\.com)\/(?<id>[A-Za-z0-9-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const [cleanUrl, smuggledData] = unsmuggle_url(url, {});
    const videoId = this._match_id(cleanUrl);
    const token = parse_qs(cleanUrl)['playback-token']?.slice(-1)[0];

    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(
      this,
      update_url_query(
        `https://stream.mux.com/${videoId}.m3u8`,
        filter_dict({ token }) as Record<string, string | number | null | undefined | (string | number)[]>,
      ),
      videoId,
      'hls',
    );

    return {
      id: videoId,
      title: (smuggledData.title as string | undefined) || videoId,
      formats,
      subtitles: subtitles as Record<string, Subtitle[]>,
    };
  }

  static _extractEmbedUrls(_url: string, webpage: string): string[] {
    const out: string[] = [];
    for (const m of webpage.matchAll(
      /<iframe\b[^>]+\bsrc=["'](?<url>(?:https?:)?\/\/(?:stream\.new\/v|player\.mux\.com)\/(?<id>[A-Za-z0-9-]+)[^"']+)["']/gi,
    )) {
      if (m.groups?.url) out.push(m.groups.url);
    }
    for (const tag of webpage.matchAll(/<mux-(?:player|video)\b[^>]*\bplayback-id=[^>]+>/gi)) {
      const attrs = extract_attributes(tag[0] || '');
      const playbackId = attrs['playback-id'];
      if (!playbackId) continue;
      const token =
        attrs['playback-token'] ||
        parse_qs(playbackId).token?.slice(-1)[0];
      const id = playbackId.split('?')[0];
      let embedUrl = update_url_query(
        `https://player.mux.com/${id}`,
        filter_dict({ 'playback-token': token }) as Record<
          string,
          string | number | null | undefined | (string | number)[]
        >,
      );
      if (attrs['metadata-video-title']) {
        embedUrl = smuggle_url(embedUrl, { title: attrs['metadata-video-title'] });
      }
      out.push(embedUrl);
    }
    return out;
  }
}
