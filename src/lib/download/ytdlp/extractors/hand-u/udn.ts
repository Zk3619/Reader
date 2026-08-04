// @ts-nocheck
/** UDNEmbedIE â€?ported from yt-dlp udn.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, int_or_none, js_to_json } from '../../utils';
import { urljoin } from './_helpers';

export class UDNEmbedIE extends InfoExtractor {
  static IE_NAME = 'udnembed';
  static _PROTOCOL_RELATIVE_VALID_URL = String.raw`//video\.udn\.com/(?:embed|play)/news/(?<id>\d+)`;
  static _VALID_URL = new RegExp(`https?:${UDNEmbedIE._PROTOCOL_RELATIVE_VALID_URL}`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const page = await this._download_webpage(url, videoId);

    const optionsStr = this._html_search_regex(/var\s+options\s*=\s*([^;]+);/, page, 'options')!;
    const transOptionsStr = js_to_json(optionsStr);
    const options =
      this._parse_json<Record<string, unknown>>(transOptionsStr, 'options', undefined, false) || {};

    let videoUrls: Record<string, string>;
    let title: string;
    let poster: string | undefined;

    if (options && Object.keys(options).length && options.video) {
      videoUrls = options.video as Record<string, string>;
      title = String(options.title || videoId);
      poster = options.poster as string | undefined;
    } else {
      videoUrls = this._parse_json<Record<string, string>>(
        this._html_search_regex(/"video"\s*:\s*(\{.+?\})\s*,/, transOptionsStr, 'video urls')!,
        'video urls',
      )!;
      title = this._html_search_regex(/title\s*:\s*'(.+?)'\s*,/, optionsStr, 'title') || videoId;
      poster =
        this._html_search_regex(/poster\s*:\s*'(.+?)'\s*,/, optionsStr, 'poster', null, false) ||
        undefined;
    }

    if (videoUrls.youtube) {
      return this.url_result(videoUrls.youtube, 'Youtube');
    }

    const formats: Format[] = [];
    for (const [videoType, apiUrl] of Object.entries(videoUrls)) {
      if (!apiUrl) continue;
      const videoUrl = await this._download_webpage(
        urljoin(url, apiUrl),
        videoId,
        `retrieve url for ${videoType} video`,
      );
      const ext = determine_ext(videoUrl);
      if (ext === 'm3u8') {
        formats.push(
          ...(await this._extract_m3u8_formats(videoUrl, videoId, 'mp4', 'm3u8_native', undefined, undefined, 'hls')),
        );
      } else if (ext === 'f4m') {
        // f4m not fully ported â€?skip
        continue;
      } else {
        const mobj = videoUrl.match(/_(?<height>\d+)p_(?<tbr>\d+)\.mp4/);
        const aFormat: Format = {
          url: videoUrl,
          format_id: `http-${videoType}`,
        };
        if (mobj?.groups) {
          aFormat.height = int_or_none(mobj.groups.height) ?? undefined;
          aFormat.tbr = int_or_none(mobj.groups.tbr) ?? undefined;
        }
        formats.push(aFormat);
      }
    }

    return {
      id: videoId,
      formats,
      title,
      thumbnail: poster,
    };
  }
}
