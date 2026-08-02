/** PhoenixIE — ported from yt-dlp phoenix.py (ZDFBaseIE subset inline) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import {
  determine_ext,
  float_or_none,
  int_or_none,
  join_nonempty,
  merge_dicts,
  str_or_none,
  try_get,
  unified_timestamp,
  url_or_none,
} from '../../utils';

class ZDFBaseIE extends InfoExtractor {
  static IE_NAME = 'zdfbase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('ZDFBaseIE is not a standalone extractor', { expected: true });
  }

  protected extractThumbnails(source: Record<string, unknown>): Thumbnail[] {
    return Object.entries(source)
      .filter(([, v]) => url_or_none(v))
      .map(([formatId, v]) => ({
        id: formatId,
        url: url_or_none(v)!,
        preference: formatId === 'original' ? 1 : 0,
      }));
  }

  protected async extractPtmd(ptmdUrl: string, videoId: string): Promise<Partial<VideoInfo>> {
    const ptmd = await this._download_json<Record<string, unknown>>(ptmdUrl, videoId, 'Downloading PTMD data');
    const basename =
      str_or_none(ptmd.basename) ||
      this._search_regex(/\/vod\/ptmd\/[^/?#]+\/(\w+)/, ptmdUrl, 'content ID', null, false);
    const duration = float_or_none((ptmd.attributes as Record<string, unknown>)?.duration as Record<string, unknown>, 1000);
    const formats: Format[] = [];
    for (const stream of (ptmd.priorityList as Array<Record<string, unknown>>) || []) {
      for (const fmt of (stream.formitaeten as Array<Record<string, unknown>>) || []) {
        for (const quality of (fmt.qualities as Array<Record<string, unknown>>) || []) {
          for (const variant of ((quality.audio as Record<string, unknown>)?.tracks as Array<Record<string, unknown>>) || []) {
            const formatUrl = url_or_none(variant.uri);
            if (!formatUrl) continue;
            const ext = determine_ext(formatUrl);
            if (ext === 'm3u8') {
              formats.push(
                ...(await this._extract_m3u8_formats(formatUrl, videoId, 'mp4', 'm3u8', undefined, undefined, 'hls', undefined, false)),
              );
            } else if (ext === 'mp4' || ext === 'webm') {
              formats.push({
                url: formatUrl,
                format_id: join_nonempty('http', String(stream.type ?? '')) || 'http',
                height: int_or_none(quality.highestVerticalResolution) ?? undefined,
                filesize: int_or_none(variant.filesize) ?? undefined,
              });
            }
          }
        }
      }
    }
    return { id: basename || videoId, duration: duration ?? undefined, formats };
  }
}

export class PhoenixIE extends ZDFBaseIE {
  static IE_NAME = 'phoenix.de';
  static _VALID_URL = /https?:\/\/(?:www\.)?phoenix\.de\/(?:[^/?#]+\/)*[^/?#&]*-a-(?<id>\d+)\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const articleId = this._match_id(url);
    const article = await this._download_json<{ absaetze?: Array<Record<string, unknown>>; subtitel?: string }>(
      `https://www.phoenix.de/response/id/${articleId}`,
      articleId,
      'Downloading article JSON',
    );
    const video = article.absaetze?.[0] || {};
    let title: string | null | undefined = str_or_none(video.titel) || str_or_none(article.subtitel);

    if (video.typ === 'video-youtube') {
      const youtubeId = String(video.id ?? '');
      return this.url_result(youtubeId, 'Youtube', youtubeId, title ?? undefined);
    }

    const videoId = String(video.basename ?? video.content ?? '');
    const details = await this._download_json<Record<string, unknown>>(
      'https://www.phoenix.de/php/mediaplayer/data/beitrags_details.php',
      videoId,
      'Downloading details JSON',
      { query: { ak: 'web', ptmd: 'true', id: videoId, profile: 'player2' } },
    );

    title = title || str_or_none(details.title) || undefined;
    const contentId = ((details.tracking as Record<string, unknown>)?.nielsen as Record<string, unknown>)?.content as Record<string, unknown>;
    const assetId = String(contentId?.assetid ?? videoId);
    const info = await this.extractPtmd(`https://tmd.phoenix.de/tmd/2/android_native_6/vod/ptmd/phoenix/${assetId}`, contentId ? assetId : videoId);

    const duration = int_or_none(try_get(contentId, (x) => (x as Record<string, unknown>).length));
    const series = str_or_none(
      try_get(details, (x) => {
        const tracking = (x.tracking as Record<string, unknown>) || {};
        const nielsen = (tracking.nielsen as Record<string, unknown>) || {};
        const content = (nielsen.content as Record<string, unknown>) || {};
        return content.program;
      }),
    );
    const episode = details.contentType === 'episode' ? title : undefined;
    const teaserImages =
      (try_get(details, (x) => (x.teaserImageRef as Record<string, unknown>)?.layouts as Record<string, unknown>) as Record<string, unknown>) ||
      {};

    return merge_dicts(info, {
      id: assetId,
      title,
      description: str_or_none(details.leadParagraph) ?? undefined,
      duration: duration ?? undefined,
      thumbnails: this.extractThumbnails(teaserImages),
      timestamp: unified_timestamp(details.editorialDate) ?? undefined,
      uploader: str_or_none(details.tvService) ?? undefined,
      series: series ?? undefined,
      episode: episode ?? undefined,
    }) as VideoInfo;
  }
}