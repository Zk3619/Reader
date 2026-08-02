/**
 * CNNIE / CNNIndonesiaIE — ported from yt-dlp cnn.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { clean_html, extract_attributes, int_or_none, str_or_none, update_url_query, url_or_none } from '../../utils';
import { parseIso8601 } from './_helpers';

export class CNNIE extends InfoExtractor {
  static IE_NAME = 'CNN';
  static _VALID_URL =
    /https?:\/\/(?:(?:edition|www|money|cnnespanol)\.)?cnn\.com\/(?!audio\/)(?<display_id>[^?#]+?)(?:[?#]|$|\/index\.html)/;

  private async _extractOne(playerData: Record<string, string>, appId: string | null): Promise<VideoInfo> {
    const mediaId = playerData['data-media-id']!;
    const parentUri = playerData['data-video-resource-parent-uri'];
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};

    let videoData: Record<string, unknown> = {};
    if (parentUri) {
      videoData = await this._download_json<Record<string, unknown>>(
        'https://fave.api.cnn.io/v1/video',
        mediaId,
        undefined,
        { fatal: false, query: { id: mediaId, stellarUri: parentUri } },
      );
      const files = Array.isArray(videoData.files) ? (videoData.files as Record<string, unknown>[]) : [];
      for (const file of files) {
        const directUrl = url_or_none(file?.fileUri);
        if (!directUrl) continue;
        const resMatch = /-(?<res>\d+x\d+)_(?<tbr>\d+)k\.mp4/.exec(directUrl);
        const width = resMatch ? Number(resMatch.groups!.res!.split('x')[0]) : undefined;
        const height = resMatch ? Number(resMatch.groups!.res!.split('x')[1]) : undefined;
        formats.push({
          url: directUrl,
          format_id: 'direct',
          quality: 1,
          tbr: int_or_none(resMatch?.groups?.tbr) ?? undefined,
          width,
          height,
        });
      }
      const closedCaptions = (videoData.closedCaptions as Record<string, unknown>) || {};
      const types = Array.isArray(closedCaptions.types) ? (closedCaptions.types as Record<string, unknown>[]) : [];
      for (const t of types) {
        const track = (t?.track as Record<string, unknown>) || {};
        const subUrl = url_or_none(track.url);
        if (!subUrl) continue;
        const lang = str_or_none(t.lang) || 'en';
        (subtitles[lang] ||= []).push({ url: subUrl, name: str_or_none(t.label) ?? undefined, ext: 'vtt' });
      }
    }

    if (appId) {
      const mediaData = await this._download_json<Record<string, unknown>>(
        `https://medium.ngtv.io/v2/media/${mediaId}/desktop`,
        mediaId,
        undefined,
        { fatal: false, query: { appId } },
      );
      const media = (mediaData.media as Record<string, unknown>) || {};
      const desktop = (media.desktop as Record<string, unknown>) || {};
      const unprotected = (desktop.unprotected as Record<string, unknown>) || {};
      const unencrypted = (unprotected.unencrypted as Record<string, unknown>) || {};
      const m3u8Url = url_or_none(unencrypted.url);
      if (m3u8Url) {
        const fmts = await this._extract_m3u8_formats(m3u8Url, mediaId, 'mp4', 'm3u8_native', undefined, undefined, 'hls', undefined, false);
        formats.push(...fmts);
      }
    }

    const thumbnailRaw = playerData['data-poster-image-override'];
    let thumbnail: string | undefined;
    if (thumbnailRaw) {
      try {
        const parsed = JSON.parse(thumbnailRaw) as { big?: { uri?: string } };
        const uri = url_or_none(parsed.big?.uri);
        thumbnail = uri ? update_url_query(uri, { c: 'original' }) : undefined;
      } catch {
        /* ignore */
      }
    }

    return {
      id: mediaId,
      title:
        str_or_none((videoData as Record<string, unknown>).headline) ||
        clean_html(playerData['data-headline']) ||
        undefined,
      description:
        clean_html(str_or_none((videoData as Record<string, unknown>).description)) ||
        clean_html(playerData['data-description']) ||
        undefined,
      duration: int_or_none(videoData.trt) ?? (playerData['data-duration'] ? Number(playerData['data-duration']) : undefined),
      timestamp:
        int_or_none((videoData.dateCreated as Record<string, unknown>)?.uts, 1000) ??
        parseIso8601(playerData['data-publish-date']) ??
        undefined,
      modified_timestamp: int_or_none((videoData.lastModified as Record<string, unknown>)?.uts, 1000) ?? undefined,
      display_id: playerData['data-video-slug'],
      thumbnail,
      formats,
      subtitles,
    };
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_valid_url(url)!.groups!.display_id!;
    const webpage = await this._download_webpage(url, displayId);
    const envRaw = this._search_json<Record<string, unknown>>(/window\.env\s*=/, webpage, 'window env', displayId, {
      fatal: false,
      default: {},
    });
    const appId = str_or_none(envRaw?.TOP_AUTH_SERVICE_APP_ID);

    const entries: VideoInfo[] = [];
    const divRe = /<div\b[^>]*\bdata-component-name=["']video-player["'][^>]*>/gi;
    let dm: RegExpExecArray | null;
    while ((dm = divRe.exec(webpage))) {
      const attrs = extract_attributes(dm[0]);
      if (!attrs['data-media-id']) continue;
      entries.push(await this._extractOne(attrs, appId));
    }

    if (entries.length === 1) {
      return { ...entries[0]!, display_id: displayId };
    }
    return this.playlist_result(entries, displayId);
  }
}

export class CNNIndonesiaIE extends InfoExtractor {
  static IE_NAME = 'CNNIndonesia';
  static _VALID_URL =
    /https?:\/\/www\.cnnindonesia\.com\/[\w-]+\/(?<upload_date>\d{8})\d+-\d+-(?<id>\d+)\/(?<display_id>[\w-]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const uploadDate = m.groups!.upload_date!;
    const videoId = m.groups!.id!;
    const webpage = await this._download_webpage(url, m.groups!.display_id!);

    let embedUrl: string | undefined;
    const jsonLdScripts = webpage.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>\s*([\s\S]*?)\s*<\/script>/gi) || [];
    for (const block of jsonLdScripts) {
      const inner = block.match(/<script[^>]*>\s*([\s\S]*?)\s*<\/script>/i)?.[1];
      if (!inner) continue;
      try {
        const parsed = JSON.parse(inner);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (item?.['@type'] === 'VideoObject' && item.embedUrl) {
            embedUrl = String(item.embedUrl);
            break;
          }
        }
      } catch {
        /* ignore */
      }
      if (embedUrl) break;
    }

    const keywords = this._html_search_meta('keywords', webpage, undefined, false);
    const tags = keywords ? keywords.split(', ').filter(Boolean) : undefined;

    return {
      _type: 'url_transparent',
      id: videoId,
      url: embedUrl || url,
      upload_date: uploadDate,
      tags,
    };
  }
}
