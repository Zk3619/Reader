/**
 * LaracastsBaseIE / LaracastsIE / LaracastsPlaylistIE — ported from yt-dlp laracasts.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import {
  clean_html,
  extract_attributes,
  int_or_none,
  parse_duration,
  str_or_none,
  unified_strdate,
  url_or_none,
} from '../../utils';
import { get_element_html_by_id, urljoin } from './_helpers';

export class LaracastsBaseIE extends InfoExtractor {
  static IE_NAME = 'laracastsbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('LaracastsBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _getPropData(url: string, displayId: string): Promise<Record<string, unknown>> {
    const webpage = await this._download_webpage(url, displayId);
    const appHtml = get_element_html_by_id('app', webpage);
    const attrs = appHtml ? extract_attributes(appHtml) : {};
    const page = this._parse_json<{ props?: Record<string, unknown> }>(attrs['data-page'] || '{}', displayId);
    return page?.props || {};
  }

  protected _parseEpisode(episode: Record<string, unknown>): VideoInfo {
    if (!episode.vimeoId) {
      this.raise_login_required('This video is only available for subscribers.');
    }
    const dateSegments = episode.dateSegments as Record<string, unknown> | undefined;
    const id = str_or_none(episode.id) ?? 'laracasts';
    return {
      _type: 'url_transparent',
      id,
      ie_key: 'Vimeo',
      url: `https://player.vimeo.com/video/${episode.vimeoId}`,
      title: clean_html(str_or_none(episode.title)) || undefined,
      webpage_url: urljoin('https://laracasts.com', String(episode.path || '')),
      season_number: int_or_none(episode.chapter) ?? undefined,
      episode_number: int_or_none(episode.position) ?? undefined,
      description: clean_html(str_or_none(episode.body)) || undefined,
      thumbnail: url_or_none(episode.largeThumbnail) || undefined,
      duration: int_or_none(episode.length) ?? undefined,
      upload_date: unified_strdate(dateSegments?.published) || undefined,
    };
  }
}

export class LaracastsIE extends LaracastsBaseIE {
  static IE_NAME = 'laracasts';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?laracasts\.com\/series\/(?<id>[\w-]+\/episodes\/\d+)\/?(?:[?#]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const props = await this._getPropData(url, displayId);
    return this._parseEpisode((props.lesson as Record<string, unknown>) || {});
  }
}

export class LaracastsPlaylistIE extends LaracastsBaseIE {
  static IE_NAME = 'laracasts:series';
  static _VALID_URL = /https?:\/\/(?:www\.)?laracasts\.com\/series\/(?<id>[\w-]+)\/?(?:[?#]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const props = await this._getPropData(url, displayId);
    const series = (props.series as Record<string, unknown>) || {};

    const metadata: Partial<VideoInfo> = {
      display_id: displayId,
      title: str_or_none(series.title) ?? undefined,
      id: str_or_none(series.id) ?? undefined,
      description: clean_html(str_or_none(series.body)) || undefined,
      thumbnail: url_or_none(series.large_thumbnail || series.thumbnail) || undefined,
      duration: parse_duration(series.runTime) ?? undefined,
      modified_date: unified_strdate(series.lastUpdated) || undefined,
    };

    const entries: VideoInfo[] = [];
    for (const chapter of (series.chapters as Array<Record<string, unknown>>) || []) {
      for (const ep of (chapter.episodes as Array<Record<string, unknown>>) || []) {
        if (ep.vimeoId) entries.push(this._parseEpisode(ep));
      }
    }

    return this.playlist_result(entries, metadata.id || displayId, metadata.title, metadata.description);
  }
}
