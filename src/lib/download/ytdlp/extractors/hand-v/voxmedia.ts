// @ts-nocheck
/**
 * VoxMediaVolumeIE / VoxMediaIE â€?ported from yt-dlp voxmedia.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, try_get, unified_timestamp } from '../../utils';

export class VoxMediaVolumeIE extends InfoExtractor {
  static IE_NAME = 'voxmediavolume';
  static _VALID_URL = /https?:\/\/volume\.vox-cdn\.com\/embed\/(?<id>[0-9a-f]{9})/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const setup = this._parse_json<Record<string, unknown>>(
      this._search_regex(/setup\s*=\s*(\{.+\});/s, webpage, 'setup')!,
      videoId,
    )!;
    const playerSetup = (setup.player_setup as Record<string, unknown>) || setup;
    const videoData = (playerSetup.video as Record<string, unknown>) || {};
    const formattedMetadata = (videoData.formatted_metadata as Record<string, unknown>) || {};

    const info: VideoInfo = {
      id: videoId,
      title:
        strOr(playerSetup.title) ||
        strOr(videoData.title_short) ||
        videoId,
      description:
        strOr(videoData.description_long) ||
        strOr(videoData.description_short) ||
        undefined,
      thumbnail:
        strOr(formattedMetadata.thumbnail) ||
        strOr(videoData.brightcove_thumbnail) ||
        undefined,
      timestamp: unified_timestamp(formattedMetadata.video_publish_date) ?? undefined,
    };

    const asset =
      (try_get(setup, (x) => (x as { embed_assets?: { chorus?: Record<string, unknown> } }).embed_assets?.chorus) as
        | Record<string, unknown>
        | undefined) || {};

    const formats: Format[] = [];
    const hlsUrl = asset.hls_url as string | undefined;
    if (hlsUrl) {
      formats.push(
        ...(await this._extract_m3u8_formats(
          hlsUrl,
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
    }
    const mp4Url = asset.mp4_url as string | undefined;
    if (mp4Url) {
      const tbr = this._search_regex(/-(\d+)k\./, mp4Url, 'bitrate', null, false);
      let formatId = 'http';
      if (tbr) formatId += `-${tbr}`;
      formats.push({
        format_id: formatId,
        url: mp4Url,
        tbr: int_or_none(tbr) ?? undefined,
      });
    }

    if (formats.length) {
      info.formats = formats;
      info.duration = int_or_none(asset.duration) ?? undefined;
      return info;
    }

    for (const providerVideoType of ['youtube', 'brightcove'] as const) {
      const providerVideoId = videoData[`${providerVideoType}_id`];
      if (!providerVideoId) continue;
      if (providerVideoType === 'brightcove') {
        throw new ExtractorError('Vox Brightcove embeds are currently unsupported', { expected: true });
      }
      info._type = 'url_transparent';
      info.url = String(providerVideoId);
      info.ie_key = 'Youtube';
      return info;
    }
    throw new ExtractorError('Unable to find provider video id', { expected: true });
  }
}

function strOr(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

export class VoxMediaIE extends InfoExtractor {
  static IE_NAME = 'voxmedia';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?(?:(?:theverge|vox|sbnation|eater|polygon|curbed|racked|funnyordie)\.com|recode\.net)\/(?:[^/]+\/)*(?<id>[^/?]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = decodeURIComponent(await this._download_webpage(url, displayId));

    const createEntry = (
      providerVideoId: string,
      providerVideoType: string,
      title?: string | null,
      description?: string | null,
    ): VideoInfo => {
      const videoUrl =
        providerVideoType === 'youtube'
          ? providerVideoId
          : `http://volume.vox-cdn.com/embed/${providerVideoId}`;
      return {
        _type: 'url_transparent',
        url: videoUrl,
        id: providerVideoId,
        title: title || this._og_search_title(webpage) || displayId,
        description: description || this._og_search_description(webpage) || undefined,
        ie_key: providerVideoType === 'youtube' ? 'Youtube' : VoxMediaVolumeIE.IE_NAME,
      };
    };

    const entries: VideoInfo[] = [];
    const entriesDataRaw = this._search_regex(
      [
        /Chorus\.VideoContext\.addVideo\((\[\{.+\}\])\);/s,
        /var\s+entry\s*=\s*(\{.+\});/s,
        /SBN\.VideoLinkset\.entryGroup\(\s*(\[.+])/s,
      ],
      webpage,
      'video data',
      null,
      false,
    );
    if (entriesDataRaw) {
      let entriesData = this._parse_json<unknown>(entriesDataRaw, displayId);
      if (entriesData && !Array.isArray(entriesData)) entriesData = [entriesData];
      for (const videoData of (entriesData as Array<Record<string, unknown>>) || []) {
        const providerVideoId = videoData.provider_video_id as string | undefined;
        const providerVideoType = videoData.provider_video_type as string | undefined;
        if (providerVideoId && providerVideoType) {
          entries.push(
            createEntry(
              providerVideoId,
              providerVideoType,
              videoData.title as string | undefined,
              videoData.description as string | undefined,
            ),
          );
        }
      }
    }

    const volumeUuid = this._search_regex(
      /data-volume-uuid="([^"]+)"/,
      webpage,
      'volume uuid',
      null,
      false,
    );
    if (volumeUuid) entries.push(createEntry(volumeUuid, 'volume'));

    if (entries.length === 1) return entries[0]!;
    return this.playlist_result(
      entries,
      displayId,
      this._og_search_title(webpage),
      this._og_search_description(webpage),
    );
  }
}
