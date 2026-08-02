/**
 * ListenNotesIE — ported from yt-dlp listennotes.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, extract_attributes, get_element_html_by_id, parse_duration, stripOrNone } from './_helpers';
import { get_element_by_class } from '../../utils';

export class ListenNotesIE extends InfoExtractor {
  static IE_NAME = 'listennotes';
  static _VALID_URL = /https?:\/\/(?:www\.)?listennotes\.com\/podcasts\/[^/]+\/[^/]+-(?<id>.+)\//;

  protected _cleanDescription(description: string | null | undefined): string | null {
    if (!description) return null;
    return clean_html(description.replace(/(<\/?(?:div|p)>\s*)+/g, '<br/><br/>'));
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const audioId = this._match_id(url);
    const webpage = await this._download_webpage(url, audioId);
    const data = this._search_json<Record<string, unknown>>(
      /<script id="original-content"[^>]+\btype="application\/json">/,
      webpage,
      'content',
      audioId,
    )!;

    const toolbarHtml =
      get_element_html_by_id('episode-play-button-toolbar', webpage, false) ||
      get_element_html_by_id('episode-no-play-button-toolbar', webpage, false);
    if (toolbarHtml) Object.assign(data, extract_attributes(toolbarHtml));

    const metaDesc =
      this._html_search_meta(['og:description', 'description', 'twitter:description'], webpage) || '';
    const descMatch = metaDesc.match(/(?<duration>[\d:]+)\s*-\s*(?<description>.+)/);
    const duration = parse_duration(data.audio_length || data['data-duration'] || descMatch?.groups?.duration);
    const description =
      this._cleanDescription(get_element_by_class('ln-text-p', webpage)) ||
      stripOrNone(descMatch?.groups?.description);

    const h1 = webpage.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);

    return {
      id: audioId,
      formats: [{ format_id: 'http', url: String(data.audio) }],
      title:
        String(data['data-title'] || '') ||
        (h1 ? clean_html(h1[1]) : null) ||
        this._html_search_meta(['og:title', 'title', 'twitter:title'], webpage) ||
        audioId,
      description: description || undefined,
      duration: duration ?? undefined,
      episode_id: String(data.uuid || data['data-episode-uuid'] || '') || undefined,
      thumbnail: data['data-image'] ? String(data['data-image']) : undefined,
      channel: data['data-channel-title'] != null ? String(data['data-channel-title']) : undefined,
      channel_url: data.channel_url != null ? String(data.channel_url) : undefined,
      channel_id: data.channel_short_uuid != null ? String(data.channel_short_uuid) : undefined,
    };
  }
}
