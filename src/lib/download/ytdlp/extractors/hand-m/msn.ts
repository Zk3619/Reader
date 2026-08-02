/**
 * MSNIE — ported from yt-dlp msn.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  clean_html,
  determine_ext,
  int_or_none,
  str_or_none,
  url_or_none,
} from '../../utils';
import {
  extractM3u8FormatsAndSubtitles,
  extractMpdFormatsAndSubtitles,
  mergeSubtitles,
  parseIso8601,
} from './_helpers';

export class MSNIE extends InfoExtractor {
  static IE_NAME = 'msn';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|preview)\.)?msn\.com\/(?<locale>[a-z]{2}-[a-z]{2})\/(?:[^/?#]+\/)+(?<display_id>[^/?#]+)\/[a-z]{2}-(?<id>[\da-zA-Z]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const locale = m.groups?.locale ?? '';
    const displayId = m.groups?.display_id ?? '';
    const pageId = m.groups?.id ?? '';

    const jsonData = await this._download_json<Record<string, unknown>>(
      `https://assets.msn.com/content/view/v2/Detail/${locale}/${pageId}`,
      pageId,
    );

    const bodyHtml = str_or_none((jsonData.body as string | undefined));
    const commonMetadata = {
      title: str_or_none(jsonData.title) ?? undefined,
      description:
        str_or_none(jsonData.abstract) ||
        (bodyHtml ? clean_html(bodyHtml) : null) ||
        undefined,
      timestamp: parseIso8601(jsonData.createdDateTime) ?? undefined,
      release_timestamp: parseIso8601(jsonData.publishedDateTime) ?? undefined,
      modified_timestamp: parseIso8601(jsonData.updatedDateTime) ?? undefined,
      thumbnail: url_or_none((jsonData.thumbnail as Record<string, Record<string, string>>)?.image?.url) ?? undefined,
      duration: int_or_none((jsonData.videoMetadata as Record<string, unknown>)?.playTime) ?? undefined,
      tags: ((jsonData.keywords as string[]) || []).filter(Boolean),
      uploader: str_or_none((jsonData.provider as Record<string, unknown>)?.name) ?? undefined,
      uploader_id: str_or_none((jsonData.provider as Record<string, unknown>)?.id) ?? undefined,
    };

    const pageType = str_or_none(jsonData.type);
    const sourceUrl = url_or_none(jsonData.sourceHref);

    if (pageType === 'video') {
      if ((jsonData.thirdPartyVideoPlayer as Record<string, unknown>)?.enabled && sourceUrl) {
        return this.url_result(sourceUrl);
      }

      const formats: Format[] = [];
      const subtitles: Record<string, Subtitle[]> = {};
      const externalFiles =
        ((jsonData.videoMetadata as Record<string, unknown>)?.externalVideoFiles as Array<Record<string, unknown>>) ||
        [];

      for (const file of externalFiles) {
        const fileUrl = url_or_none(file.url);
        if (!fileUrl) continue;
        const ext = determine_ext(fileUrl);
        if (ext === 'm3u8') {
          const res = await extractM3u8FormatsAndSubtitles(this, fileUrl, pageId, 'hls');
          formats.push(...res.formats);
          mergeSubtitles(subtitles, res.subtitles);
        } else if (ext === 'mpd') {
          const res = await extractMpdFormatsAndSubtitles(this, fileUrl, pageId, 'dash');
          formats.push(...res.formats);
          mergeSubtitles(subtitles, res.subtitles);
        } else {
          formats.push({
            url: fileUrl,
            format_id: str_or_none(file.format) || 'http',
            filesize: int_or_none(file.fileSize) ?? undefined,
            height: int_or_none(file.height) ?? undefined,
            width: int_or_none(file.width) ?? undefined,
          });
        }
      }

      for (const caption of ((jsonData.videoMetadata as Record<string, unknown>)?.closedCaptions as Array<Record<string, unknown>>) || []) {
        const href = url_or_none(caption.href);
        if (!href) continue;
        const lang = str_or_none(caption.locale) || 'en-us';
        if (!subtitles[lang]) subtitles[lang] = [];
        subtitles[lang]!.push({ url: href, ext: 'ttml' });
      }

      return { id: pageId, display_id: displayId, formats, subtitles, ...commonMetadata };
    }

    if (pageType === 'webcontent') {
      if (!sourceUrl) throw new ExtractorError('Could not find source URL');
      return this.url_result(sourceUrl);
    }

    if (pageType === 'article') {
      const entries = ((jsonData.socialEmbeds as Array<Record<string, unknown>>) || [])
        .map((e) => url_or_none(e.postUrl))
        .filter(Boolean)
        .map((u) => this.url_result(u!));
      return this.playlist_result(entries, pageId, commonMetadata.title, commonMetadata.description);
    }

    throw new ExtractorError(`Unsupported page type: ${pageType}`);
  }
}
