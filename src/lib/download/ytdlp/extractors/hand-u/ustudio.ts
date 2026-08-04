// @ts-nocheck
/** UstudioIE / UstudioEmbedIE â€?ported from yt-dlp ustudio.py */

import { InfoExtractor } from '../../common';
import type { Format, Thumbnail, VideoInfo } from '../../types';
import { int_or_none, unescapeHTML, unified_strdate } from '../../utils';

export class UstudioIE extends InfoExtractor {
  static IE_NAME = 'ustudio';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|v1)\.)?ustudio\.com\/video\/(?<id>[^/]+)\/(?<display_id>[^/?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoId = m.groups!.id!;
    const displayId = m.groups!.display_id!;

    const config = await this._download_webpage(
      `http://v1.ustudio.com/embed/${videoId}/ustudio/config.xml`,
      displayId,
    );

    const extract = (kind: string): Array<{ url: string; width?: number; height?: number }> => {
      const results: Array<{ url: string; width?: number; height?: number }> = [];
      const re = new RegExp(
        `<${kind}\\b([^>]*)\\s*\\/?>|<${kind}\\b([^>]*)>([\\s\\S]*?)<\\/${kind}>`,
        'gi',
      );
      // Prefer attributes on quality/{kind} nodes
      const qualityBlock = config.match(/<qualities>([\s\S]*?)<\/qualities>/i)?.[1] || config;
      for (const qm of qualityBlock.matchAll(
        new RegExp(`<quality>[\\s\\S]*?<${kind}\\b([^>]*?)(?:\\/)?>(?:[\\s\\S]*?<\\/${kind}>)?`, 'gi'),
      )) {
        const attrs = qm[1] || '';
        const urlM = attrs.match(/\burl=["']([^"']+)["']/i);
        if (!urlM?.[1]) continue;
        results.push({
          url: unescapeHTML(urlM[1]),
          width: int_or_none(attrs.match(/\bwidth=["']([^"']+)["']/i)?.[1]) ?? undefined,
          height: int_or_none(attrs.match(/\bheight=["']([^"']+)["']/i)?.[1]) ?? undefined,
        });
      }
      void re;
      return results;
    };

    const formats: Format[] = extract('video').map((item, i) => ({
      format_id: item.height != null ? `${item.height}p` : `http-${i}`,
      url: item.url,
      width: item.width,
      height: item.height,
    }));

    const webpage = await this._download_webpage(url, displayId);
    const title = this._og_search_title(webpage) || displayId;
    const uploadDate = unified_strdate(
      this._search_regex(
        /Uploaded by\s*.+?\s*on\s*<span>([^<]+)<\/span>/s,
        webpage,
        'upload date',
        null,
        false,
      ),
    );
    const uploader = this._search_regex(
      /Uploaded by\s*<a[^>]*>([^<]+)</,
      webpage,
      'uploader',
      null,
      false,
    );

    return {
      id: videoId,
      display_id: displayId,
      title,
      description: this._og_search_description(webpage) || undefined,
      thumbnails: extract('image') as Thumbnail[],
      upload_date: uploadDate || undefined,
      uploader: uploader || undefined,
      formats,
    };
  }
}

export class UstudioEmbedIE extends InfoExtractor {
  static IE_NAME = 'ustudio:embed';
  static _VALID_URL =
    /https?:\/\/(?:(?:app|embed)\.)?ustudio\.com\/embed\/(?<uid>[^/]+)\/(?<id>[^/]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const uploaderId = m.groups!.uid!;
    const videoId = m.groups!.id!;
    const videoData = (
      await this._download_json<{ videos: Array<Record<string, unknown>> }>(
        `http://app.ustudio.com/embed/${uploaderId}/${videoId}/config.json`,
        videoId,
      )
    ).videos[0]!;
    const title = String(videoData.name || videoId);

    const formats: Format[] = [];
    const transcodes = (videoData.transcodes as Record<string, Array<Record<string, unknown>>>) || {};
    for (const [ext, qualitiesList] of Object.entries(transcodes)) {
      for (const quality of qualitiesList || []) {
        const qualityUrl = quality.url as string | undefined;
        if (!qualityUrl) continue;
        const height = int_or_none(quality.height);
        formats.push({
          format_id: height != null ? `${ext}-${height}p` : ext,
          url: qualityUrl,
          width: int_or_none(quality.width) ?? undefined,
          height: height ?? undefined,
        });
      }
    }

    const thumbnails: Thumbnail[] = [];
    for (const image of (videoData.images as Array<Record<string, unknown>>) || []) {
      const imageUrl = image.url as string | undefined;
      if (!imageUrl) continue;
      thumbnails.push({ url: imageUrl });
    }

    return {
      id: videoId,
      title,
      description: videoData.description as string | undefined,
      duration: int_or_none(videoData.duration) ?? undefined,
      uploader_id: uploaderId,
      tags: videoData.keywords as string[] | undefined,
      thumbnails,
      formats,
    };
  }
}
