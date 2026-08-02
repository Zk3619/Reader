/** PlaytvakIE — ported from yt-dlp playtvak.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none } from '../../utils';
import { parse_iso8601, qualityRank } from './_helpers';

const QUALITY = qualityRank(['low', 'middle', 'high']);

export class PlaytvakIE extends InfoExtractor {
  static IE_NAME = 'playtvak';
  static _VALID_URL =
    /https?:\/\/(?:.+?\.)?(?:playtvak|idnes|lidovky|metro)\.cz\/.*\?(?:c|idvideo)=(?<id>[^&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);

    const infoUrlRaw = this._html_search_regex(
      /Misc\.video(?:FLV)?\(\s*{\s*data\s*:\s*"([^"]+)"/,
      webpage,
      'info url',
    )!;
    const parsed = new URL(infoUrlRaw);
    parsed.searchParams.set('reklama', '0');
    parsed.searchParams.set('type', 'js');
    const infoUrl = parsed.toString();

    const rawJson = await this._download_webpage(infoUrl, videoId);
    const jsonInfo = JSON.parse(rawJson.slice(rawJson.indexOf('{'), rawJson.lastIndexOf('}') + 1)) as {
      items?: Array<Record<string, unknown>>;
    };

    let item: Record<string, unknown> | undefined;
    for (const i of jsonInfo.items || []) {
      if (i.type === 'video' || i.type === 'stream') {
        item = i;
        break;
      }
    }
    if (!item) throw new ExtractorError('No suitable stream found', { expected: true });

    const formats: Format[] = [];
    for (const fmt of (item.video as Array<Record<string, unknown>>) || []) {
      const videoUrl = fmt.file as string | undefined;
      if (!videoUrl) continue;
      const formatName = String(fmt.format ?? '');
      const quality = String(fmt.quality ?? '');
      const formatId = `${formatName}_${quality}`;
      let ext: string;
      let preference: number | undefined;
      if (formatName === 'mp4' || formatName === 'webm') ext = formatName;
      else if (formatName === 'rtmp') ext = 'flv';
      else if (formatName === 'apple') {
        ext = 'mp4';
        preference = -10;
      } else if (formatName === 'adobe') continue;
      else continue;
      formats.push({
        url: videoUrl,
        ext,
        format_id: formatId,
        quality: QUALITY(quality),
        preference,
      });
    }

    const isLive = item.type === 'stream';
    let timestamp: number | undefined;
    let duration: number | undefined;
    if (!isLive) {
      duration = int_or_none(item.length) ?? undefined;
      const published = item.published as string | undefined;
      if (published) timestamp = parse_iso8601(published.slice(0, -5)) ?? undefined;
    }

    return {
      id: videoId,
      title: String(item.title ?? ''),
      description:
        this._og_search_description(webpage) ||
        this._html_search_meta('description', webpage, 'description', false) ||
        undefined,
      thumbnail: (item.image as string) ?? undefined,
      duration,
      timestamp,
      is_live: isLive,
      formats,
    };
  }
}
