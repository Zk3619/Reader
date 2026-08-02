/**
 * EpiconIE — ported from yt-dlp epicon.py
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';

export class EpiconIE extends InfoExtractor {
  static IE_NAME = 'epicon';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?epicon\.in\/(?:documentaries|movies|tv-shows\/[^/?#]+\/[^/?#]+)\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const cid = this._search_regex(/class="mylist-icon\ iconclick"\ id="(\d+)/, webpage, 'cid')!;

    const dataJson = (await this._download_json<Record<string, unknown>>(
      'https://www.epicon.in/ajaxplayer/',
      videoId,
      undefined,
      {
        headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        data: `cid=${cid}&action=st&type=video`,
        method: 'POST',
      },
    )) as Record<string, unknown>;

    if (!dataJson.success) {
      throw new ExtractorError(String(dataJson.message ?? 'Request failed'), { expected: true });
    }

    const title = this._search_regex(/setplaytitle="([^"]+)/, webpage, 'title')!;
    const urlObj = (dataJson.url as Record<string, string>) || {};
    const formats: Format[] = await this._extract_m3u8_formats(urlObj.video_url, videoId);

    const subtitles: Record<string, Subtitle[]> = {};
    const subList = Array.isArray(dataJson.subtitles) ? dataJson.subtitles : [];
    for (const subtitle of subList) {
      if (!subtitle || typeof subtitle !== 'object') continue;
      const sub = subtitle as Record<string, unknown>;
      const subUrl = sub.file as string | undefined;
      if (!subUrl) continue;
      const lang = String(sub.lang ?? 'English');
      const abs = subUrl.startsWith('//') ? `https:${subUrl}` : subUrl;
      (subtitles[lang] ||= []).push({ url: abs, ext: 'vtt' });
    }

    return {
      id: videoId,
      formats,
      title,
      description: this._og_search_description(webpage) ?? undefined,
      thumbnail: this._og_search_thumbnail(webpage) ?? undefined,
      subtitles,
    };
  }
}

export class EpiconSeriesIE extends InfoExtractor {
  static IE_NAME = 'epicon:series';
  static _VALID_URL = /(?!.*season)https?:\/\/(?:www\.)?epicon\.in\/tv-shows\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const re = new RegExp(`ct-tray-url="(tv-shows/${playlistId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^"]+)`, 'g');
    const episodes = [...webpage.matchAll(re)].map((m) => m[1]!);
    const entries = episodes.map((episode) =>
      this.url_result(`https://www.epicon.in/${episode}`, 'Epicon'),
    );
    return this.playlist_result(entries, playlistId);
  }
}
