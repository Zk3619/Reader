/**
 * GodTubeIE — ported from yt-dlp godtube.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parse_duration } from '../../utils';
import { parseIso8601, xmlTagText } from './_helpers';

export class GodTubeIE extends InfoExtractor {
  static IE_NAME = 'godtube';
  static _VALID_URL = /https?:\/\/(?:www\.)?godtube\.com\/watch\/\?v=(?<id>[\da-zA-Z]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_valid_url(url)!.groups!.id!;
    const configXml = await this._download_webpage(
      `http://www.godtube.com/resource/mediaplayer/${videoId.toLowerCase()}.xml`,
      videoId,
      'Downloading player config XML',
    );

    const videoUrl = xmlTagText(configXml, 'file')!;
    const uploader = xmlTagText(configXml, 'author');
    const timestamp = parseIso8601(xmlTagText(configXml, 'date') || undefined);
    const duration = parse_duration(xmlTagText(configXml, 'duration') || undefined);
    const thumbnail = xmlTagText(configXml, 'image');

    const mediaXml = await this._download_webpage(
      `http://www.godtube.com/media/xml/?v=${videoId}`,
      videoId,
      'Downloading media XML',
    );
    const title = xmlTagText(mediaXml, 'title')!;

    return {
      id: videoId,
      url: videoUrl,
      title,
      thumbnail: thumbnail ?? undefined,
      timestamp: timestamp ?? undefined,
      uploader: uploader ?? undefined,
      duration: duration ?? undefined,
    };
  }
}
