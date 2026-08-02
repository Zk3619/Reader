/**
 * DetikEmbedIE — ported from yt-dlp detik.py (embed-only)
 */

import { InfoExtractor, ExtractorError } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, htmlExtractTitle } from './_helpers';

export class DetikEmbedIE extends InfoExtractor {
  static IE_NAME = 'detik:embed';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('DetikEmbedIE is not a standalone extractor', { expected: true });
  }

  async _extractFromWebpage(url: string, webpage: string): Promise<VideoInfo | null> {
    const match = webpage.match(
      /<script\s*[^>]+src="https?:\/\/(aws)?cdn\.detik\.net\.id\/(?<type>flowplayer|detikVideo)[^>]+>\s*(?<video_data>{[^}]+})/i,
    );
    if (!match?.groups?.type) return null;

    const playerType = match.groups.type;
    const videoData = match.groups.video_data!;
    const displayId = url.replace(/\/$/, '').split('/').pop() || 'detik';
    let extraInfo: Record<string, unknown> = {};

    let videoUrl: string;
    if (playerType === 'flowplayer') {
      const videoJson = this._parse_json<Record<string, unknown>>(
        videoData.replace(/'/g, '"'),
        displayId,
      )!;
      videoUrl = String(videoJson.videoUrl ?? '');
      extraInfo = {
        id: this._search_regex(/identifier\s*:\s*'([^']+)'/, webpage, 'identifier', null, false),
        thumbnail: videoJson.imageUrl,
      };
    } else {
      videoUrl =
        this._search_regex(/videoUrl\s*:\s*['"]?([^"']+)/, videoData, 'videoUrl', null, false) || '';
      extraInfo = {
        id: this._html_search_meta(['video_id', 'dtk:video_id'], webpage),
        thumbnail: this._search_regex(/imageUrl\s*:\s*['"]?([^"']+)/, videoData, 'imageUrl', null, false),
        duration: int_or_none(this._html_search_meta('duration', webpage, undefined, false)) ?? undefined,
        release_timestamp:
          int_or_none(this._html_search_meta('dtk:publishdateunix', webpage, undefined, false), 1000) ??
          undefined,
        timestamp:
          int_or_none(this._html_search_meta('dtk:createdateunix', webpage, undefined, false), 1000) ??
          undefined,
        uploader: this._search_regex(
          /([^-]+)/,
          (this._html_search_meta('dtk:author', webpage, undefined, false) || '').trim(),
          'uploader',
          null,
          false,
        ),
      };
    }

    if (!videoUrl) return null;
    const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, videoUrl, displayId);
    const jsonLd = this._search_json_ld(webpage, displayId, { fatal: false }) || {};

    const keywords =
      this._html_search_meta(['keywords', 'keyword', 'dtk:keywords'], webpage, undefined, false) || '';
    const tags = keywords ? keywords.split(',').map((t) => t.trim()).filter(Boolean) : undefined;

    return {
      ...(jsonLd as VideoInfo),
      ...extraInfo,
      display_id: displayId,
      title:
        this._html_search_meta(['og:title', 'originalTitle'], webpage) ||
        htmlExtractTitle(webpage) ||
        displayId,
      description:
        this._html_search_meta(['og:description', 'twitter:description', 'description'], webpage) ?? undefined,
      formats,
      subtitles,
      tags,
    };
  }
}
