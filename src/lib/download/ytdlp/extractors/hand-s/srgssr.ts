/** SRGSSRIE / SRGSSRPlayIE — ported from yt-dlp srgssr.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  float_or_none,
  int_or_none,
  join_nonempty,
  try_get,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, parse_iso8601 } from './_helpers';

const QUALITY_ORDER = ['SD', 'HD'];
function qualityRank(q: string | undefined): number {
  const idx = QUALITY_ORDER.indexOf(q || '');
  return idx >= 0 ? idx : -1;
}

export class SRGSSRIE extends InfoExtractor {
  static IE_NAME = 'srgssr';
  static _GEO_COUNTRIES = ['CH'];
  static _VALID_URL =
    /(?:https?:\/\/tp\.srgssr\.ch\/p(?:\/[^/]+)+\?urn=urn|srgssr):(?<bu>srf|rts|rsi|rtr|swi):(?:[^:]+:)?(?<type>video|audio):(?<id>[0-9a-f\-]{36}|\d+)/;

  static _ERRORS: Record<string, string> = {
    AGERATING12:
      'To protect children under the age of 12, this video is only available between 8 p.m. and 6 a.m.',
    AGERATING18:
      'To protect children under the age of 18, this video is only available between 11 p.m. and 5 a.m.',
    GEOBLOCK: 'For legal reasons, this video is only available in Switzerland.',
    LEGAL: 'The video cannot be transmitted for legal reasons.',
    STARTDATE: 'This video is not yet available. Please try again later.',
  };

  static _DEFAULT_LANGUAGE_CODES: Record<string, string> = {
    srf: 'de',
    rts: 'fr',
    rsi: 'it',
    rtr: 'rm',
    swi: 'en',
  };

  protected async _getTokenizedSrc(url: string, videoId: string, formatId: string): Promise<string> {
    const token =
      (await this._download_json<{ token?: { authparams?: string } }>(
        'http://tp.srgssr.ch/akahd/token?acl=*',
        videoId,
        `Downloading ${formatId} token`,
        { fatal: false },
      )) || {};
    const authParams = try_get(token, (x) => x.token?.authparams) as string | undefined;
    if (authParams) return url + (url.includes('?') ? '&' : '?') + authParams;
    return url;
  }

  protected async _getMediaData(
    bu: string,
    mediaType: string,
    mediaId: string,
  ): Promise<Record<string, unknown>> {
    const query: Record<string, string> = mediaType === 'video' ? { onlyChapters: 'true' } : {};
    const fullMediaData = (
      await this._download_json<{ chapterList?: Record<string, unknown>[] }>(
        `https://il.srgssr.ch/integrationlayer/2.0/${bu}/mediaComposition/${mediaType}/${mediaId}.json`,
        mediaId,
        undefined,
        { query },
      )
    ).chapterList || [];
    const mediaData = fullMediaData.find((x) => x.id === mediaId);
    if (!mediaData) throw new ExtractorError('No media information found');

    const blockReason = mediaData.blockReason as string | undefined;
    if (blockReason && SRGSSRIE._ERRORS[blockReason]) {
      const message = SRGSSRIE._ERRORS[blockReason]!;
      if (blockReason === 'GEOBLOCK') this.raise_geo_restricted(message, SRGSSRIE._GEO_COUNTRIES);
      throw new ExtractorError(`${this.IE_NAME} said: ${message}`, { expected: true });
    }
    return mediaData;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const bu = m.groups!.bu!.slice(0, 3);
    const mediaType = m.groups!.type!;
    const mediaId = m.groups!.id!;
    const mediaData = await this._getMediaData(bu, mediaType, mediaId);
    const title = String(mediaData.title || mediaId);

    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};

    for (const source of (mediaData.resourceList as Record<string, unknown>[]) || []) {
      const formatUrl = source.url as string | undefined;
      if (!formatUrl) continue;
      const protocol = source.protocol as string | undefined;
      const quality = source.quality as string | undefined;
      const formatId = join_nonempty(protocol, source.encoding as string, quality);

      if (protocol === 'HDS' || protocol === 'HLS') {
        if (source.tokenType === 'AKAMAI') {
          const tokenized = await this._getTokenizedSrc(formatUrl, mediaId, formatId);
          const res = await extractM3u8FormatsAndSubtitles(this, tokenized, mediaId, formatId);
          formats.push(...res.formats);
          mergeSubtitles(subtitles, res.subtitles);
        } else if (protocol === 'HLS') {
          const res = await extractM3u8FormatsAndSubtitles(this, formatUrl, mediaId, formatId);
          formats.push(...res.formats);
          mergeSubtitles(subtitles, res.subtitles);
        }
      } else if (protocol === 'HTTP' || protocol === 'HTTPS') {
        formats.push({
          format_id: formatId,
          url: formatUrl,
          quality: qualityRank(quality),
        });
      }
    }

    if (int_or_none(mediaData.position) === 0) {
      for (const p of ['S', 'H']) {
        const podcastUrl = mediaData[`podcast${p}dUrl`] as string | undefined;
        if (!podcastUrl) continue;
        const qLabel = `${p}D`;
        formats.push({
          format_id: `PODCAST-${qLabel}`,
          url: podcastUrl,
          quality: qualityRank(qLabel),
        });
      }
    }

    if (mediaType === 'video') {
      for (const sub of (mediaData.subtitleList as Record<string, unknown>[]) || []) {
        const subUrl = sub.url as string | undefined;
        if (!subUrl) continue;
        const lang = (sub.locale as string) || SRGSSRIE._DEFAULT_LANGUAGE_CODES[bu] || 'de';
        (subtitles[lang] ||= []).push({ url: subUrl, ext: 'vtt' });
      }
    }

    return {
      id: mediaId,
      title,
      description: (mediaData.description as string) || undefined,
      timestamp: parse_iso8601(mediaData.date) ?? undefined,
      thumbnail: (mediaData.imageUrl as string) || undefined,
      duration: float_or_none(mediaData.duration, 1000) ?? undefined,
      subtitles,
      formats,
    };
  }
}

export class SRGSSRPlayIE extends InfoExtractor {
  static IE_NAME = 'srgssr:play';
  static IE_DESC = 'srf.ch, rts.ch, rsi.ch, rtr.ch and swissinfo.ch play sites';
  static _VALID_URL =
    /https?:\/\/(?:(?:www|play)\.)?(?<bu>srf|rts|rsi|rtr|swissinfo)\.ch\/play\/(?:tv|radio)\/(?:[^/]+\/(?<type>video|audio)\/[^?]+|popup(?<type_2>video|audio)player)\?.*?\b(?:id=|urn=urn:[^:]+:video:)(?<id>[0-9a-f\-]{36}|\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    let bu = m.groups!.bu!;
    if (bu === 'swissinfo') bu = 'swi';
    else bu = bu.slice(0, 3);
    const mediaType = m.groups!.type || m.groups!.type_2;
    const mediaId = m.groups!.id!;
    return this.url_result(`srgssr:${bu}:${mediaType}:${mediaId}`, 'SRGSSR');
  }
}
