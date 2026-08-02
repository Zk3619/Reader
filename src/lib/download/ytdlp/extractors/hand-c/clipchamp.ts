/**
 * ClipchampIE — ported from yt-dlp clipchamp.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { traverse_obj, unified_timestamp, url_or_none } from '../../utils';
import { searchNextjsData } from './_helpers';

const STREAM_URL_QUERY = { parentOrigin: 'https://clipchamp.com' };

export class ClipchampIE extends InfoExtractor {
  static IE_NAME = 'clipchamp';
  static _VALID_URL = /https?:\/\/(?:www\.)?clipchamp\.com\/watch\/(?<id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const pageProps = searchNextjsData(this, webpage, videoId).pageProps as Record<string, unknown>;
    const data = pageProps.video as Record<string, unknown>;

    const storageLocation = data.storage_location;
    if (storageLocation !== 'cf_stream') {
      throw new ExtractorError(`Unsupported clip storage location "${storageLocation}"`);
    }

    const path = data.download_url as string;
    const iframe = await this._download_webpage(
      `https://iframe.cloudflarestream.com/${path}`,
      videoId,
      'Downloading player iframe',
    );
    const subdomain =
      this._search_regex(/\bcustomer-domain-prefix=["']([\w-]+)["']/, iframe, 'subdomain', null, false) ||
      'customer-2ut9yn3y6fta1yxe';

    const streamUrlTmpl = (ext: string) => `https://${subdomain}.cloudflarestream.com/${path}/manifest/video.${ext}`;

    const formats: Format[] = [
      ...(await this._extract_mpd_formats(`${streamUrlTmpl('mpd')}?parentOrigin=${STREAM_URL_QUERY.parentOrigin}`, videoId, 'dash', undefined, false)),
      ...(await this._extract_m3u8_formats(
        `${streamUrlTmpl('m3u8')}?parentOrigin=${STREAM_URL_QUERY.parentOrigin}`,
        videoId,
        'mp4',
        'm3u8_native',
        undefined,
        undefined,
        'hls',
        undefined,
        false,
      )),
    ];

    const uploaderParts = (traverse_obj(data, ['creator', 'first_name']) as string | undefined) != null
      ? [traverse_obj(data, ['creator', 'first_name']) as string, traverse_obj(data, ['creator', 'last_name']) as string]
      : [];

    return {
      id: videoId,
      formats,
      uploader: uploaderParts.filter(Boolean).join(' ') || undefined,
      title: (traverse_obj(data, ['project', 'project_name']) as string) || undefined,
      timestamp: unified_timestamp(data.created_at) ?? undefined,
      thumbnail: url_or_none(data.thumbnail_url) || undefined,
    };
  }
}
