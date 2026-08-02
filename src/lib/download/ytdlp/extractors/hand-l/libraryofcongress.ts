/**
 * LibraryOfCongressIE — ported from yt-dlp libraryofcongress.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { determine_ext, float_or_none, int_or_none, parse_filesize } from '../../utils';

export class LibraryOfCongressIE extends InfoExtractor {
  static IE_NAME = 'loc';
  static IE_DESC = 'Library of Congress';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?loc\.gov\/(?:item\/|today\/cyberlc\/feature_wdesc\.php\?.*\brec=)(?<id>[0-9a-z_.]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const mediaId = this._search_regex(
      [
        /id=(["'])media-player-(?<id>.+?)\1/,
        /<video[^>]+id=(["'])uuid-(?<id>.+?)\1/,
        /<video[^>]+data-uuid=(["'])(?<id>.+?)\1/,
        /mediaObjectId\s*:\s*(["'])(?<id>.+?)\1/,
        /data-tab="share-media-(?<id>[0-9A-F]{32})"/,
      ],
      webpage,
      'media id',
      null,
      true,
      'id',
    )!;

    const data = (
      await this._download_json<{ mediaObject?: Record<string, unknown> }>(
        `https://media.loc.gov/services/v1/media?id=${mediaId}&context=json`,
        mediaId,
      )
    ).mediaObject || {};
    const derivative = ((data.derivatives as unknown[]) || [])[0] as Record<string, unknown>;
    let mediaUrl = String(derivative?.derivativeUrl ?? '');

    const title =
      String(derivative?.shortName || data.shortName || this._og_search_title(webpage, false) || videoId);

    mediaUrl = mediaUrl.replace('rtmp', 'https');
    const isVideo = String(data.mediaType || 'v').toLowerCase() === 'v';
    let ext = determine_ext(mediaUrl);
    if (ext !== 'mp4' && ext !== 'mp3') {
      mediaUrl += isVideo ? '.mp4' : '.mp3';
      ext = isVideo ? 'mp4' : 'mp3';
    }

    const formats: Format[] = [];
    if (mediaUrl.includes('/vod/mp4:')) {
      formats.push({
        url: mediaUrl.replace('/vod/mp4:', '/hls-vod/media/') + '.m3u8',
        format_id: 'hls',
        ext: 'mp4',
        protocol: 'm3u8_native',
        quality: 1,
      });
    }
    const httpFormat: Format = {
      url: mediaUrl.replace(/(:\/\/[^/]+\/)(?:[^/]+\/)*(?:mp4|mp3):/, '$1'),
      format_id: 'http',
      quality: 1,
    };
    if (!isVideo) httpFormat.vcodec = 'none';
    formats.push(httpFormat);

    const downloadUrls = new Set<string>();
    for (const m of webpage.matchAll(
      /<option[^>]+value=(["'])(?<url>.+?)\1[^>]+data-file-download=[^>]+>\s*(?<fid>.+?)(?:(?:&nbsp;|\s+)\((?<size>.+?)\))?\s*</gi,
    )) {
      const formatId = (m.groups?.fid || '').toLowerCase();
      if (formatId === 'gif' || formatId === 'jpeg') continue;
      const downloadUrl = m.groups?.url || '';
      if (!downloadUrl || downloadUrls.has(downloadUrl)) continue;
      downloadUrls.add(downloadUrl);
      formats.push({
        url: downloadUrl,
        format_id: formatId,
        filesize_approx: parse_filesize(m.groups?.size) ?? undefined,
      });
    }

    const subtitles: VideoInfo['subtitles'] = {};
    const ccUrl = data.ccUrl;
    if (ccUrl) {
      subtitles.en = [{ url: String(ccUrl), ext: 'ttml' }];
    }

    return {
      id: videoId,
      title,
      thumbnail: this._og_search_thumbnail(webpage) || undefined,
      duration: float_or_none(data.duration) ?? undefined,
      view_count: int_or_none(data.viewCount) ?? undefined,
      formats,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
    };
  }
}
