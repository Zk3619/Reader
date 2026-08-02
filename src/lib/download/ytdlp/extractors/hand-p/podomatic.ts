/** PodomaticIE — ported from yt-dlp podomatic.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none } from '../../utils';

export class PodomaticIE extends InfoExtractor {
  static IE_NAME = 'podomatic';
  static _VALID_URL =
    /(?<proto>https?):\/\/(?:(?<channel>[^.]+)\.podomatic\.com\/entry|(?:www\.)?podomatic\.com\/podcasts\/(?<channel_2>[^/]+)\/episodes)\/(?<id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups?.id ?? '';
    const channel = m.groups?.channel || m.groups?.channel_2 || '';
    const proto = m.groups?.proto || 'https';

    const jsonUrl = `${proto}://${channel}.podomatic.com/entry/embed_params/${videoId}?permalink=true&rtmp=0`;
    const dataJson = await this._download_webpage(jsonUrl, videoId, 'Downloading video info');
    const data = JSON.parse(dataJson) as Record<string, unknown>;

    let videoUrl = String(data.downloadLink ?? '');
    if (!videoUrl) {
      videoUrl = `${String(data.streamer ?? '').replace('rtmp', 'http')}/${data.mediaLocation}`;
    }

    return {
      id: videoId,
      url: videoUrl,
      title: String(data.title ?? ''),
      uploader: String(data.podcast ?? ''),
      uploader_id: channel,
      thumbnail: String(data.imageLocation ?? '') || undefined,
      duration: int_or_none(data.length, 1000) ?? undefined,
      vcodec: 'none',
      ext: 'mp3',
    };
  }
}
