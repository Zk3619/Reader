// @ts-nocheck
/** ViideaIE â€?ported from yt-dlp viidea.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { js_to_json, parse_duration } from '../../utils';
import { extractSmilMediaUrls, parse_iso8601, protoRelative, urljoin } from './_helpers';

export class ViideaIE extends InfoExtractor {
  static IE_NAME = 'viidea';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:videolectures\.net|flexilearn\.viidea\.net|presentations\.ocwconsortium\.org|video\.travel-zoom\.si|video\.pomp-forum\.si|tv\.nil\.si|video\.hekovnik\.com|video\.szko\.si|kpk\.viidea\.com|inside\.viidea\.net|video\.kiberpipa\.org|bvvideo\.si|kongres\.viidea\.net|edemokracija\.viidea\.com)(?:\/lecture)?\/(?<id>[^/]+)(?:\/video\/(?<part>\d+))?\/*(?:[#?].*)?$/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const lectureSlug = m.groups!.id!;
    const explicitPartId = m.groups!.part;

    const webpage = await this._download_webpage(url, lectureSlug);
    const cfg = this._parse_json<Record<string, unknown>>(
      this._search_regex(
        [
          /cfg\s*:\s*({.+?})\s*,\s*[\da-zA-Z_]+\s*:\s*\(?\s*function/s,
          /cfg\s*:\s*({[^}]+})/,
        ],
        webpage,
        'cfg',
      )!,
      lectureSlug,
      js_to_json,
    )!;

    const lectureId = String(cfg.obj_id);
    const baseUrlRaw = String(cfg.livepipe || '');
    const baseUrl = baseUrlRaw.startsWith('//') ? `http:${baseUrlRaw}` : protoRelative(baseUrlRaw);

    let lectureData: Record<string, unknown>;
    try {
      lectureData = (
        await this._download_json<{ lecture: Array<Record<string, unknown>> }>(
          `${baseUrl}/site/api/lecture/${lectureId}?format=json`,
          lectureId,
        )
      ).lecture[0]!;
    } catch (e) {
      throw e instanceof ExtractorError
        ? e
        : new ExtractorError(String(e), { expected: true });
    }

    const lectureInfo: Partial<VideoInfo> = {
      id: lectureId,
      display_id: lectureSlug,
      title: String(lectureData.title || lectureSlug),
      timestamp: parse_iso8601(lectureData.time) ?? undefined,
      description:
        lectureData.description_wiki != null
          ? String(lectureData.description_wiki)
          : undefined,
      thumbnail: lectureData.thumb != null ? String(lectureData.thumb) : undefined,
    };

    const playlistEntries: VideoInfo[] = [];
    const lectureType = lectureData.type as string | undefined;
    const parts = ((cfg.videos as unknown[]) || []).map((v) => String(v));

    const extractPart = async (partId: string): Promise<VideoInfo> => {
      const smilUrl = `${baseUrl}/${lectureSlug}/video/${partId}/smil.xml`;
      const smilXml = await this._download_webpage(smilUrl, lectureId);
      const mediaUrls = extractSmilMediaUrls(smilXml);
      const formats: Format[] = mediaUrls.map((u, i) => ({
        url: u,
        format_id: `smil-${i}`,
      }));
      const multipart = parts.length > 1;
      const switchDur = /<switch[^>]*\bdur=["']([^"']+)/i.exec(smilXml)?.[1];
      const info: VideoInfo = {
        id: multipart ? `${lectureId}_part${partId}` : lectureId,
        display_id: multipart ? `${lectureSlug}_part${partId}` : lectureSlug,
        title: multipart
          ? `${lectureInfo.title} (Part ${partId})`
          : String(lectureInfo.title),
        formats,
        duration: parse_duration(switchDur) ?? undefined,
        thumbnail: lectureInfo.thumbnail,
        timestamp: lectureInfo.timestamp,
        description: lectureInfo.description,
      };
      return info;
    };

    if (parts.length) {
      const multipart = parts.length > 1;
      let result: VideoInfo;
      if (explicitPartId || !multipart) {
        result = await extractPart(explicitPartId || parts[0]!);
      } else {
        const entries: VideoInfo[] = [];
        for (const part of parts) entries.push(await extractPart(part));
        result = {
          _type: 'multi_video',
          entries,
          ...lectureInfo,
          id: lectureId,
          title: String(lectureInfo.title),
        } as VideoInfo;
      }

      if (explicitPartId || lectureType !== 'evt') return result;
      playlistEntries.push(result);
    }

    if (!parts.length || lectureType === 'evt') {
      const playlistWebpage = await this._download_webpage(
        `${baseUrl}/site/ajax/drilldown/?id=${lectureId}`,
        lectureId,
      );
      for (const [, videoUrl] of playlistWebpage.matchAll(
        /<a[^>]+href=(["'])(.+?)\1[^>]+id=["']lec=\d+/g,
      )) {
        playlistEntries.push(this.url_result(urljoin(url, videoUrl!), 'viidea'));
      }
    }

    const playlist = this.playlist_result(playlistEntries, lectureId);
    return { ...playlist, ...lectureInfo, id: lectureId, title: String(lectureInfo.title) };
  }
}
