/** PhotobucketIE — ported from yt-dlp photobucket.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';

export class PhotobucketIE extends InfoExtractor {
  static IE_NAME = 'photobucket';
  static _VALID_URL =
    /https?:\/\/(?:[a-z0-9]+\.)?photobucket\.com\/.*((?:[\?&]current=)|_)(?<id>.*)\.(?<ext>flv|mp4)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups?.id!;
    const videoExt = m.groups?.ext!;
    const webpage = await this._download_webpage(url, videoId);
    const infoJson = this._search_regex(/Pb\.Data\.Shared\.put\(Pb\.Data\.Shared\.MEDIA, (.*?)\);/, webpage, 'info json')!;
    const info = JSON.parse(infoJson) as Record<string, unknown>;
    const linkcodes = (info.linkcodes as Record<string, unknown>) || {};
    const html = String(linkcodes.html ?? '');
    const encoded = this._html_search_regex(/file=(.+\.mp4)/, html, 'url')!;
    const mediaUrl = decodeURIComponent(encoded);
    return {
      id: videoId,
      url: mediaUrl,
      format_id: videoExt,
      ext: videoExt,
      uploader: info.username as string | undefined,
      timestamp: info.creationDate as number | undefined,
      title: info.title as string | undefined,
      thumbnail: info.thumbUrl as string | undefined,
    };
  }
}
