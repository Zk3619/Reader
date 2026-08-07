/** Tube8IE — modernized for playervars/mediaDefinitions (YouPorn-style; upstream tube8.py is _WORKING=False) */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  int_or_none,
  str_to_int,
  url_or_none,
} from '../../utils';
import { strip_or_none } from './_helpers';

export class Tube8IE extends InfoExtractor {
  static IE_NAME = 'tube8';
  /** New: /porn-video/<id>/ ; legacy: /cat/.../slug/<id>/ ; embed: /embed/<id>/ */
  static _VALID_URL = [
    /https?:\/\/(?:www\.)?tube8\.com\/(?:embed|porn-video)\/(?<id>\d+)(?:\/(?<display_id>[^/?#&]+))?\/?(?:[#?]|$)/,
    /https?:\/\/(?:www\.)?tube8\.com\/(?:[^/]+\/)+(?<display_id>[^/]+)\/(?<id>\d+)/,
  ];
  static _EMBED_REGEX = [
    /<iframe[^>]+\bsrc=["'](?<url>(?:https?:)?\/\/(?:www\.)?tube8\.com\/embed\/\d+)/,
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const displayId = m.groups?.display_id || videoId;

    const webpage = await this._download_webpage(
      `https://www.tube8.com/porn-video/${videoId}/`,
      displayId,
      undefined,
      { headers: { Cookie: 'age_verified=1' } },
    );

    if (/title="This video is no longer available"/i.test(webpage)) {
      throw new ExtractorError(`Video ${videoId} is no longer available`, { expected: true });
    }

    const playerVars =
      this._search_json<Record<string, unknown>>(/\bplayervars\s*:/, webpage, 'player vars', videoId, {
        fatal: false,
      }) || {};

    const defs = Array.isArray(playerVars.mediaDefinitions)
      ? (playerVars.mediaDefinitions as Array<Record<string, unknown>>)
      : [];

    const getFormatData = async (streamType: string): Promise<Array<Record<string, unknown>>> => {
      const infoUrl = defs.find(
        (v) => v?.format === streamType && typeof v.videoUrl === 'string',
      )?.videoUrl;
      if (!url_or_none(infoUrl)) return [];
      const data = await this._download_json<unknown>(
        String(infoUrl),
        videoId,
        `Downloading ${streamType} info JSON`,
        { fatal: false, headers: { Cookie: 'age_verified=1' } },
      );
      if (!Array.isArray(data)) return [];
      return data.filter(
        (v): v is Record<string, unknown> =>
          !!v &&
          typeof v === 'object' &&
          (v as Record<string, unknown>).format === streamType &&
          typeof (v as Record<string, unknown>).videoUrl === 'string',
      );
    };

    const formats: Format[] = [];
    const hlsData = await getFormatData('hls');
    const preferredHls = hlsData.filter((v) => typeof v.defaultQuality !== 'boolean');
    const hlsList = preferredHls.length ? preferredHls : hlsData;
    for (const item of hlsList) {
      const hlsUrl = url_or_none(item.videoUrl);
      if (!hlsUrl) continue;
      const q = int_or_none(item.quality) ?? int_or_none(item.height);
      const hlsFmts = await this._extract_m3u8_formats(
        hlsUrl,
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        'hls',
        undefined,
        false,
      );
      for (const f of hlsFmts) {
        if (!f.height && q) f.height = q;
        if (!f.tbr && q) f.tbr = q >= 1080 ? 6000 : q >= 720 ? 4000 : q >= 480 ? 2000 : 1000;
      }
      formats.push(...hlsFmts);
    }

    for (const d of await getFormatData('mp4')) {
      const videoUrl = url_or_none(d.videoUrl);
      if (!videoUrl) continue;
      let height = int_or_none(d.quality);
      const f: Format = {
        format_id: 'http',
        url: videoUrl,
        protocol: 'https',
        // Prefer progressive HTTP when size is known — avoids HLS size/progress drift
        preference: 1,
        filesize: int_or_none(d.videoSize) ?? undefined,
      };
      const pm = videoUrl.match(/(?<height>\d{3,4})[pP]_(?<bitrate>\d+)[kK]_\d+/i);
      if (pm?.groups) {
        if (!height) height = int_or_none(pm.groups.height);
        const bitrate = int_or_none(pm.groups.bitrate);
        if (height && bitrate) {
          f.format_id = `${height}p-${bitrate}k`;
          f.tbr = bitrate;
        } else if (bitrate) {
          f.tbr = bitrate;
        }
      }
      f.height = height ?? undefined;
      formats.push(f);
    }

    if (!formats.length) {
      this.raise_no_formats(`Unable to extract Tube8 formats for ${videoId}`, true);
    }

    let title =
      (typeof playerVars.video_title === 'string' ? playerVars.video_title : null) ||
      this._html_search_regex(/<h1[^>]*>([^<]+)/, webpage, 'title', null, false) ||
      this._og_search_title(webpage, false);
    title = strip_or_none(title) || displayId;

    const duration =
      int_or_none(playerVars.video_duration) ??
      int_or_none(playerVars.duration) ??
      undefined;

    // Tube8 media JSON often omits videoSize — estimate from tbr × duration (yt-dlp style)
    if (duration && duration > 0) {
      for (const f of formats) {
        if (f.filesize || f.filesize_approx) continue;
        const tbr = f.tbr || (f.height ? (f.height >= 720 ? 4000 : f.height >= 480 ? 2000 : 1000) : 0);
        if (tbr > 0) f.filesize_approx = Math.round((tbr * 1000 * duration) / 8);
      }
    }
    const thumbnail =
      url_or_none(playerVars.image_url) ||
      this._og_search_thumbnail(webpage) ||
      undefined;

    const description = this._html_search_regex(
      /Description:<\/dt>\s*<dd>([\s\S]+?)<\/dd>/,
      webpage,
      'description',
      null,
      false,
    );
    const uploader = this._html_search_regex(
      /<span class="username">\s*(.+?)\s*</,
      webpage,
      'uploader',
      null,
      false,
    );
    const likeCount = int_or_none(
      this._search_regex(/rupVar\s*=\s*"(\d+)"/, webpage, 'like count', null, false),
    );
    const dislikeCount = int_or_none(
      this._search_regex(/rdownVar\s*=\s*"(\d+)"/, webpage, 'dislike count', null, false),
    );
    const viewCount = str_to_int(
      this._search_regex(/Views:\s*<\/dt>\s*<dd>([\d,\.]+)/, webpage, 'view count', null, false),
    );
    const commentCount = str_to_int(
      this._search_regex(/<span id="allCommentsCount">(\d+)<\/span>/, webpage, 'comment count', null, false),
    );
    const category = this._search_regex(
      /Category:\s*<\/dt>\s*<dd>\s*<a[^>]+href=[^>]+>([^<]+)/,
      webpage,
      'category',
      null,
      false,
    );
    const tagsStr = this._search_regex(
      /Tags:\s*<\/dt>\s*<dd>([\s\S]+?)<\/(?!a)/,
      webpage,
      'tags',
      null,
      false,
    );
    const tags = tagsStr
      ? [...tagsStr.matchAll(/<a[^>]+href=[^>]+>([^<]+)/g)].map((mm) => mm[1]!)
      : undefined;

    return {
      id: videoId,
      display_id: displayId,
      title,
      thumbnail,
      duration,
      age_limit: 18,
      formats,
      description: description || undefined,
      uploader: uploader || undefined,
      view_count: viewCount ?? undefined,
      like_count: likeCount ?? undefined,
      dislike_count: dislikeCount ?? undefined,
      comment_count: commentCount ?? undefined,
      categories: category ? [category] : undefined,
      tags,
    };
  }
}
