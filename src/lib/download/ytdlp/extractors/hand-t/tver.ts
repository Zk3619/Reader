/**
 * StreaksBaseIE / TVerIE / TVerOlympicIE — ported from yt-dlp tver.py + streaks.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  clean_html,
  determine_ext,
  filter_dict,
  float_or_none,
  int_or_none,
  mimetype2ext,
  smuggle_url,
  traverse_obj,
  url_or_none,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, parseIso8601 } from './_helpers';

export class StreaksBaseIE extends InfoExtractor {
  static _VALID_URL: RegExp | string | false | null = false;
  protected _API_URL_TEMPLATE = 'https://{}.api.streaks.jp/v1/projects/{}/medias/{}{}';

  protected _streaksPlaybackApiUrl(projectId: string, mediaId: string) {
    return this._API_URL_TEMPLATE.replace('{}', 'playback').replace('{}', projectId).replace('{}', mediaId).replace('{}', '');
  }

  protected async _extractFromStreaksApi(
    projectId: string,
    mediaId: string,
    headers?: Record<string, string>,
    liveFromStart = false,
  ): Promise<Partial<VideoInfo>> {
    const response = await this._download_json<Record<string, unknown>>(
      `https://playback.api.streaks.jp/v1/projects/${projectId}/medias/${mediaId}`,
      mediaId,
      'Downloading STREAKS playback API JSON',
      {
        headers: {
          Accept: 'application/json',
          Origin: 'https://players.streaks.jp',
          ...this.geo_verification_headers(),
          ...(headers || {}),
        },
      },
    );

    const liveStatusMap: Record<string, string> = {
      clip: 'was_live',
      file: 'not_live',
      linear: 'is_live',
      live: 'is_live',
    };
    const liveStatus = liveStatusMap[String(response.type || '')] || undefined;
    const formats: Format[] = [];
    const subtitles: Record<string, Subtitle[]> = {};
    let drm = false;

    for (const source of (response.sources as Record<string, unknown>[]) || []) {
      const srcUrl = url_or_none(source.src);
      if (!srcUrl) continue;
      if (source.key_systems) {
        drm = true;
        continue;
      }
      if (mimetype2ext(source.type != null ? String(source.type) : undefined) !== 'm3u8') continue;
      const res = await extractM3u8FormatsAndSubtitles(this, srcUrl, mediaId, 'hls');
      for (const f of res.formats) {
        if (liveFromStart) f.is_from_start = true;
      }
      formats.push(...res.formats);
      mergeSubtitles(subtitles, res.subtitles);
    }

    if (!formats.length && drm) this.report_drm?.(mediaId);

    for (const track of (response.tracks as Record<string, unknown>[]) || []) {
      if (!['captions', 'subtitles'].includes(String(track.kind || ''))) continue;
      const src = url_or_none(track.src);
      if (!src) continue;
      const lang = String(track.srclang || 'ja').toLowerCase();
      (subtitles[lang] ||= []).push({ url: src, ext: determine_ext(src) || 'vtt' });
    }

    return {
      id: String(response.id || mediaId),
      display_id: mediaId,
      formats,
      live_status: liveStatus,
      subtitles,
      uploader_id: projectId,
      title: response.name ? clean_html(String(response.name)) : undefined,
      description: response.description ? clean_html(String(response.description)) : undefined,
      duration: float_or_none(response.duration) ?? undefined,
      modified_timestamp: parseIso8601(response.updated_at) ?? undefined,
      timestamp: parseIso8601(response.created_at) ?? undefined,
      thumbnail:
        url_or_none(traverse_obj(response, ['thumbnail', 'src'])) ||
        url_or_none(traverse_obj(response, ['poster', 'src'])) ||
        undefined,
    };
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('StreaksBaseIE is not a standalone extractor', { expected: true });
  }
}

export class TVerIE extends StreaksBaseIE {
  static _VALID_URL =
    /https?:\/\/(?:www\.)?tver\.jp\/(?:(?<type>lp|corner|series|episodes?|feature)\/)+(?<id>[a-zA-Z0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const pageType = this._match_valid_url(url)!.groups!.type!;
    const pageId = this._match_id(url);

    if (pageType === 'series' || pageType === 'lp' || pageType === 'corner' || pageType === 'feature') {
      const webpage = await this._download_webpage(url, pageId);
      const episodeIds = [...webpage.matchAll(/\/episodes\/([a-zA-Z0-9]+)/g)].map((m) => m[1]!);
      const entries = episodeIds.map((epId) =>
        this.url_result(`https://tver.jp/episodes/${epId}`, 'TVer', epId),
      );
      return this.playlist_result(
        entries,
        pageId,
        this._og_search_title(webpage, false) || undefined,
      );
    }

    const api = await this._download_json<Record<string, unknown>>(
      `https://api.tver.jp/v4/callEpisode/${pageId}`,
      pageId,
    );
    const result = (api.result as Record<string, unknown>) || {};
    const streaks = (result.streaks as Record<string, unknown>) || {};
    const projectId = String(streaks.projectID || streaks.projectId || 'tver');
    const mediaId = String(streaks.mediaID || streaks.mediaId || pageId);
    const apiKey = streaks.apiKey != null ? String(streaks.apiKey) : undefined;

    const info = await this._extractFromStreaksApi(projectId, mediaId, filter_dict({
      'X-Streaks-Api-Key': apiKey,
      Origin: 'https://tver.jp',
      Referer: 'https://tver.jp/',
    }) as Record<string, string>);

    const bc = result.content as Record<string, unknown> | undefined;
    const bcVideo = (bc?.video ?? {}) as { bc_account_id?: string; bc_ref_id?: string };
    const bcId = bcVideo.bc_account_id && bcVideo.bc_ref_id ? `ref:${bcVideo.bc_ref_id}` : null;

    if (!info.formats?.length && bcId) {
      return {
        _type: 'url_transparent',
        ie_key: 'BrightcoveNew',
        url: smuggle_url(
          `https://players.brightcove.net/${bcVideo.bc_account_id}/default_default/index.html?videoId=${bcVideo.bc_ref_id}`,
          { geo_countries: ['JP'] },
        ),
        id: String(bcVideo.bc_ref_id),
        title: result.title != null ? String(result.title) : undefined,
      };
    }

    return merge_dicts(info, {
      id: pageId,
      title: result.title != null ? String(result.title) : info.title,
      series: traverse_obj(result, ['series', 'title']) != null ? String(traverse_obj(result, ['series', 'title'])) : undefined,
      episode: result.title != null ? String(result.title) : undefined,
      episode_number: int_or_none(result.episodeNumber) ?? undefined,
      season_number: int_or_none(result.seasonNumber) ?? undefined,
      description: result.description != null ? String(result.description) : undefined,
      thumbnail: url_or_none(result.thumbnailURL) || info.thumbnail,
    }) as VideoInfo;
  }
}

function merge_dicts(a: Partial<VideoInfo>, b: Partial<VideoInfo>): VideoInfo {
  return { ...a, ...b, formats: b.formats || a.formats, subtitles: b.subtitles || a.subtitles } as VideoInfo;
}

export class TVerOlympicIE extends StreaksBaseIE {
  static IE_NAME = 'tver:olympic';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?tver\.jp\/olympic\/milanocortina2026\/(?<type>live|video)\/play\/(?<id>\w+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const videoType = m.groups!.type!;
    const videoId = m.groups!.id!;
    let projectId = 'tver-olympic';
    let apiKey = '4b55a4db3cce4ad38df6dd8543e3e46a';
    let mediaId = videoId;
    let liveStatus = 'not_live';
    let olympicData: Record<string, unknown> = {};

    if (videoType === 'live') {
      projectId = 'tver-olympic-live';
      apiKey = 'a35ebb1ca7d443758dc7fcc5d99b1f72';
      const payload = await this._download_json<Record<string, unknown>>(
        `https://olympic-data.tver.jp/api/live/${videoId}`,
        videoId,
      );
      olympicData = (traverse_obj(payload, ['contents', 'live']) as Record<string, unknown>) || {};
      mediaId = String(olympicData.video_id || videoId);
      liveStatus = 'is_live';
    } else {
      const payload = await this._download_json<Record<string, unknown>>(
        `https://olympic-data.tver.jp/api/video/${videoId}`,
        videoId,
      );
      olympicData = (traverse_obj(payload, ['contents', 'video']) as Record<string, unknown>) || {};
    }

    const streaksInfo = await this._extractFromStreaksApi(projectId, `ref:${mediaId}`, {
      Origin: 'https://tver.jp',
      Referer: 'https://tver.jp/',
      'X-Streaks-Api-Key': apiKey,
    });

    return {
      ...streaksInfo,
      id: videoId,
      live_status: liveStatus,
      title: olympicData.title ? clean_html(String(olympicData.title)) : streaksInfo.title,
      alt_title: olympicData.sub_title ? clean_html(String(olympicData.sub_title)) : undefined,
      channel: olympicData.channel ? clean_html(String(olympicData.channel)) : undefined,
      channel_id: olympicData.channel_id ? clean_html(String(olympicData.channel_id)) : undefined,
      thumbnail:
        url_or_none(olympicData.picture_l_url) ||
        url_or_none(olympicData.picture_m_url) ||
        streaksInfo.thumbnail,
    } as VideoInfo;
  }
}
