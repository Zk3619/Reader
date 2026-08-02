/** Sport5IE — ported from yt-dlp sport5.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';

function xmlText(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m?.[1]?.trim() ?? null;
}

function xmlAttrBlocks(xml: string, tag: string): Array<{ text: string; attrs: Record<string, string> }> {
  const out: Array<{ text: string; attrs: Record<string, string> }> = [];
  const re = new RegExp(`<${tag}([^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'g');
  for (const m of xml.matchAll(re)) {
    const attrs: Record<string, string> = {};
    for (const am of (m[1] || '').matchAll(/(\w+)=["']([^"']*)["']/g)) attrs[am[1]!] = am[2]!;
    out.push({ attrs, text: (m[2] || '').trim() });
  }
  return out;
}

export class Sport5IE extends InfoExtractor {
  static IE_NAME = 'sport5';
  static _VALID_URL = /https?:\/\/(?:www|vod)?\.sport5\.co\.il\/.*\b(?:Vi|docID)=(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const mediaId = this._match_id(url);
    const webpage = await this._download_webpage(url, mediaId);
    const videoId = this._html_search_regex(/clipId=([\w-]+)/, webpage, 'video id')!;
    const metadataXml = await this._download_webpage(
      `http://sport5-metadata-rr-d.nsacdn.com/vod/vod/${videoId}/HDS/metadata.xml`,
      videoId,
    );
    const errorName = xmlText(metadataXml, 'Name');
    if (metadataXml.includes('<Error') && errorName) {
      throw new ExtractorError(
        `${Sport5IE.IE_NAME} returned error: ${errorName} - ${xmlText(metadataXml, 'Description')}`,
        { expected: true },
      );
    }
    const title = xmlText(metadataXml, 'Title') || videoId;
    const description = xmlText(metadataXml, 'Description') || undefined;
    const duration = parseInt(xmlText(metadataXml, 'Duration') || '0', 10) || undefined;
    const thumbnails: Thumbnail[] = [];
    for (const block of xmlAttrBlocks(metadataXml, 'PosterIMG')) {
      thumbnails.push({
        url: block.text,
        width: parseInt(block.attrs.width || '0', 10) || undefined,
        height: parseInt(block.attrs.height || '0', 10) || undefined,
      });
    }
    const categories: string[] = [];
    for (const block of xmlAttrBlocks(metadataXml, 'Category')) {
      if (block.attrs.name) categories.push(block.attrs.name);
    }
    const formats: Format[] = [];
    for (const block of xmlAttrBlocks(metadataXml, 'FileURL')) {
      formats.push({
        url: block.text,
        format_id: block.attrs.bitrate || 'http',
        ext: 'mp4',
        vbr: parseInt(block.attrs.bitrate || '0', 10) || undefined,
        width: parseInt(block.attrs.width || '0', 10) || undefined,
        height: parseInt(block.attrs.height || '0', 10) || undefined,
      });
    }
    return { id: videoId, title, description, thumbnails, duration, categories, formats };
  }
}
