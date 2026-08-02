/** NoicePodcastIE — ported from yt-dlp noice.py */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { clean_html, determine_ext, int_or_none, str_or_none, traverse_obj } from '../../utils';
import { parseIso8601, searchNextjsData } from './_helpers';

export class NoicePodcastIE extends InfoExtractor {
  static IE_NAME = 'NoicePodcast';
  static _VALID_URL = /https?:\/\/open\.noice\.id\/content\/(?<id>[a-fA-F0-9-]+)/;

  protected async _getFormatsAndSubtitles(
    mediaUrl: string | string[],
    videoId: string,
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    for (const url of Array.isArray(mediaUrl) ? mediaUrl : [mediaUrl]) {
      if (!url) continue;
      const ext = determine_ext(url);
      if (ext === 'm3u8') {
        const fmts = await this._extract_m3u8_formats(url, videoId, 'mp4');
        formats.push(...fmts);
      } else {
        formats.push({ url, ext: 'mp3', format_id: 'http', vcodec: 'none', acodec: 'mp3' });
      }
    }
    return { formats, subtitles };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const nextjs = searchNextjsData(this, webpage, displayId);
    const details = (nextjs.pageProps as Record<string, unknown>)?.contentDetails as Record<string, unknown>;

    const mediaUrls = [details?.rawContentUrl, details?.url].filter(Boolean) as string[];
    const { formats, subtitles } = await this._getFormatsAndSubtitles(mediaUrls, displayId);

    return {
      id: str_or_none(details?.id) || displayId,
      title: str_or_none(details?.title) || this._html_search_meta('og:title', webpage) || displayId,
      formats,
      subtitles,
      description:
        str_or_none(details?.description) ||
        clean_html(str_or_none(details?.htmlDescription) || undefined) ||
        this._html_search_meta(['description', 'og:description'], webpage) ||
        undefined,
      thumbnail: str_or_none(details?.image) || this._html_search_meta('og:image', webpage) || undefined,
      timestamp: parseIso8601(details?.createdAt) ?? undefined,
      release_timestamp: parseIso8601(details?.publishedAt) ?? undefined,
      modified_timestamp:
        parseIso8601(details?.updatedAt) ??
        parseIso8601(this._html_search_meta('og:updated_time', webpage) || undefined) ??
        undefined,
      duration: int_or_none(details?.duration) ?? undefined,
      categories: ((details?.genres as Array<{ name?: string }>) || [])
        .map((g) => str_or_none(g.name))
        .filter(Boolean) as string[],
      season: str_or_none(details?.seasonName) ?? undefined,
      season_number: int_or_none(details?.seasonNumber) ?? undefined,
      channel: traverse_obj(details, ['catalog', 'title']) as string | undefined,
      channel_id: str_or_none(traverse_obj(details, ['catalog', 'id']) ?? details?.catalogId) ?? undefined,
      like_count: int_or_none(traverse_obj(details, ['meta', 'aggregations', 'likes'])) ?? undefined,
      dislike_count: int_or_none(traverse_obj(details, ['meta', 'aggregations', 'dislikes'])) ?? undefined,
      comment_count: int_or_none(traverse_obj(details, ['meta', 'aggregations', 'comments'])) ?? undefined,
      channel_follower_count:
        int_or_none(traverse_obj(details, ['meta', 'aggregations', 'followers'])) ?? undefined,
    };
  }
}
