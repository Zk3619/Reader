/**
 * GoPlayIE — ported from yt-dlp goplay.py (main path; login via netrc/password)
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { int_or_none, traverse_obj } from '../../utils';
import { extractM3u8FormatsAndSubtitles, searchNextjsData } from './_helpers';

export class GoPlayIE extends InfoExtractor {
  static IE_NAME = 'play.tv';
  static IE_DESC = 'PLAY (formerly goplay.be)';
  static _VALID_URL = /https?:\/\/(?:www\.)?play\.tv\/video\/([^/?#]+\/[^/?#]+\/|)(?<id>[^/#]+)/;
  static _NETRC_MACHINE = 'goplay';

  protected _idToken: string | null = null;

  protected async _performLogin(_username: string, _password: string): Promise<void> {
    throw new ExtractorError('GoPlay AWS Cognito SRP login is not yet implemented in this port', { expected: true });
  }

  protected async _real_initialize(): Promise<void> {
    if (!this._idToken) this.raise_login_required(undefined, 'password');
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    await this._real_initialize();
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);
    const nextjsData = searchNextjsData(this, webpage, displayId);
    const path = new URL(url).pathname;
    const metaEntry = Object.values(nextjsData).find(
      (v) => v && typeof v === 'object' && (v as Record<string, unknown>).path === path,
    ) as Record<string, unknown> | undefined;
    const meta =
      (metaEntry?.video as Record<string, unknown> | undefined) ||
      (metaEntry?.meta as Record<string, unknown> | undefined) ||
      metaEntry ||
      {};

    const videoId = String(meta.uuid ?? displayId);
    const infoDict: Partial<VideoInfo> = {
      title: traverse_obj(meta, ['title']) as string | undefined,
      description: String(traverse_obj(meta, ['description']) ?? '').trim() || undefined,
    };

    if (traverse_obj(meta, ['program', 'subtype']) !== 'movie') {
      for (const seasonData of Object.values(nextjsData)) {
        if (!seasonData || typeof seasonData !== 'object') continue;
        const playlists = (seasonData as Record<string, unknown>).playlists;
        if (!Array.isArray(playlists)) continue;
        for (const section of playlists) {
          const episode = ((section as Record<string, unknown>).videos as Array<Record<string, unknown>> | undefined)?.find(
            (v) => v.videoId === videoId,
          );
          if (!episode) continue;
          const seasonNumber = int_or_none((section as Record<string, unknown>).season);
          infoDict.episode = traverse_obj(episode, ['episodeTitle']) as string | undefined;
          infoDict.episode_number = int_or_none(traverse_obj(episode, ['episodeNumber'])) ?? undefined;
          infoDict.season_number = seasonNumber ?? undefined;
          const title = infoDict.title || '';
          if (seasonNumber != null) {
            infoDict.series = new RegExp(`^(.+)? - S${seasonNumber} - `).exec(title)?.[1] || undefined;
          }
          break;
        }
      }
    }

    const api = await this._download_json<Record<string, unknown>>(
      `https://api.play.tv/web/v1/videos/long-form/${videoId}`,
      videoId,
      undefined,
      { headers: { Authorization: `Bearer ${this._idToken}` } },
    );

    let formats: VideoInfo['formats'] = [];
    let subtitles: VideoInfo['subtitles'] = {};
    const manifestUrls = api.manifestUrls as Record<string, string> | undefined;
    if (manifestUrls?.hls) {
      ({ formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, manifestUrls.hls, videoId, 'HLS'));
    } else if (api.ssai) {
      const ssai = api.ssai as Record<string, string>;
      const dai = await this._download_json<{ stream_manifest?: string }>(
        `https://dai.google.com/ondemand/dash/content/${ssai.contentSourceID}/vid/${ssai.videoID}/streams`,
        videoId,
        undefined,
        { data: '{"api-key":"null"}', headers: { 'content-type': 'application/json' } },
      );
      formats = await this._extract_mpd_formats(String(dai.stream_manifest ?? ''), videoId, 'dash', undefined, false);
    } else {
      throw new ExtractorError('expecting Google SSAI stream or HLS manifest');
    }

    return { ...infoDict, id: videoId, formats, subtitles };
  }
}
