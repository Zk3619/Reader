/** NineCNineMediaIE / CPTwentyFourIE — ported from yt-dlp ninecninemedia.py */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import { float_or_none, int_or_none, str_or_none } from '../../utils';
import { parseIso8601 } from './_helpers';

export class NineCNineMediaIE extends InfoExtractor {
  static IE_NAME = '9c9media';
  static _GEO_COUNTRIES = ['CA'];
  static _VALID_URL = /9c9media:(?<destination_code>[^:]+):(?<id>\d+)/;
  static _API_BASE_TEMPLATE = 'http://capi.9c9media.com/destinations/%s/platforms/desktop/contents/%s/';

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url);
    const destinationCode = m?.groups?.destination_code ?? '';
    const contentId = m?.groups?.id ?? this._match_id(url);
    const apiBase = NineCNineMediaIE._API_BASE_TEMPLATE.replace('%s', destinationCode).replace('%s', contentId);

    const content = await this._download_json<Record<string, unknown>>(apiBase, contentId, undefined, {
      query: { $include: '[Media.Name,Season,ContentPackages.Duration,ContentPackages.Id]' },
    });
    const title = String(content.Name ?? contentId);
    const packages = (content.ContentPackages as Array<Record<string, unknown>>) || [];
    const contentPackage = packages[0] || {};
    const packageId = contentPackage.Id;
    const pkgUrl = `${apiBase}contentpackages/${packageId}/`;
    const pkgDetail = await this._download_json<Record<string, unknown>>(pkgUrl, contentId, undefined, {
      query: { $include: '[HasClosedCaptions]' },
    });

    if (
      !this.params.allow_unplayable_formats &&
      (pkgDetail.Constraints as Record<string, unknown>)?.Security
    ) {
      this.report_warning(`DRM protected: ${contentId}`);
    }

    const manifestBase = `${pkgUrl}manifest.`;
    const formats: Format[] = [];
    formats.push(
      ...(await this._extract_m3u8_formats(`${manifestBase}m3u8`, contentId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false)),
    );
    formats.push(...(await this._extract_mpd_formats(`${manifestBase}mpd`, contentId, 'dash', undefined, false)));

    const thumbnails: Thumbnail[] = [];
    for (const image of (content.Images as Array<Record<string, unknown>>) || []) {
      if (image.Url) {
        thumbnails.push({
          url: String(image.Url),
          width: int_or_none(image.Width) ?? undefined,
          height: int_or_none(image.Height) ?? undefined,
        });
      }
    }

    const tags: string[] = [];
    const categories: string[] = [];
    for (const [src, dest] of [
      ['Tags', tags],
      ['Genres', categories],
    ] as const) {
      for (const e of (content[src] as Array<{ Name?: string }>) || []) {
        if (e.Name) dest.push(e.Name);
      }
    }

    const season = (content.Season as Record<string, unknown>) || {};
    const info: VideoInfo = {
      id: contentId,
      title,
      description: str_or_none(content.Desc) || str_or_none(content.ShortDesc) || undefined,
      timestamp: parseIso8601(content.BroadcastDateTime) ?? undefined,
      episode_number: int_or_none(content.Episode) ?? undefined,
      season: str_or_none(season.Name) ?? undefined,
      season_number: int_or_none(season.Number) ?? undefined,
      season_id: str_or_none(season.Id) ?? undefined,
      series: str_or_none((content.Media as Record<string, unknown>)?.Name) ?? undefined,
      tags,
      categories,
      duration: float_or_none(contentPackage.Duration) ?? undefined,
      formats,
      thumbnails,
    };

    if (pkgDetail.HasClosedCaptions) {
      info.subtitles = {
        en: [
          { url: `${manifestBase}vtt`, ext: 'vtt' },
          { url: `${manifestBase}srt`, ext: 'srt' },
        ] as Subtitle[],
      };
    }
    return info;
  }
}

export class CPTwentyFourIE extends InfoExtractor {
  static IE_NAME = 'cp24';
  static _GEO_COUNTRIES = ['CA'];
  static _VALID_URL = /https?:\/\/(?:www\.)?cp24\.com\/news\/(?<id>[^?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const match = this._html_search_regex(
      /getAuthStates\("([^"]+)",\s?"([^"]+)"\);/,
      webpage,
      'video id and destination',
    )!;
    const parts = match.match(/getAuthStates\("([^"]+)",\s?"([^"]+)"\)/);
    const videoId = parts?.[1] ?? '';
    const destination = parts?.[2] ?? '';
    return this.url_result(`9c9media:${destination}:${videoId}`, '9c9media', videoId);
  }
}
