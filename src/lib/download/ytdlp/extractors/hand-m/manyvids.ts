/** ManyVidsIE — ported from yt-dlp manyvids.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  clean_html,
  determine_ext,
  int_or_none,
  parse_count,
  parse_duration,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';
import { parseIso8601 } from './_helpers';

export class ManyVidsIE extends InfoExtractor {
  static IE_NAME = 'manyvids';
  static _VALID_URL = /https?:\/\/(?:www\.)?manyvids\.com\/video\/(?<id>\d+)/i;
  static _API_BASE = 'https://www.manyvids.com/bff/store/video';

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const videoData = (
      await this._download_json<{ data: Record<string, unknown> }>(`${ManyVidsIE._API_BASE}/${videoId}/private`, videoId)
    ).data;

    const formats: Format[] = [];
    let previewOnly = true;
    for (const [formatId, _path] of [
      ['preview', ['teaser', 'filepath']],
      ['transcoded', ['transcodedFilepath']],
      ['filepath', ['filepath']],
    ] as const) {
      const formatUrl = url_or_none(
        formatId === 'preview'
          ? traverse_obj(videoData, ['teaser', 'filepath'])
          : formatId === 'transcoded'
            ? traverse_obj(videoData, ['transcodedFilepath'])
            : traverse_obj(videoData, ['filepath']),
      );
      if (!formatUrl) continue;
      if (determine_ext(formatUrl) === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(
            formatUrl,
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            formatId,
          )),
        );
      } else {
        formats.push({
          url: formatUrl,
          format_id: formatId,
          preference: formatId === 'preview' ? -10 : undefined,
          quality: formatId === 'filepath' ? 10 : undefined,
          height:
            int_or_none(this._search_regex(/_(\d{2,3}[02468])_/, formatUrl, 'height', null, false)) ?? undefined,
        });
      }
      if (formatId !== 'preview') previewOnly = false;
    }

    const metadata = (
      await this._download_json<{ data?: Record<string, unknown> }>(`${ManyVidsIE._API_BASE}/${videoId}`, videoId, undefined, {
        fatal: false,
      })
    )?.data;
    let title = clean_html(str_or_none(metadata?.title));
    let outId = videoId;
    if (previewOnly) {
      title = [title, '(Preview)'].filter(Boolean).join(' ');
      outId = `${videoId}-preview`;
      this.report_warning(
        `Only extracting preview. Video may be paid or subscription only. Use --cookies if you are logged in.`,
      );
    }

    return {
      id: outId,
      title: title ?? undefined,
      formats,
      description: clean_html(str_or_none(metadata?.description)) ?? undefined,
      uploader: clean_html(str_or_none(traverse_obj(metadata, ['model', 'displayName']))) ?? undefined,
      thumbnail:
        url_or_none(metadata?.screenshot) || url_or_none(metadata?.thumbnail) || undefined,
      view_count: parse_count(metadata?.views) ?? undefined,
      like_count: parse_count(metadata?.likes) ?? undefined,
      release_timestamp: parseIso8601(metadata?.launchDate) ?? undefined,
      duration: parse_duration(metadata?.videoDuration) ?? undefined,
      tags: (traverse_obj(metadata, ['tagList'], { get_all: true }) as Array<Record<string, unknown>>)
        ?.map((t) => str_or_none(t?.label))
        .filter(Boolean) as string[] | undefined,
    };
  }
}
