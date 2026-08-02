/** ToggleIE / MeWatchIE — ported from yt-dlp toggle.py */

import { InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import {
  determine_ext,
  float_or_none,
  int_or_none,
} from '../../utils';
import { extractMpdFormatsAndSubtitles, parseIso8601, strip_or_none } from './_helpers';

export class ToggleIE extends InfoExtractor {
  static IE_NAME = 'toggle';
  static _VALID_URL =
    /(?:https?:\/\/(?:(?:www\.)?mewatch|video\.toggle)\.sg\/(?:en|zh)\/(?:[^/]+\/){2,}|toggle:)(?<id>[0-9]+)/;

  static _API_USER = 'tvpapi_147';
  static _API_PASS = '11111';

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);

    const params = {
      initObj: {
        Locale: {
          LocaleLanguage: '',
          LocaleCountry: '',
          LocaleDevice: '',
          LocaleUserState: 0,
        },
        Platform: 0,
        SiteGuid: 0,
        DomainID: '0',
        UDID: '',
        ApiUser: ToggleIE._API_USER,
        ApiPass: ToggleIE._API_PASS,
      },
      MediaID: videoId,
      mediaType: 0,
    };

    const info = await this._download_json<Record<string, unknown>>(
      'http://tvpapi.as.tvinci.com/v2_9/gateways/jsonpostgw.aspx?m=GetMediaInfo',
      videoId,
      'Downloading video info json',
      { method: 'POST', data: JSON.stringify(params) },
    );

    const title = String(info.MediaName || videoId);
    const formats: Format[] = [];

    for (const videoFile of (info.Files as Array<Record<string, unknown>>) || []) {
      const videoUrl = videoFile.URL;
      let vidFormat = videoFile.Format;
      if (!videoUrl || videoUrl === 'NA' || !vidFormat) continue;
      const videoUrlStr = String(videoUrl);
      const ext = determine_ext(videoUrlStr);
      vidFormat = String(vidFormat).replace(/ /g, '');

      if (ext === 'm3u8') {
        const m3u8Formats = await this._extract_m3u8_formats(
          videoUrlStr,
          videoId,
          'mp4',
          'm3u8_native',
          undefined,
          undefined,
          String(vidFormat),
          `Downloading ${vidFormat} m3u8 information`,
          false,
        );
        for (const f of m3u8Formats) {
          if (f.url?.includes('/fpshls/')) continue;
          formats.push(f);
        }
      } else if (ext === 'mpd') {
        const res = await extractMpdFormatsAndSubtitles(this, videoUrlStr, videoId, String(vidFormat));
        formats.push(...res.formats);
      } else if (ext === 'ism') {
        formats.push({ ext, url: videoUrlStr, format_id: String(vidFormat) });
      } else if (ext === 'mp4') {
        formats.push({ ext, url: videoUrlStr, format_id: String(vidFormat) });
      }
    }

    if (!formats.length) {
      for (const meta of (info.Metas as Array<Record<string, unknown>>) || []) {
        if (
          !this.params.allow_unplayable_formats &&
          meta.Key === 'Encryption' &&
          meta.Value === '1'
        ) {
          this.report_warning(`DRM protected: ${videoId}`);
        }
      }
    }

    const thumbnails: Thumbnail[] = [];
    for (const picture of (info.Pictures as Array<Record<string, unknown>>) || []) {
      const picUrl = picture.URL;
      if (!picUrl) continue;
      const thumbnail: Thumbnail = { url: String(picUrl) };
      const picSize = String(picture.PicSize || '');
      const m = /(?<width>\d+)[xX](?<height>\d+)/.exec(picSize);
      if (m?.groups) {
        thumbnail.width = int_or_none(m.groups.width) ?? undefined;
        thumbnail.height = int_or_none(m.groups.height) ?? undefined;
      }
      thumbnails.push(thumbnail);
    }

    const counter = (prefix: string) =>
      int_or_none(info[prefix + 'Counter'] ?? info[`${prefix.toLowerCase()}_counter`]);

    return {
      id: videoId,
      title,
      description: strip_or_none(info.Description) ?? undefined,
      duration: int_or_none(info.Duration) ?? undefined,
      timestamp: parseIso8601(info.CreationDate as string) ?? undefined,
      average_rating: float_or_none(info.Rating) ?? undefined,
      view_count: counter('View') ?? undefined,
      like_count: counter('Like') ?? undefined,
      thumbnails,
      formats,
    };
  }
}

export class MeWatchIE extends InfoExtractor {
  static IE_NAME = 'mewatch';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|live)\.)?mewatch\.sg\/watch\/[^/?#&]+-(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const itemId = this._match_id(url);
    const data = await this._download_json<{ customId?: string }>(
      `https://cdn.mewatch.sg/api/items/${itemId}`,
      itemId,
      undefined,
      { query: { segments: 'all' } },
    );
    const customId = String(data.customId || itemId);
    return this.url_result(`toggle:${customId}`, 'Toggle', customId);
  }
}
