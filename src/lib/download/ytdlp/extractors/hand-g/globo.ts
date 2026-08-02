/**
 * GloboIE / GloboArticleIE — ported from yt-dlp globo.py
 */

import { InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import {
  determine_ext,
  filter_dict,
  float_or_none,
  int_or_none,
  str_or_none,
  traverse_obj,
  url_or_none,
} from '../../utils';
import { orderedSet, extractM3u8FormatsAndSubtitles, extractMpdFormatsAndSubtitles } from './_helpers';

export class GloboIE extends InfoExtractor {
  static IE_NAME = 'globo';
  static _NETRC_MACHINE = 'globo';
  static _VALID_URL = /(?:globo:|https?:\/\/[^/?#]+?\.globo\.com\/(?:[^/?#]+\/))(?<id>\d{7,})/;

  static _VIDEO_VIEW = `
    query getVideoView($videoId: ID!) {
        video(id: $videoId) {
            duration
            description
            relatedEpisodeNumber
            relatedSeasonNumber
            headline
            title {
                originProgramId
                headline
            }
        }
    }
    `;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const info = (
      await this._download_json<{ data: { video: Record<string, unknown> } }>(
        'https://cloud-jarvis.globo.com/graphql',
        videoId,
        undefined,
        {
          query: {
            operationName: 'getVideoView',
            variables: JSON.stringify({ videoId }),
            query: GloboIE._VIDEO_VIEW,
          },
          headers: {
            'content-type': 'application/json',
            'x-platform-id': 'web',
            'x-device-id': 'desktop',
            'x-client-version': '2024.12-5',
          },
        },
      )
    ).data.video;

    const cookies = await this._get_cookies('https://globo.com');
    const glbid = cookies.GLBID;
    const video = await this._download_json<{ sources: Array<Record<string, unknown>>; resource?: Record<string, unknown> }>(
      'https://playback.video.globo.com/v4/video-session',
      videoId,
      `Downloading resource info for ${videoId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(
          filter_dict({
            player_type: 'mirakulo_8k_hdr',
            video_id: videoId,
            quality: 'max',
            content_protection: 'widevine',
            vsid: crypto.randomUUID(),
            consumption: 'streaming',
            capabilities: { low_latency: true },
            tz: '-03:00',
            Authorization: glbid ? `Bearer ${glbid}` : undefined,
            version: 1,
          }),
        ),
      },
    );

    if (traverse_obj(video, ['resource', 'drm_protection_enabled'])) {
      this.report_warning(`DRM protected: ${videoId}`);
    }

    const mainSource = video.sources[0]!;
    let formats: VideoInfo['formats'] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    if (determine_ext(String(mainSource.url ?? '')) === 'mpd') {
      ({ formats, subtitles } = await extractMpdFormatsAndSubtitles(this, String(mainSource.url), videoId, 'dash'));
    } else {
      ({ formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, String(mainSource.url), videoId, 'hls'));
    }

    const textTracks = (mainSource.text as Array<Record<string, unknown>>) || [];
    for (const track of textTracks) {
      for (const kind of ['caption', 'subtitle'] as const) {
        const sub = track[kind] as Record<string, unknown> | undefined;
        const srt = sub?.srt as Record<string, unknown> | undefined;
        const subUrl = url_or_none(srt?.url);
        if (subUrl) (subtitles['pt-BR'] ||= []).push({ url: subUrl, ext: 'srt' });
      }
    }

    return {
      id: videoId,
      title: str_or_none(info.headline) || undefined,
      duration: float_or_none(info.duration, 1000) ?? undefined,
      uploader: str_or_none(traverse_obj(info, ['title', 'headline'])) || undefined,
      uploader_id: str_or_none(traverse_obj(info, ['title', 'originProgramId'])) || undefined,
      episode_number: int_or_none(info.relatedEpisodeNumber) ?? undefined,
      season_number: int_or_none(info.relatedSeasonNumber) ?? undefined,
      formats,
      subtitles,
    };
  }
}

export class GloboArticleIE extends InfoExtractor {
  static IE_NAME = 'globoarticle';
  static _VALID_URL = /https?:\/\/(?!globoplay).+?\.globo\.com\/(?:[^/?#]+\/)*(?<id>[^/?#.]+)(?:\.html)?/;

  static _VIDEOID_REGEXES = [
    /\bdata-video-id=["'](\d{7,})["']/g,
    /\bdata-player-videosids=["'](\d{7,})["']/g,
    /\bvideosIDs\s*:\s*["']?(\d{7,})/g,
    /\bdata-id=["'](\d{7,})["']/g,
    /<div[^>]+\bid=["'](\d{7,})["']/g,
    /<bs-player[^>]+\bvideoid=["'](\d{8,})["']/g,
  ];

  static suitable(url: string): boolean {
    return !GloboIE.suitable(url) && super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const videoIds: string[] = [];
    for (const re of GloboArticleIE._VIDEOID_REGEXES) {
      for (const m of webpage.matchAll(re)) videoIds.push(m[1]!);
    }
    const entries = orderedSet(videoIds).map((videoId) =>
      this.url_result(`globo:${videoId}`, 'Globo', videoId),
    );
    return this.playlist_result(
      entries,
      displayId,
      this._og_search_title(webpage)?.trim(),
      this._html_search_meta('description', webpage) ?? undefined,
    );
  }
}
