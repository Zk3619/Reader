/** NOSNLArticleIE — ported from yt-dlp nosnl.py */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { parse_duration, str_or_none, traverse_obj } from '../../utils';
import { parseIso8601, searchNextjsData } from './_helpers';

export class NOSNLArticleIE extends InfoExtractor {
  static IE_NAME = 'NOSNLArticle';
  static _VALID_URL =
    /https?:\/\/nos\.nl\/(?<type>video|(?:\w+\/)?\w+)\/?\d+-(?<display_id>[\w-]+)/;

  protected async *_entries(
    items: Array<Record<string, unknown>>,
    displayId: string,
  ): AsyncGenerator<VideoInfo> {
    for (const item of items) {
      if (item.type === 'video') {
        const sourceUrl = traverse_obj(item, ['source', 'url']) as string | undefined;
        let formats: Format[] = [];
        let subtitles: Record<string, Subtitle[]> = {};
        if (sourceUrl) {
          formats = await this._extract_m3u8_formats(sourceUrl, displayId, 'mp4');
          subtitles = {};
        }
        const images = ((item.imagesByRatio as unknown[])?.[0] as Array<Record<string, unknown>>) || [];
        yield {
          id: String(item.id),
          title: str_or_none(item.title) ?? undefined,
          description: str_or_none(item.description) ?? undefined,
          formats,
          subtitles,
          duration: parse_duration(String(item.duration ?? '')) ?? undefined,
          thumbnails: images.map((image) => ({
            url: traverse_obj(image, ['url']) as string,
            width: image.width as number | undefined,
            height: image.height as number | undefined,
          })),
        };
      } else if (item.type === 'audio') {
        yield {
          id: String(item.id),
          title: str_or_none(item.title) ?? undefined,
          url: traverse_obj(item, ['media', 'src']) as string,
          ext: 'mp3',
        };
      }
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const siteType = m?.groups?.type ?? 'artikel';
    const displayId = m?.groups?.display_id ?? this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const nextjs = searchNextjsData(this, webpage, displayId);
    const data = (nextjs.pageProps as Record<string, unknown>)?.data as Record<string, unknown>;

    const items =
      siteType === 'video' ? [data.video].filter(Boolean) : (data.items as Array<Record<string, unknown>>) || [];
    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(items as Array<Record<string, unknown>>, displayId)) {
      entries.push(entry);
    }

    return {
      _type: 'playlist',
      entries,
      id: String(data.id ?? displayId),
      title:
        str_or_none(data.title) ||
        this._html_search_meta(['title', 'og:title', 'twitter:title'], webpage) ||
        displayId,
      description:
        str_or_none(data.description) ||
        this._html_search_meta(['description', 'twitter:description', 'og:description'], webpage) ||
        undefined,
      tags: data.keywords as string[] | undefined,
      modified_timestamp: parseIso8601(data.modifiedAt) ?? undefined,
      thumbnail:
        str_or_none(data.shareImageSrc) ||
        this._html_search_meta(['og:image', 'twitter:image'], webpage) ||
        undefined,
      timestamp: parseIso8601(data.publishedAt) ?? undefined,
      categories: ((data.categories as Array<{ label?: string }>) || [])
        .map((c) => str_or_none(c.label))
        .filter(Boolean) as string[],
    };
  }
}
