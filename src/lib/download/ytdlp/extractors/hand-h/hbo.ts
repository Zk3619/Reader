/**
 * HBOBaseIE / HBOIE — ported from yt-dlp hbo.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import { int_or_none, parse_duration } from '../../utils';
import { urljoin, xmlTagText } from './_helpers';

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

export class HBOBaseIE extends InfoExtractor {
  static IE_NAME = 'hbobase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('HBOBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _extractInfo(url: string, displayId: string): Promise<VideoInfo> {
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
        const info = widthAttr ? FORMATS_INFO[widthAttr] : undefined;
        let formatUrl = path;
        let ext: string | undefined;
        let formatId = info?.height ? `http-${info.height}p` : 'http';
        const rtmp = path.match(/^(rtmpe?:\/\/[^/]+\/(.+))\/(mp4:.+)$/);
        if (rtmp) {
          formatUrl = rtmp[1]!;
          ext = 'flv';
          formatId = formatId.replace('http', 'rtmp');
        }
        formats.push({
          url: formatUrl,
          format_id: formatId,
          width: info?.width,
          height: info?.height,
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
          const m3u8Formats = await this._extract_m3u8_formats(
            videoUrl.replace('.tar', '/base_index.m3u8'),
            videoId,
            'mp4',
            'm3u8_native',
            undefined,
            undefined,
            'hls',
            undefined,
            false,
          );
          for (const f of m3u8Formats) {
            if (f.vcodec === 'none' && !f.tbr) {
              const tbr = this._search_regex(/-(\d+)k\//, f.url || '', 'tbr', null, false, 1);
              if (tbr) f.tbr = int_or_none(tbr) ?? undefined;
            }
          }
          formats.push(...m3u8Formats);
        } else if (tag === 'dash') {
          formats.push(
            ...(await this._extract_mpd_formats(videoUrl.replace('.tar', '/manifest.mpd'), videoId, 'dash', undefined, false)),
          );
        } else {
          const info = FORMATS_INFO[tag];
          formats.push({
            format_id: `http-${tag}`,
            url: videoUrl,
            width: info?.width,
            height: info?.height,
          });
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
      duration: parse_duration(xmlTagText(xml, 'duration/tv14') || xmlTagText(xml, 'tv14') || undefined) ?? undefined,
      series: series || undefined,
      episode: episodeTitle,
      formats,
      thumbnails,
      subtitles,
    };
  }
}

export class HBOIE extends HBOBaseIE {
  static IE_NAME = 'hbo';
  static _VALID_URL = /https?:\/\/(?:www\.)?hbo\.com\/(?:video|embed)(?:\/[^/]+)*\/(?<id>[^/?#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const stateRaw = this._html_search_regex(/data-state="({.+?})"/, webpage, 'state');
    const state = this._parse_json<{ video?: { locationUrl?: string } }>(stateRaw, displayId);
    const locationPath = state?.video?.locationUrl;
    if (!locationPath) {
      throw new ExtractorError('Unable to find video location URL', { expected: true });
    }
    return this._extractInfo(urljoin(url, locationPath), displayId);
  }
}
