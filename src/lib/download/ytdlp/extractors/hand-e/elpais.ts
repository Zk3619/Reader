/**
 * ElPaisIE — ported from yt-dlp elpais.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { unified_strdate } from '../../utils';

export class ElPaisIE extends InfoExtractor {
  static IE_DESC = 'El Pais';
  static IE_NAME = 'elpais';
  static _VALID_URL = /https?:\/\/(?:[^.]+\.)?elpais\.com\/.*\/(?<id>[^/#?]+)\.html(?:$|[?#])/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const prefix = this._search_regex(/var\s+url_cache\s*=\s*"([^"]+)";/, webpage, 'URL prefix')!;
    const idMultimedia = this._search_regex(
      /id_multimedia\s*=\s*'([^']+)'/,
      webpage,
      'ID multimedia',
      null,
      false,
    );

    let videoSuffix: string;
    if (idMultimedia) {
      const urlInfo = await this._download_json<{ mp4: string }>(
        `http://elpais.com/vdpep/1/?pepid=${idMultimedia}`,
        videoId,
      );
      videoSuffix = urlInfo.mp4;
    } else {
      videoSuffix = this._search_regex(
        /(?:URLMediaFile|urlVideo_\d+)\s*=\s*url_cache\s*\+\s*'([^']+)'/,
        webpage,
        'video URL',
      )!;
    }

    const videoUrl = prefix + videoSuffix;
    const thumbnailSuffix = this._search_regex(
      /(?:URLMediaStill|urlFotogramaFijo_\d+)\s*=\s*url_cache\s*\+\s*'([^']+)'/,
      webpage,
      'thumbnail URL',
      null,
      false,
    );
    const thumbnail =
      (thumbnailSuffix ? prefix + thumbnailSuffix : null) || this._og_search_thumbnail(webpage) || undefined;

    const title =
      this._search_regex(
        [
          /tituloVideo\s*=\s*'([^']+)'/,
          /<h2 class="entry-header entry-title.*?>(.*?)<\/h2>/,
          /<h1[^>]+class="titulo"[^>]*>([^<]+)/,
        ],
        webpage,
        'title',
        null,
        false,
      ) ||
      this._og_search_title(webpage) ||
      videoId;

    const uploadDate =
      unified_strdate(
        this._search_regex(
          /<p class="date-header date-int updated"\s+title="([^"]+)">/,
          webpage,
          'upload date',
          null,
          false,
        ) || this._html_search_meta('datePublished', webpage, 'timestamp', false),
      ) ?? undefined;

    return {
      id: videoId,
      url: videoUrl,
      title,
      description: this._og_search_description(webpage) ?? undefined,
      thumbnail,
      upload_date: uploadDate,
    };
  }
}
