/**
 * ACastIE / ACastChannelIE — aligned with yt-dlp acast.py
 */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, int_or_none, str_or_none } from '../../utils';

function cleanPodcastUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete('token');
    return u.toString();
  } catch {
    return url;
  }
}

function parseIso8601(s: unknown): number | null {
  if (s == null) return null;
  const t = Date.parse(String(s));
  return Number.isFinite(t) ? Math.trunc(t / 1000) : null;
}

abstract class ACastBaseIE extends InfoExtractor {
  _extractEpisode(
    episode: Record<string, unknown>,
    showInfo: Record<string, unknown>,
  ): VideoInfo {
    const title = String(episode.title || '');
    return {
      id: String(episode.id || ''),
      display_id: str_or_none(episode.episodeUrl) || undefined,
      url: cleanPodcastUrl(String(episode.url || '')),
      title,
      description: clean_html(String(episode.description || episode.summary || '')),
      thumbnail: str_or_none(episode.image) || undefined,
      timestamp: parseIso8601(episode.publishDate) ?? undefined,
      duration: int_or_none(episode.duration) ?? undefined,
      filesize: int_or_none(episode.contentLength) ?? undefined,
      season_number: int_or_none(episode.season) ?? undefined,
      episode: title,
      episode_number: int_or_none(episode.episode) ?? undefined,
      ...showInfo,
      formats: episode.url
        ? [
            {
              format_id: 'audio',
              url: cleanPodcastUrl(String(episode.url)),
              ext: 'mp3',
              vcodec: 'none',
              acodec: 'mp3',
            },
          ]
        : [],
      extractor: (this.constructor as typeof InfoExtractor).IE_NAME,
      extractor_key: (this.constructor as typeof InfoExtractor).IE_NAME,
    };
  }

  _extractShowInfo(show: Record<string, unknown>): Record<string, unknown> {
    return {
      creator: show.author,
      series: show.title,
    };
  }

  async _callApi(path: string, videoId: string, query?: Record<string, string>) {
    return this._download_json<Record<string, unknown>>(
      `https://feeder.acast.com/api/v1/shows/${path}`,
      videoId,
      undefined,
      { query },
    );
  }
}

export class ACastIE extends ACastBaseIE {
  static IE_NAME = 'acast';
  static _VALID_URL =
    /https?:\/\/(?:(?:(?:embed|www|shows)\.)?acast\.com\/|play\.acast\.com\/s\/)(?<channel>[^/?#]+)\/(?:episodes\/)?(?<id>[^/#?"]+)/i;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const channel = m.groups!.channel!;
    const displayId = m.groups!.id!;
    const episode = await this._callApi(`${channel}/episodes/${displayId}`, displayId, {
      showInfo: 'true',
    });
    const info = this._extractEpisode(
      episode,
      this._extractShowInfo((episode.show as Record<string, unknown>) || {}),
    );
    return {
      ...info,
      webpage_url: url,
      original_url: url,
      extractor: ACastIE.IE_NAME,
      extractor_key: 'ACast',
    };
  }
}

export class ACastChannelIE extends ACastBaseIE {
  static IE_NAME = 'acast:channel';
  static _VALID_URL =
    /https?:\/\/(?:(?:(?:www|shows)\.)?acast\.com\/|play\.acast\.com\/s\/)(?<id>[^/#?]+)$/i;

  static suitable(url: string): boolean {
    if (ACastIE.suitable(url)) return false;
    return super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const showSlug = this._match_id(url);
    const show = await this._callApi(showSlug, showSlug);
    const showInfo = this._extractShowInfo(show);
    const entries = ((show.episodes as Record<string, unknown>[]) || []).map((ep) =>
      this._extractEpisode(ep, showInfo),
    );
    return this.playlist_result(
      entries,
      String(show.id || showSlug),
      String(show.title || showSlug),
      str_or_none(show.description),
    );
  }
}
