/**
 * DctpTvIE — ported from yt-dlp dctp.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { float_or_none, int_or_none, unified_timestamp, url_or_none } from '../../utils';

export class DctpTvIE extends InfoExtractor {
  static IE_NAME = 'dctp';
  static _VALID_URL = /https?:\/\/(?:www\.)?dctp\.tv\/(?:#\/)?filme\/(?<id>[^/?#&]+)/;
  protected static _BASE_URL = 'http://dctp-ivms2-restapi.s3.amazonaws.com';

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const baseUrl = DctpTvIE._BASE_URL;

    const version = await this._download_json<{ version_name: string }>(
      `${baseUrl}/version.json`,
      displayId,
      'Downloading version JSON',
    );
    const restapiBase = `${baseUrl}/${version.version_name}/restapi`;

    const info = await this._download_json<{ object_id: unknown }>(
      `${restapiBase}/slugs/${displayId}.json`,
      displayId,
      'Downloading video info JSON',
    );
    const media = await this._download_json<Record<string, unknown>>(
      `${restapiBase}/media/${String(info.object_id)}.json`,
      displayId,
      'Downloading media JSON',
    );

    const uuid = String(media.uuid ?? '');
    const title = String(media.title ?? '');
    const isWide = !!media.is_wide;
    const formats: Format[] = [];

    const addFormats = (suffix: string) => {
      const templ = `https://%s/${uuid}_dctp_${suffix}.m4v`;
      formats.push(
        {
          format_id: `hls-${suffix}`,
          url: `${templ.replace('%s', 'cdn-segments.dctp.tv')}/playlist.m3u8`,
          protocol: 'm3u8_native',
        },
        { format_id: `s3-${suffix}`, url: templ.replace('%s', 'completed-media.s3.amazonaws.com') },
        { format_id: `http-${suffix}`, url: templ.replace('%s', 'cdn-media.dctp.tv') },
      );
    };

    addFormats(`0500_${isWide ? '16x9' : '4x3'}`);
    if (isWide) addFormats('720p');

    const thumbnails: Thumbnail[] = [];
    const images = media.images;
    if (Array.isArray(images)) {
      for (const image of images) {
        if (!image || typeof image !== 'object') continue;
        const imageUrl = url_or_none((image as Record<string, unknown>).url);
        if (!imageUrl) continue;
        thumbnails.push({
          url: imageUrl,
          width: int_or_none((image as Record<string, unknown>).width) ?? undefined,
          height: int_or_none((image as Record<string, unknown>).height) ?? undefined,
        });
      }
    }

    return {
      id: uuid,
      display_id: displayId,
      title,
      alt_title: (media.subtitle as string) ?? undefined,
      description: (media.description as string) || (media.teaser as string) || undefined,
      timestamp: unified_timestamp(media.created) ?? undefined,
      duration: float_or_none(media.duration_in_ms, 1000) ?? undefined,
      thumbnails,
      formats,
    };
  }
}
