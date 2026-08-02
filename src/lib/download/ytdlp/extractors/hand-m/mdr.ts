/** MDRIE — ported from yt-dlp mdr.py */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  determine_ext,
  int_or_none,
  join_nonempty,
  parse_duration,
  url_or_none,
} from '../../utils';
import { parseIso8601, urljoin, xmlTagText } from './_helpers';

export class MDRIE extends InfoExtractor {
  static IE_NAME = 'mdr';
  static IE_DESC = 'MDR.DE';
  static _GEO_COUNTRIES = ['DE'];
  static _VALID_URL = /https?:\/\/(?:www\.)?mdr\.de\/(?:.*)\/[a-z-]+-?(?<id>\d+)(?:_.+?)?\.html/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const dataUrl = this._search_regex(
      /(?:dataURL|playerXml(?:["'])?)\s*:\s*(["'])(?<url>.+?-avCustom\.xml)\1/,
      webpage,
      'data url',
      undefined,
      true,
      'url',
    )!.replace(/\\\//g, '/');

    const doc = await this._download_webpage(urljoin(url, dataUrl), videoId);
    const title =
      xmlTagText(doc, 'title') ||
      xmlTagText(doc, 'broadcastName') ||
      undefined;
    if (!title) throw new Error('Unable to extract title');

    const type = xmlTagText(doc, 'type');
    const formats: Format[] = [];
    const processed = new Set<string>();

    for (const assetBlock of doc.matchAll(/<asset>([\s\S]*?)<\/asset>/gi)) {
      const asset = assetBlock[1] || '';
      for (const source of [
        'download',
        'progressiveDownload',
        'dynamicHttpStreamingRedirector',
        'adaptiveHttpStreamingRedirector',
      ]) {
        const videoUrl = url_or_none(xmlTagText(asset, `${source}Url`));
        if (!videoUrl || processed.has(videoUrl)) continue;
        processed.add(videoUrl);
        const ext = determine_ext(videoUrl);
        if (ext === 'm3u8') {
          formats.push(
            ...(await this._extract_m3u8_formats(
              videoUrl,
              videoId,
              'mp4',
              'm3u8_native',
              undefined,
              1,
              'HLS',
              undefined,
              false,
            )),
          );
        } else {
          const mediaType = xmlTagText(asset, 'mediaType') || 'MP4';
          const vbr = int_or_none(xmlTagText(asset, 'bitrateVideo'), 1000);
          const abr = int_or_none(xmlTagText(asset, 'bitrateAudio'), 1000);
          const f: Format = {
            url: videoUrl,
            format_id: join_nonempty(mediaType, String(vbr ?? abr ?? '')),
            filesize: int_or_none(xmlTagText(asset, 'fileSize')) ?? undefined,
            abr: abr ?? undefined,
            vbr: vbr ?? undefined,
          };
          if (vbr) {
            f.width = int_or_none(xmlTagText(asset, 'frameWidth')) ?? undefined;
            f.height = int_or_none(xmlTagText(asset, 'frameHeight')) ?? undefined;
          }
          if (type === 'audio') f.vcodec = 'none';
          formats.push(f);
        }
      }
    }

    const timestamp =
      parseIso8601(xmlTagText(doc, 'broadcastDate')) ||
      parseIso8601(xmlTagText(doc, 'broadcastStartDate')) ||
      parseIso8601(xmlTagText(doc, 'broadcastEndDate')) ||
      undefined;

    return {
      id: videoId,
      title,
      description: xmlTagText(doc, 'broadcastDescription') ?? undefined,
      timestamp,
      duration: parse_duration(xmlTagText(doc, 'duration')) ?? undefined,
      uploader: xmlTagText(doc, 'rights') ?? undefined,
      formats,
    };
  }
}
