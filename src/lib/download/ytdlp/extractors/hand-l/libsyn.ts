/**
 * LibsynIE — ported from yt-dlp libsyn.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { clean_html, parse_duration, stripOrNone } from './_helpers';
import { get_element_by_class, unified_strdate } from '../../utils';

export class LibsynIE extends InfoExtractor {
  static IE_NAME = 'libsyn';
  static _VALID_URL =
    /(?<mainurl>https?:\/\/html5-player\.libsyn\.com\/embed\/episode\/id\/(?<id>[0-9]+))/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const embedUrl = m.groups?.mainurl || url;
    const videoId = m.groups?.id || this._match_id(url);
    const webpage = await this._download_webpage(embedUrl, videoId);

    const data = this._parse_json<{ [k: string]: unknown }>(
      this._search_regex(/var\s+playlistItem\s*=\s*({.+?});/, webpage, 'JSON data block')!,
      videoId,
    )!;

    let episodeTitle = String(data.item_title || get_element_by_class('episode-title', webpage) || '');
    if (!episodeTitle) {
      episodeTitle =
        this._search_regex([/data-title="([^"]+)"/, /<title>(.+?)<\/title>/], webpage, 'episode title') || videoId;
    }
    episodeTitle = episodeTitle.trim();

    const podcastTitle = stripOrNone(
      clean_html(
        this._search_regex(/<h3>([^<]+)<\/h3>/, webpage, 'podcast title', null, false) ||
          get_element_by_class('podcast-title', webpage),
      ),
    );

    const title = podcastTitle ? `${podcastTitle} - ${episodeTitle}` : episodeTitle;

    const formats: Format[] = [];
    for (const [k, formatId] of [
      ['media_url_libsyn', 'libsyn'],
      ['media_url', 'main'],
      ['download_link', 'download'],
    ] as const) {
      const fUrl = data[k];
      if (fUrl) formats.push({ url: String(fUrl), format_id: formatId });
    }

    let description = this._html_search_regex(/<p\s+id="info_text_body">(.+?)<\/p>/, webpage, 'description', null, false);
    if (description) description = description.replace(/\u00A0/g, ' ').trim();

    const releaseDate =
      unified_strdate(
        this._search_regex(/<div class="release_date">Released: ([^<]+)</, webpage, 'release date', null, false) ||
          String(data.release_date || ''),
      ) || undefined;

    const thumb = data.thumbnail_url ? String(data.thumbnail_url) : undefined;

    return {
      id: videoId,
      title,
      description: description || undefined,
      thumbnail: thumb,
      upload_date: releaseDate,
      duration: parse_duration(data.duration) ?? undefined,
      formats,
    };
  }
}
