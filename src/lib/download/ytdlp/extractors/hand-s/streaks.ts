/** StreaksBaseIE / StreaksIE — ported from yt-dlp streaks.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import {
  clean_html,
  float_or_none,
  int_or_none,
  join_nonempty,
  mimetype2ext,
  update_url_query,
  url_or_none,
  traverse_obj,
} from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles, parse_iso8601 } from './_helpers';

export class StreaksBaseIE extends InfoExtractor {
  static IE_NAME = 'streaksbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;
  static _API_URL_TEMPLATE = 'https://{}.api.streaks.jp/v1/projects/{}/medias/{}{}';
  static _GEO_COUNTRIES = ['JP'];

  protected _streaksPlaybackApiUrl(projectId: string, mediaId: string): string {
    return StreaksBaseIE._API_URL_TEMPLATE.replace('{}', 'playback')
      .replace('{}', projectId)
      .replace('{}', mediaId)
      .replace('{}', '');
  }

  protected async _downloadStreaksPlaybackJson(
    projectId: string,
    mediaId: string,
    headers?: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    return this._download_json(this._streaksPlaybackApiUrl(projectId, mediaId), mediaId, undefined, {
      headers: {
        Accept: 'application/json',
        Origin: 'https://players.streaks.jp',
        ...this.geo_verification_headers(),
        ...(headers || {}),
      },
    });
  }

  protected async _extractFromStreaksApi(
    projectId: string,
    mediaId: string,
    headers?: Record<string, string>,
    _query?: Record<string, string>,
    liveFromStart = false,
  ): Promise<VideoInfo> {
    let response: Record<string, unknown>;
    try {
      response = await this._downloadStreaksPlaybackJson(projectId, mediaId, headers);
    } catch (e) {
      const err = e as Error & { cause?: { status?: number; body?: string } };
      if (err.cause?.status === 403 || err.cause?.status === 404) {
        let error: Record<string, unknown> = {};
        try {
          error = JSON.parse(err.cause.body || '{}');
        } catch {
          /* ignore */
        }
        const message = clean_html(String(error.message || '')) || undefined;
        const code = clean_html(String(error.code || '')) || undefined;
        const errorId = int_or_none(error.id);
        if (code === 'REQUEST_FAILED') {
          if (errorId === 124) this.raise_geo_restricted(undefined, StreaksBaseIE._GEO_COUNTRIES);
          if (errorId === 126) {
            throw new ExtractorError('Access is denied (possibly due to invalid/missing API key)');
          }
        }
        if (code === 'MEDIA_NOT_FOUND') {
          throw new ExtractorError(join_nonempty(code, message, ': '), { expected: true });
        }
        if (code || message) {
          throw new ExtractorError(join_nonempty(code, String(errorId ?? ''), message, ': '));
        }
      }
      throw e;
    }

    const streaksId = String(response.id || mediaId);
    const liveStatusMap: Record<string, string> = {
      clip: 'was_live',
      file: 'not_live',
      linear: 'is_live',
      live: 'is_live',
    };
    const liveStatus = liveStatusMap[String(response.type || '')];

    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    let drmFormats = false;
    const sources = (response.sources as Record<string, unknown>[]) || [];
    const ssai = sources.some((s) => s.ssai && typeof s.ssai === 'object');

    for (const source of sources) {
      if (!url_or_none(source.src)) continue;
      if (source.key_systems) {
        drmFormats = true;
        continue;
      }
      let srcUrl = String(source.src);
      const isLive = liveStatus === 'is_live';
      const ext = mimetype2ext(source.type as string) || '';
      if (ext !== 'm3u8') {
        this.report_warning(`Unsupported stream type: ${ext}`);
        continue;
      }

      if (isLive && ssai) {
        const sessionUrl = StreaksBaseIE._API_URL_TEMPLATE.replace('{}', 'ssai')
          .replace('{}', projectId)
          .replace('{}', streaksId)
          .replace('{}', '/ssai/session');
        const sessionParams = (
          await this._download_json<Record<string, unknown>[]>(sessionUrl, mediaId, undefined, {
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            data: JSON.stringify({ id: source.id }),
          })
        )?.[0]?.query as Record<string, string[]> | undefined;
        if (sessionParams) {
          const flat: Record<string, string> = {};
          for (const [k, v] of Object.entries(sessionParams)) flat[k] = Array.isArray(v) ? v[0]! : String(v);
          srcUrl = update_url_query(srcUrl, flat);
        }
      }

      const res = await extractM3u8FormatsAndSubtitles(this, srcUrl, mediaId, 'hls');
      for (const fmt of res.formats) {
        if (liveFromStart) {
          fmt.downloader_options = { ...(fmt.downloader_options || {}), ffmpeg_args: ['-live_start_index', '0'] };
          fmt.is_from_start = true;
        }
      }
      formats.push(...res.formats);
      mergeSubtitles(subtitles, res.subtitles);
    }

    if (!formats.length && drmFormats) this.raise_no_formats('DRM protected');

    for (const subs of (response.tracks as Record<string, unknown>[]) || []) {
      if (!['captions', 'subtitles'].includes(String(subs.kind)) || !url_or_none(subs.src)) continue;
      const lang = String(subs.srclang || 'ja').toLowerCase();
      (subtitles[lang] ||= []).push({ url: String(subs.src), ext: 'vtt' });
    }

    const thumb =
      url_or_none(traverse_obj(response, ['thumbnail', 'src'])) ||
      url_or_none(traverse_obj(response, ['poster', 'src']));

    return {
      id: streaksId,
      display_id: mediaId,
      formats,
      live_status: liveStatus,
      subtitles,
      uploader_id: projectId,
      title: clean_html(String(response.name || '')) || undefined,
      description: clean_html(String(response.description || '')) || undefined,
      duration: float_or_none(response.duration) ?? undefined,
      modified_timestamp: parse_iso8601(response.updated_at) ?? undefined,
      tags: ((response.tags as unknown[]) || [])
        .map((t) => clean_html(String(t)))
        .filter(Boolean) as string[],
      thumbnail: thumb || undefined,
      timestamp: parse_iso8601(response.created_at) ?? undefined,
    };
  }

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('StreaksBaseIE is not a standalone extractor', { expected: true });
  }
}

export class StreaksIE extends StreaksBaseIE {
  static IE_NAME = 'streaks';
  static _VALID_URL = [
    /https?:\/\/players\.streaks\.jp\/(?<project_id>[\w-]+)\/(?<api_key>[\da-f]+)\/index\.html\?(?:[^#]+&)?m=(?<id>(?:ref:)?[\w-]+)/,
    /https?:\/\/playback\.api\.streaks\.jp\/v1\/projects\/(?<project_id>[\w-]+)\/medias\/(?<id>(?:ref:)?[\w-]+)/,
  ];

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const projectId = m.groups!.project_id!;
    const mediaId = m.groups!.id!;
    const ea = this.params.extractor_args as Record<string, { api_key?: string[] }> | undefined;
    const apiKey = m.groups!.api_key || ea?.streaks?.api_key?.[0];
    return this._extractFromStreaksApi(
      projectId,
      mediaId,
      apiKey ? { 'X-Streaks-Api-Key': apiKey } : undefined,
    );
  }
}
