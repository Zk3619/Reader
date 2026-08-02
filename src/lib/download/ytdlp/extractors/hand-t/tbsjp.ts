/** TBSJP family ù?ported from yt-dlp tbsjp.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, Subtitle, VideoInfo } from '../../types';
import { clean_html, int_or_none, str_or_none, traverse_obj, unified_timestamp, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, mergeSubtitles } from './_helpers';

export class TBSJPBaseIE extends InfoExtractor {
  static IE_NAME = 'tbsjpbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('TBSJPBaseIE is not a standalone extractor', { expected: true });
  }

  protected _searchWindowAppJson(webpage: string, name: string, itemId: string): Record<string, unknown> {
    return (
      this._search_json<Record<string, unknown>>(/window\.app\s*=/, webpage, `${name} info`, itemId, { fatal: false }) ||
      {}
    );
  }

  protected async _extractFromStreaksApi(
    projectId: string,
    mediaId: string,
    headers: Record<string, string>,
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
          ...headers,
        },
      },
    );
    const liveMap: Record<string, VideoInfo['live_status']> = {
      clip: 'was_live',
      file: 'not_live',
      linear: 'is_live',
      live: 'is_live',
    };
    const formats: Format[] = [];
    let subtitles: Record<string, Subtitle[]> = {};
    for (const source of (response.sources as Array<Record<string, unknown>>) || []) {
      if (source.key_systems) continue;
      const srcUrl = url_or_none(source.src);
      if (!srcUrl?.includes('.m3u8')) continue;
      const res = await extractM3u8FormatsAndSubtitles(this, srcUrl, mediaId, 'hls');
      formats.push(...res.formats);
      subtitles = mergeSubtitles(subtitles, res.subtitles);
    }
    return {
      id: str_or_none(response.id) || mediaId,
      display_id: mediaId,
      formats,
      subtitles: Object.keys(subtitles).length ? subtitles : undefined,
      live_status: liveMap[String(response.type || '')] || 'not_live',
    };
  }
}

export class TBSJPEpisodeIE extends TBSJPBaseIE {
  static IE_NAME = 'tbsjp:episode';
  static _VALID_URL = /https?:\/\/cu\.tbs\.co\.jp\/episode\/(?<id>[\d_]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const webpage = await this._download_webpage(url, videoId);
    const meta = this._searchWindowAppJson(webpage, 'episode', videoId);
    const episode = traverse_obj(meta, ['falcorCache', 'catalog', 'episode', videoId, 'value']) as Record<string, unknown>;

    const streaks = await this._extractFromStreaksApi('tbs', `ref:${videoId}`, { Origin: 'https://cu.tbs.co.jp' });
    const titleArr = (episode.title as Array<{ is_phonetic?: boolean; value?: string }>) || [];
    const episodeTitle = titleArr.find((t) => !t.is_phonetic)?.value;

    return {
      ...streaks,
      id: videoId,
      title: str_or_none(titleArr[0]?.value) ?? undefined,
      cast: ((episode.credit as Array<{ name?: Array<{ value?: string }> }>) || [])
        .flatMap((c) => (c.name || []).map((n) => (clean_html(String(n.value || '')) || '').split(',').map((s) => s.trim())))
        .flat()
        .filter(Boolean),
      categories: ((episode.keywords as string[]) || []).map(String),
      description: clean_html(String((episode.description as Array<{ value?: string }>)?.[0]?.value || '')) || undefined,
      duration: int_or_none(traverse_obj(episode, ['tv_episode_info', 'duration'])) ?? undefined,
      episode: str_or_none(episodeTitle) ?? undefined,
      episode_id: str_or_none(episode.content_id) ?? undefined,
      episode_number: int_or_none(traverse_obj(episode, ['tv_episode_info', 'episode_number'])) ?? undefined,
      genres: ((episode.genre as string[]) || []).map(String),
      release_timestamp: unified_timestamp(episode.pub_date) ?? undefined,
      series: str_or_none(traverse_obj(episode, ['custom_data', 'program_name'])) ?? undefined,
      tags: ((episode.tags as string[]) || []).map(String),
      thumbnail: url_or_none((episode.artwork as Array<{ url?: string }>)?.[0]?.url) ?? undefined,
      timestamp: unified_timestamp(episode.created_at) ?? undefined,
      uploader: str_or_none((episode.tv_show_info as { networks?: string[] })?.networks?.[0]) ?? undefined,
      series_id: str_or_none(traverse_obj(episode, ['tv_episode_info', 'show_content_id'])) ?? undefined,
    };
  }
}

export class TBSJPProgramIE extends TBSJPBaseIE {
  static IE_NAME = 'tbsjp:program';
  static _VALID_URL = /https?:\/\/cu\.tbs\.co\.jp\/program\/(?<id>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const programmeId = this._match_id(url);
    const webpage = await this._download_webpage(url, programmeId);
    const meta = this._searchWindowAppJson(webpage, 'programme', programmeId);
    const programme = traverse_obj(meta, ['falcorCache', 'catalog', 'program', programmeId, 'false', 'value']) as Record<
      string,
      unknown
    >;
    const episodeCodes = ((programme.custom_data as { seriesList?: { episodeCode?: string[] } })?.seriesList?.episodeCode ||
      []) as string[];

    return {
      _type: 'playlist',
      id: programmeId,
      entries: episodeCodes.map((vid) => this.url_result(`https://cu.tbs.co.jp/episode/${vid}`, 'TBSJPEpisode', vid)),
      categories: (programme.keywords as string[]) || undefined,
      description: str_or_none(traverse_obj(programme, ['custom_data', 'program_description'])) ?? undefined,
      series: str_or_none(traverse_obj(programme, ['custom_data', 'program_name'])) ?? undefined,
      title: str_or_none(traverse_obj(programme, ['custom_data', 'program_name'])) ?? undefined,
    };
  }
}

export class TBSJPPlaylistIE extends TBSJPBaseIE {
  static IE_NAME = 'tbsjp:playlist';
  static _VALID_URL = /https?:\/\/cu\.tbs\.co\.jp\/playlist\/(?<id>[\da-f]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const webpage = await this._download_webpage(url, playlistId);
    const meta = this._searchWindowAppJson(webpage, 'playlist', playlistId);
    const playlist = traverse_obj(meta, ['falcorCache', 'playList', playlistId]) as Record<string, unknown>;
    const catalogs = ((playlist.catalogs as { value?: Array<Record<string, unknown>> })?.value || []) as Array<
      Record<string, unknown>
    >;

    const entries: VideoInfo[] = [];
    for (const entry of catalogs) {
      const contentId = String(entry.content_id || '');
      const contentType = String(entry.content_type || '');
      if (contentType === 'tv_show') {
        entries.push(this.url_result(`https://cu.tbs.co.jp/program/${contentId}`, 'TBSJPProgram', contentId));
      } else if (contentType === 'tv_episode') {
        entries.push(this.url_result(`https://cu.tbs.co.jp/episode/${contentId}`, 'TBSJPEpisode', contentId));
      } else {
        this.report_warning(`Skipping "${contentId}" with unsupported content_type "${contentType}"`);
      }
    }

    return this.playlist_result(
      entries,
      playlistId,
      str_or_none((playlist.display_name as { value?: string })?.value) ?? undefined,
    );
  }
}
