/**
 * CinemaxIE — ported from yt-dlp cinemax.py (HBOBaseIE._extract_info inlined;
 * HBOBaseIE is not part of this batch). Upstream marks this extractor as
 * broken (_WORKING = False); the main path is ported best-effort.
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import { int_or_none, parse_duration } from '../../utils';
import { xmlTagText } from './_helpers';

const FORMATS_INFO: Record<string, { width: number; height: number }> = {
  pro7: { width: 1280, height: 720 },
  '1920': { width: 1280, height: 720 },
  pro6: { width: 768, height: 432 },
  '640': { width: 768, height: 432 },
  pro5: { width: 640, height: 360 },
  highwifi: { width: 640, height: 360 },
  high3g: { width: 640, height: 360 },
  medwifi: { width: 400, height: 224 },
  med3g: { width: 400, height: 224 },
};

export class CinemaxIE extends InfoExtractor {
  static IE_NAME = 'cinemax';
  static _VALID_URL = /https?:\/\/(?:www\.)?cinemax\.com\/(?<path>[^/]+\/video\/[0-9a-z-]+-(?<id>\d+))/;

  /** yt-dlp HBOBaseIE._extract_info — pragmatic regex-based XML parse. */
  private async _extractInfo(url: string, displayId: string): Promise<VideoInfo> {
    const xml = await this._download_webpage(url, displayId);

    const videoId = xmlTagText(xml, 'id') || displayId;
    const episodeTitle = xmlTagText(xml, 'title') || displayId;
    const series = xmlTagText(xml, 'program');
    const title = series ? `${series} - ${episodeTitle}` : episodeTitle;

    const formats: Format[] = [];
    const sourcesBlock = xml.match(/<videos>[\s\S]*?<sources>([\s\S]*?)<\/sources>/i)?.[1] || '';

    for (const tagMatch of sourcesBlock.matchAll(/<(\w+)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
      const tag = tagMatch[1]!;
      const attrsStr = tagMatch[2] || '';
      const inner = tagMatch[3] || '';
      if (tag === 'size') {
        const path = xmlTagText(inner, 'path');
        if (!path) continue;
        const widthAttr = attrsStr.match(/width="([^"]+)"/)?.[1];
        const info: { width?: number; height?: number } = (widthAttr && FORMATS_INFO[widthAttr]) || {};
        let formatUrl = path;
        let ext: string | undefined;
        let formatId = info.height ? `http-${info.height}p` : 'http';
        const rtmp = path.match(/^(rtmpe?:\/\/[^/]+\/(.+))\/(mp4:.+)$/);
        if (rtmp) {
          formatUrl = rtmp[1]!;
          ext = 'flv';
          formatId = formatId.replace('http', 'rtmp');
        }
        formats.push({
          url: formatUrl,
          format_id: formatId,
          width: info.width,
          height: info.height,
          ext,
        });
      } else {
        const videoUrl = inner.trim();
        if (!videoUrl) continue;
        if (tag === 'tarball') {
          formats.push(
            ...(await this._extract_m3u8_formats(
              videoUrl.replace('.tar', '/base_index_w8.m3u8'),
              videoId,
              'mp4',
              'm3u8_native',
              undefined,
              undefined,
              'hls',
              undefined,
              false,
            )),
          );
        } else if (tag === 'hls') {
          formats.push(
            ...(await this._extract_m3u8_formats(
              videoUrl.replace('.tar', '/base_index.m3u8'),
              videoId,
              'mp4',
              'm3u8_native',
              undefined,
              undefined,
              'hls',
              undefined,
              false,
            )),
          );
        } else if (tag === 'dash') {
          formats.push(
            ...(await this._extract_mpd_formats(videoUrl.replace('.tar', '/manifest.mpd'), videoId, 'dash', undefined, false)),
          );
        } else {
          const info = FORMATS_INFO[tag] || {};
          formats.push({ format_id: `http-${tag}`, url: videoUrl, width: info.width, height: info.height });
        }
      }
    }

    const thumbnails: Thumbnail[] = [];
    const cardSizes = xml.match(/<titleCardSizes>([\s\S]*?)<\/titleCardSizes>/i)?.[1] || '';
    for (const sizeMatch of cardSizes.matchAll(/<size\b([^>]*)>([\s\S]*?)<\/size>/gi)) {
      const path = xmlTagText(sizeMatch[2] || '', 'path');
      if (!path) continue;
      const width = int_or_none(sizeMatch[1]?.match(/width="([^"]+)"/)?.[1]);
      thumbnails.push({ id: width ? String(width) : undefined, url: path, width: width ?? undefined });
    }

    let subtitles: Record<string, Subtitle[]> | undefined;
    const captionUrl = xmlTagText(xml, 'captionUrl');
    if (captionUrl) subtitles = { en: [{ url: captionUrl, ext: 'ttml' }] };

    return {
      id: videoId,
      title,
      duration: parse_duration(xmlTagText(xml, 'tv14') || undefined) ?? undefined,
      series: series || undefined,
      episode: episodeTitle,
      formats,
      thumbnails,
      subtitles,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const path = m.groups!.path!;
    const videoId = m.groups!.id!;
    const info = await this._extractInfo(`https://www.cinemax.com/${path}.xml`, videoId);
    info.id = videoId;
    return info;
  }
}
