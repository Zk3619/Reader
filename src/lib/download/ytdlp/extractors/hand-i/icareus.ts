/**
 * IcareusIE — ported from yt-dlp icareus.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  clean_html,
  determine_ext,
  get_element_by_class,
  int_or_none,
  merge_dicts,
  remove_end,
  str_or_none,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, urlencodePostdata } from './_helpers';

const ICAREUS_DOMAINS =
  'asahitv\\.fi|helsinkikanava\\.fi|hyvinvointitv\\.fi|inez\\.fi|permanto\\.fi|suite\\.icareus\\.com|videos\\.minifiddlers\\.org';

function parseBitrate(fmt: string | null | undefined): number | null {
  if (!fmt) return null;
  const m = fmt.match(/\((\d+)\s*k\)/i);
  return m ? int_or_none(m[1]) : null;
}

function parseResolution(fmt: string | null | undefined): { width?: number; height?: number } {
  if (!fmt) return {};
  const xy = fmt.match(/(\d+)x(\d+)/);
  if (xy) {
    return { width: int_or_none(xy[1]) ?? undefined, height: int_or_none(xy[2]) ?? undefined };
  }
  const hp = fmt.match(/(\d+)p/i);
  if (hp) return { height: int_or_none(hp[1]) ?? undefined };
  return {};
}

export class IcareusIE extends InfoExtractor {
  static IE_NAME = 'icareus';
  static _VALID_URL = new RegExp(
    `(?<base_url>https?:\\/\\/(?:www\\.)?(?:${ICAREUS_DOMAINS}))\\/[^?#]+\\/player\\/[^?#]+\\?(?:[^#]+&)?(?:assetId|eventId)=(?<id>\\d+)`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const baseUrl = m.groups!.base_url!;
    const tempId = m.groups!.id!;

    const webpage = await this._download_webpage(url, tempId);
    const videoId = this._search_regex(/_icareus\['itemId'\]\s*=\s*'(\d+)'/, webpage, 'video_id')!;
    const organizationId = this._search_regex(
      /_icareus\['organizationId'\]\s*=\s*'(\d+)'/,
      webpage,
      'organization_id',
    )!;

    const apiBase = this._search_regex(/var\s+publishingServiceURL\s*=\s*"(http[^"]+)";/, webpage, 'api_base')!;
    const icareusToken = this._search_regex(/_icareus\['token'\]\s*=\s*'([a-f0-9]+)'/, webpage, 'icareus_token')!;

    const assets = await this._download_json<Record<string, unknown>>(apiBase, videoId, undefined, {
      data: urlencodePostdata({
        version: '03',
        action: 'getAssetPlaybackUrls',
        organizationId,
        assetId: videoId,
        token: icareusToken,
      }),
    });

    const subtitles: Record<string, Subtitle[]> = {};
    for (const row of (assets.subtitles as [unknown, string, string][]) || []) {
      const sdesc = row[1];
      const surl = url_or_none(row[2]);
      if (!surl) continue;
      const lang = remove_end(sdesc.split(' ')[0] || '', ':') || 'und';
      subtitles[lang] = [{ url: surl, ext: 'vtt' }];
    }

    const formats: Format[] = [];
    for (const item of (assets.audio_urls as Array<Record<string, unknown>>) || []) {
      const audioUrl = url_or_none(item.url);
      if (!audioUrl) continue;
      formats.push({
        format: item.name as string | undefined,
        format_id: 'audio',
        vcodec: 'none',
        url: audioUrl,
        tbr: parseBitrate(String(item.name ?? '')) ?? undefined,
      });
    }

    for (const item of (assets.urls as Array<Record<string, unknown>>) || []) {
      const videoUrl = url_or_none(item.url);
      if (!videoUrl) continue;
      const ext = determine_ext(videoUrl);
      if (ext === 'm3u8') {
        const res = await extractM3u8FormatsAndSubtitles(this, videoUrl, videoId, 'hls');
        formats.push(...res.formats);
        mergeSubtitles(subtitles, res.subtitles);
      } else {
        const fmtName = String(item.name ?? '');
        formats.push({
          url: videoUrl,
          format: fmtName || undefined,
          tbr: parseBitrate(fmtName) ?? undefined,
          format_id: str_or_none(item.id) ?? 'source',
          ...parseResolution(fmtName),
        });
      }
    }

    let info: Record<string, unknown> = {};
    try {
      info = this._search_json_ld(webpage, videoId, { fatal: false });
    } catch {
      info = {};
    }

    let token: string | null = null;
    let liveTitle: string | null = null;
    if (!info || !Object.keys(info).length) {
      token = this._search_regex(
        /data\s*:\s*{action:"getAsset".*?token:'([a-f0-9]+)'}/,
        webpage,
        'token',
        null,
        false,
      );
      if (!token) {
        liveTitle = get_element_by_class('unpublished-info-item future-event-title', webpage);
      }
    }

    if (token) {
      const metadata =
        (await this._download_json<Record<string, unknown>>(
          `${baseUrl}/icareus-suite-api-portlet/publishing`,
          videoId,
          undefined,
          {
            fatal: false,
            data: urlencodePostdata({
              version: '03',
              action: 'getAsset',
              organizationId,
              assetId: videoId,
              languageId: 'en_US',
              userId: '0',
              token,
            }),
          },
        )) || {};
      info = {
        title: metadata.name,
        description: metadata.description,
        timestamp: int_or_none(metadata.date, 1000) ?? undefined,
        duration: int_or_none(metadata.duration) ?? undefined,
        thumbnail: url_or_none(metadata.thumbnailMedium) ?? undefined,
      };
    } else if (liveTitle) {
      info = {
        title: liveTitle,
        description: get_element_by_class('unpublished-info-item future-event-description', webpage) ?? undefined,
        timestamp:
          int_or_none(this._search_regex(/var startEvent\s*=\s*(\d+);/, webpage, 'uploadDate', null, false), 1000) ??
          undefined,
      };
    }

    const thumbUrl = url_or_none(info.thumbnail) || url_or_none(assets.thumbnail);
    const thumbnails = info.thumbnails as VideoInfo['thumbnails'];
    const mergedThumbnails = thumbnails || (thumbUrl ? [{ url: thumbUrl }] : undefined);

    return merge_dicts({
      id: videoId,
      title: info.title as string | undefined,
      formats,
      subtitles,
      description: clean_html(info.description as string | undefined) ?? undefined,
      thumbnails: mergedThumbnails?.[0]?.url ? mergedThumbnails : undefined,
      timestamp: info.timestamp as number | undefined,
      duration: info.duration as number | undefined,
    }) as VideoInfo;
  }
}
