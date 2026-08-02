/**
 * BRIE — ported from yt-dlp br.py (Bayerischer Rundfunk)
 * No XML DOM parser is available in this runtime; a lightweight regex-based
 * scanner is used to walk the (well-formed, non-nested) upstream XML feed.
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { int_or_none, parse_duration } from '../../utils';

function xmlFindTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? m[1]!.trim() : null;
}

function xmlFindBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}>`, 'gi');
  return xml.match(re) || [];
}

function xmlOpenTagAttr(block: string, tag: string, attr: string): string | null {
  const m = block.match(new RegExp(`<${tag}([^>]*)>`, 'i'));
  if (!m) return null;
  const am = m[1]!.match(new RegExp(`${attr}="([^"]*)"`, 'i'));
  return am ? am[1]! : null;
}

export class BRIE extends InfoExtractor {
  static IE_NAME = 'br';
  static IE_DESC = 'Bayerischer Rundfunk';
  static _VALID_URL = /(?<base_url>https?:\/\/(?:www\.)?br(?:-klassik)?\.de)\/(?:[a-z0-9\-_]+\/)+(?<id>[a-z0-9\-_]+)\.html/;

  protected async _extractFormats(assetsXml: string, mediaId: string): Promise<Format[]> {
    const formats: Format[] = [];
    for (const asset of xmlFindBlocks(assetsXml, 'asset')) {
      const downloadUrl = xmlFindTag(asset, 'downloadUrl') || xmlFindTag(asset, 'url');
      const assetType = xmlOpenTagAttr(asset, 'asset', 'type') || '';
      if (!downloadUrl) continue;
      if (assetType.startsWith('HLS')) {
        formats.push(
          ...(await this._extract_m3u8_formats(downloadUrl, mediaId, 'mp4', 'm3u8_native', undefined, undefined, 'hds', undefined, false)),
        );
        continue;
      }
      if (assetType.startsWith('HDS')) {
        this.report_warning('HDS formats are not supported');
        continue;
      }
      const width = int_or_none(xmlFindTag(asset, 'frameWidth'));
      const height = int_or_none(xmlFindTag(asset, 'frameHeight'));
      formats.push({
        format_id: `http-${assetType}`,
        url: downloadUrl,
        ext: xmlFindTag(asset, 'mediaType') || undefined,
        width: width ?? undefined,
        height: height ?? undefined,
        tbr: int_or_none(xmlFindTag(asset, 'bitrateVideo')) ?? undefined,
        abr: int_or_none(xmlFindTag(asset, 'bitrateAudio')) ?? undefined,
        vcodec: xmlFindTag(asset, 'codecVideo') || undefined,
        acodec: xmlFindTag(asset, 'codecAudio') || undefined,
        container: xmlFindTag(asset, 'mediaType') || undefined,
        filesize: int_or_none(xmlFindTag(asset, 'size')) ?? undefined,
      });
    }
    return formats;
  }

  protected _extractThumbnails(variantsXml: string, baseUrl: string): Thumbnail[] {
    const thumbnails: Thumbnail[] = [];
    for (const variant of xmlFindBlocks(variantsXml, 'variant')) {
      const path = xmlFindTag(variant, 'url');
      if (!path) continue;
      thumbnails.push({
        url: baseUrl + path,
        width: int_or_none(xmlFindTag(variant, 'width')),
        height: int_or_none(xmlFindTag(variant, 'height')),
      });
    }
    thumbnails.sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0));
    return thumbnails;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const baseUrl = m.groups!.base_url!;
    const displayId = m.groups!.id!;
    const page = await this._download_webpage(url, displayId);
    const xmlUrl = this._search_regex(
      /return BRavFramework\.register\(BRavFramework\('avPlayer_(?:[a-f0-9-]{36})'\)\.setup\(\{dataURL:'(\/(?:[a-z0-9-]+\/)+[a-z0-9/~_.-]+)'\}\)\);/,
      page,
      'XMLURL',
    );
    const xml = await this._download_webpage(baseUrl + xmlUrl, displayId);

    const medias: VideoInfo[] = [];
    for (const xmlMedia of [...xmlFindBlocks(xml, 'video'), ...xmlFindBlocks(xml, 'audio')]) {
      const openTagMatch = xmlMedia.match(/^<[a-zA-Z]+([^>]*)>/);
      const mediaId = (openTagMatch?.[1]?.match(/externalId="([^"]*)"/)?.[1]) || undefined;
      const assetsBlock = xmlFindTag(xmlMedia, 'assets') || '';
      const teaserBlock = xmlFindTag(xmlMedia, 'teaserImage') || '';
      const variantsBlock = xmlFindTag(teaserBlock, 'variants') || '';
      const broadcastDate = xmlFindTag(xmlMedia, 'broadcastDate');
      const media: VideoInfo = {
        id: mediaId || displayId,
        title: xmlFindTag(xmlMedia, 'title') || displayId,
        duration: parse_duration(xmlFindTag(xmlMedia, 'duration')) ?? undefined,
        formats: await this._extractFormats(assetsBlock, mediaId || displayId),
        thumbnails: this._extractThumbnails(variantsBlock, baseUrl),
        description: xmlFindTag(xmlMedia, 'desc') || undefined,
        webpage_url: xmlFindTag(xmlMedia, 'permalink') || undefined,
        uploader: xmlFindTag(xmlMedia, 'author') || undefined,
      };
      if (broadcastDate) {
        media.upload_date = broadcastDate.split('.').reverse().join('');
      }
      medias.push(media);
    }

    if (medias.length > 1) {
      this.report_warning('found multiple medias; please report this with the video URL');
    }
    if (!medias.length) throw new ExtractorError('No media entries found');
    return medias[0]!;
  }
}
