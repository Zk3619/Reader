/** Rumble* — ported from yt-dlp rumble.py (main paths) */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { clean_html, int_or_none } from '../../utils';
import { parseIso8601, urljoin, extractM3u8FormatsAndSubtitles, mergeSubtitles } from './_helpers';

function getElementByClass(cls: string, html: string): string | null {
  const m = html.match(new RegExp(`<[^>]+class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i'));
  return m ? m[1]! : null;
}

export class RumbleEmbedIE extends InfoExtractor {
  static IE_NAME = 'RumbleEmbed';
  static _VALID_URL = /https?:\/\/(?:www\.)?rumble\.com\/embed\/(?:[0-9a-z]+\.)?(?<id>[0-9a-z]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const jsonLd = this._search_json_ld(webpage, videoId, { fatal: false }) as Record<string, unknown>;

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    for (const m of webpage.matchAll(/"url"\s*:\s*"([^"]+\.m3u8[^"]*)"/g)) {
      const res = await extractM3u8FormatsAndSubtitles(this, m[1]!.replace(/\\\//g, '/'), videoId, 'hls');
      formats.push(...res.formats);
      mergeSubtitles(subtitles, res.subtitles);
    }
    for (const m of webpage.matchAll(/"url"\s*:\s*"([^"]+\.mp4[^"]*)"/g)) {
      formats.push({ url: m[1]!.replace(/\\\//g, '/'), format_id: 'mp4', ext: 'mp4' });
    }

    const channelUrl = this._search_regex(/"channelUrl"\s*:\s*"([^"]+)"/, webpage, 'channel', null, false);
    return {
      id: videoId,
      title: (jsonLd.title as string) || this._og_search_title(webpage) || videoId,
      timestamp: parseIso8601(jsonLd.uploadDate as string) ?? undefined,
      channel_url: channelUrl ?? undefined,
      channel: this._search_regex(/"channelName"\s*:\s*"([^"]+)"/, webpage, 'channel', null, false) ?? undefined,
      thumbnail: (jsonLd.thumbnail as string) || this._og_search_thumbnail(webpage) || undefined,
      duration: int_or_none(jsonLd.duration) ?? undefined,
      uploader: this._search_regex(/"author"\s*:\s*"([^"]+)"/, webpage, 'uploader', null, false) ?? undefined,
      formats,
      subtitles,
    };
  }
}

export class RumbleIE extends InfoExtractor {
  static IE_NAME = 'Rumble';
  static _VALID_URL = /https?:\/\/(?:www\.)?rumble\.com\/(?:v|embed\/[^/]+\/)(?<id>[0-9a-z]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const embedUrl = this._search_regex(/embedUrl["']\s*:\s*["']([^"']+)/, webpage, 'embed', null, false);
    if (embedUrl) return this.url_result(embedUrl, 'RumbleEmbed', videoId);
    return new RumbleEmbedIE()._real_extract(`https://rumble.com/embed/${videoId}`);
  }
}

export class RumbleChannelIE extends InfoExtractor {
  static IE_NAME = 'RumbleChannel';
  static _VALID_URL = /https?:\/\/(?:www\.)?rumble\.com\/c\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelId = this._match_id(url);
    const webpage = await this._download_webpage(url, channelId);
    const entries: VideoInfo[] = [];
    for (const m of webpage.matchAll(/href="(\/[^"]+?-(?:v|video)[^"]+)"/g)) {
      entries.push(this.url_result(urljoin(url, m[1]!), 'Rumble'));
    }
    const title = clean_html(getElementByClass('heading-h1', webpage) || '') || channelId;
    const description = this._og_search_description(webpage) ?? undefined;
    return this.playlist_result(entries, channelId, title, description);
  }
}
