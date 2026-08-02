/**
 * CHZZKLiveIE / CHZZKVideoIE — ported from yt-dlp chzzk.py
 */

import { InfoExtractor } from '../../common';
import type { Format, Subtitle, Thumbnail, VideoInfo } from '../../types';
import { float_or_none, int_or_none, str_or_none, traverse_obj, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, parseIso8601, UserNotLive } from './_helpers';

export class CHZZKLiveIE extends InfoExtractor {
  static IE_NAME = 'chzzk:live';
  static _VALID_URL = /https?:\/\/chzzk\.naver\.com\/live\/(?<id>[\da-f]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelId = this._match_id(url);
    const response = await this._download_json<{ content: Record<string, unknown> }>(
      `https://api.chzzk.naver.com/service/v3/channels/${channelId}/live-detail`,
      channelId,
      'Downloading channel info',
    );
    const liveDetail = response.content;

    if (liveDetail.status === 'CLOSE') throw new UserNotLive(channelId);

    const livePlayback = this._parse_json<Record<string, unknown>>(
      String(liveDetail.livePlaybackJson),
      channelId,
    )!;

    const thumbnails: Thumbnail[] = [];
    const thumbnailTemplate = url_or_none(
      traverse_obj(livePlayback, ['thumbnail', 'snapshotThumbnailTemplate']),
    );
    if (thumbnailTemplate?.includes('{type}')) {
      const types = traverse_obj(livePlayback, ['thumbnail', 'types'], { get_all: true }) as string[];
      for (const width of types || []) {
        if (!width) continue;
        thumbnails.push({
          id: width,
          url: thumbnailTemplate.replace('{type}', width),
          width: int_or_none(width) ?? undefined,
        });
      }
    }

    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    const mediaItems = traverse_obj(livePlayback, ['media'], { get_all: false }) as
      | Array<Record<string, unknown>>
      | undefined;
    for (const media of mediaItems || []) {
      const path = url_or_none(media.path);
      if (!path) continue;
      const isLowLatency = media.mediaId === 'LLHLS';
      const extracted = await extractM3u8FormatsAndSubtitles(
        this,
        path,
        channelId,
        isLowLatency ? 'hls-ll' : 'hls',
      );
      for (const f of extracted.formats) {
        if (isLowLatency) f.source_preference = -2;
        if (f.format_id?.includes('-afragalow.stream-audio.stream')) f.quality = -2;
      }
      formats.push(...extracted.formats);
      mergeSubtitles(subtitles, extracted.subtitles);
    }

    return {
      id: channelId,
      is_live: true,
      formats,
      subtitles,
      thumbnails,
      title: str_or_none(liveDetail.liveTitle) ?? undefined,
      timestamp:
        parseIso8601(String(liveDetail.openDate).replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T')) ??
        undefined,
      concurrent_view_count: int_or_none(liveDetail.concurrentUserCount) ?? undefined,
      view_count: int_or_none(liveDetail.accumulateCount) ?? undefined,
      channel: str_or_none(traverse_obj(liveDetail, ['channel', 'channelName'])) ?? undefined,
      channel_id: str_or_none(traverse_obj(liveDetail, ['channel', 'channelId'])) ?? undefined,
      channel_is_verified: traverse_obj(liveDetail, ['channel', 'verifiedMark']) === true,
    };
  }
}

export class CHZZKVideoIE extends InfoExtractor {
  static IE_NAME = 'chzzk:video';
  static _VALID_URL = /https?:\/\/chzzk\.naver\.com\/video\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const response = await this._download_json<{ content: Record<string, unknown> }>(
      `https://api.chzzk.naver.com/service/v3/videos/${videoId}`,
      videoId,
      'Downloading video info',
    );
    const videoMeta = response.content;

    let liveStatus: string | undefined = videoMeta.liveOpenDate ? 'was_live' : 'not_live';
    const videoStatus = str_or_none(videoMeta.vodStatus);
    let formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};

    if (videoStatus === 'ABR_HLS') {
      const extracted = await this._extractMpdFormatsAndSubtitles(
        `https://apis.naver.com/neonplayer/vodplay/v1/playback/${videoMeta.videoId}`,
        videoId,
        {
          key: String(videoMeta.inKey),
          env: 'real',
          lc: 'en_US',
          cpl: 'en_US',
        },
      );
      formats = extracted.formats;
      subtitles = extracted.subtitles;
    } else {
      const fatal = videoStatus === 'UPLOAD';
      const playback = this._parse_json<Record<string, unknown>>(
        String(videoMeta.liveRewindPlaybackJson),
        videoId,
        null,
        fatal,
      );
      const playbackPath = url_or_none(traverse_obj(playback, ['media', 0, 'path']));
      const extracted = playbackPath
        ? await extractM3u8FormatsAndSubtitles(this, playbackPath, videoId, 'hls')
        : { formats: [], subtitles: {} };
      formats = extracted.formats;
      subtitles = extracted.subtitles;

      if (formats.length && videoStatus !== 'UPLOAD') {
        this.to_screen(`${videoId}: Video found with status: "${videoStatus}"`);
      } else if (!formats.length) {
        this.raise_no_formats(`Unknown video status detected: "${videoStatus}"`, true);
        liveStatus = liveStatus === 'was_live' ? 'post_live' : undefined;
      }
    }

    return {
      id: videoId,
      formats,
      subtitles,
      live_status: liveStatus,
      title: str_or_none(videoMeta.videoTitle) ?? undefined,
      thumbnail: url_or_none(videoMeta.thumbnailImageUrl) ?? undefined,
      timestamp: float_or_none(videoMeta.publishDateAt, 1000) ?? undefined,
      view_count: int_or_none(videoMeta.readCount) ?? undefined,
      duration: int_or_none(videoMeta.duration) ?? undefined,
      channel: str_or_none(traverse_obj(videoMeta, ['channel', 'channelName'])) ?? undefined,
      channel_id: str_or_none(traverse_obj(videoMeta, ['channel', 'channelId'])) ?? undefined,
      channel_is_verified: traverse_obj(videoMeta, ['channel', 'verifiedMark']) === true,
    };
  }

  private async _extractMpdFormatsAndSubtitles(
    mpdUrl: string,
    videoId: string,
    query: Record<string, string>,
  ): Promise<{ formats: Format[]; subtitles: Record<string, Subtitle[]> }> {
    const url = `${mpdUrl}?${new URLSearchParams(query).toString()}`;
    return {
      formats: await this._extract_mpd_formats(url, videoId, 'dash', undefined, false),
      subtitles: {},
    };
  }
}
