// @ts-nocheck
/** ZenPornIE �?ported from yt-dlp zenporn.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { determine_ext, unified_strdate, url_or_none } from '../../utils';

function decodeVideoUrl(encodedUrl: string): string | null {
  const map: Record<string, string> = {
    'А': 'A',
    'В': 'B',
    'С': 'C',
    'Е': 'E',
    'М': 'M',
    '.': '+',
    ',': '/',
    '~': '=',
  };
  const translated = [...encodedUrl].map((c) => map[c] || c).join('');
  try {
    return Buffer.from(translated, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function genInfoUrl(extDomain: string, extrId: string, lifetime = 86400): string {
  const n = Number(extrId);
  const p1 = Math.floor(n / 1_000_000) * 1_000_000;
  const p2 = Math.floor(n / 1_000) * 1_000;
  return `https://${extDomain}/api/json/video/${lifetime}/${p1}/${p2}/${n}.json`;
}

export class ZenPornIE extends InfoExtractor {
  static IE_NAME = 'zenporn';
  static _VALID_URL = /https?:\/\/(?:www\.)?zenporn\.com\/video\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const m = this._search_regex(
      /https:\/\/(?<ext_domain>[\w.-]+\.\w{3})\/embed\/(?<extr_id>\d+)\//,
      webpage,
      'embed info',
      null,
      false,
    );
    const gm = m ? /https:\/\/(?<ext_domain>[\w.-]+\.\w{3})\/embed\/(?<extr_id>\d+)\//.exec(m) : null;
    const extDomain = gm?.groups?.ext_domain || '';
    const videoId = gm?.groups?.extr_id || displayId;

    const infoJson =
      (await this._download_json<Record<string, any>>(
        genInfoUrl(extDomain, videoId),
        videoId,
        undefined,
        { fatal: false },
      )) || {};

    const videoJson = await this._download_json<Array<Record<string, any>>>(
      `https://${extDomain}/api/videofile.php`,
      videoId,
      'Downloading video file JSON',
      {
        query: { video_id: videoId, lifetime: '8640000' },
      },
    );

    const decodedUrl = decodeVideoUrl(String(videoJson?.[0]?.video_url || ''));
    if (!decodedUrl) throw new ExtractorError('Unable to decode the video url');

    const videoMeta = (infoJson.video || {}) as Record<string, any>;
    return {
      id: videoId,
      display_id: displayId,
      ext: determine_ext(String(videoJson?.[0]?.format || '')) || 'mp4',
      url: `https://${extDomain}${decodedUrl}`,
      age_limit: 18,
      title: String(videoMeta.title || videoId),
      description: String(videoMeta.description || ''),
      thumbnail: url_or_none(videoMeta.thumb) || undefined,
      upload_date: unified_strdate(String(videoMeta.post_date || '')) || undefined,
      uploader: String(videoMeta?.user?.username || '') || undefined,
    };
  }
}
