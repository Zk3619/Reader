/** PodchaserIE — ported from yt-dlp podchaser.py */

import { InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { float_or_none, int_or_none, str_or_none, unified_timestamp, url_or_none } from '../../utils';
import { orderedSet } from './_helpers';

export class PodchaserIE extends InfoExtractor {
  static IE_NAME = 'podchaser';
  static _VALID_URL =
    /https?:\/\/(?:www\.)?podchaser\.com\/podcasts\/[\w-]+-(?<podcast_id>\d+)(?:\/episodes\/[\w-]+-(?<id>\d+))?/;
  static _PAGE_SIZE = 100;

  protected _parseEpisode(episode: Record<string, unknown>, podcast: Record<string, unknown>): VideoInfo {
    const info: VideoInfo = {
      id: String(episode.id ?? ''),
      title: episode.title as string | undefined,
      description: episode.description as string | undefined,
      url: url_or_none(episode.audio_url) ?? undefined,
      thumbnail: url_or_none(episode.image_url) ?? undefined,
      duration: int_or_none(episode.length) ?? undefined,
      timestamp: unified_timestamp(episode.air_date) ?? undefined,
      average_rating: float_or_none(episode.rating) ?? undefined,
      series: podcast.title as string | undefined,
      series_id: podcast.id != null ? String(podcast.id) : undefined,
      categories: orderedSet(
        (((podcast.summary as Record<string, unknown>)?.categories as Array<{ text?: string }>) || [])
          .map((c) => c.text)
          .filter(Boolean) as string[],
      ),
      tags: ((podcast.tags as Array<{ text?: string }>) || []).map((t) => t.text).filter(Boolean) as string[],
      vcodec: 'none',
      ext: 'mp3',
    };
    if (info.series_id) {
      const podcastSlug = (podcast.slug as string) || 'podcast';
      const episodeSlug = (episode.slug as string) || 'episode';
      info.webpage_url = `https://www.podchaser.com/podcasts/${podcastSlug.slice(0, 30).replace(/-$/, '')}-${info.series_id}/${episodeSlug.slice(0, 30).replace(/-$/, '')}-${info.id}`;
    }
    return info;
  }

  protected async _callApi(path: string, itemId: string, opts?: { data?: string; headers?: Record<string, string> }) {
    return this._download_json<Record<string, unknown>>(`https://api.podchaser.com/${path}`, itemId, undefined, opts);
  }

  protected async *_fetchPage(
    podcastId: string,
    podcast: Record<string, unknown>,
    page: number,
  ): AsyncGenerator<VideoInfo> {
    const jsonResponse = await this._callApi('list/episode', podcastId, {
      headers: { 'Content-Type': 'application/json;charset=utf-8' },
      data: JSON.stringify({
        start: page * PodchaserIE._PAGE_SIZE,
        count: PodchaserIE._PAGE_SIZE,
        sort_order: 'SORT_ORDER_RECENT',
        filters: { podcast_id: podcastId },
        options: {},
      }),
    });
    for (const episode of (jsonResponse.entities as Array<Record<string, unknown>>) || []) {
      yield this._parseEpisode(episode, podcast);
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const podcastId = m.groups?.podcast_id ?? '';
    const episodeId = m.groups?.id;
    const podcast = await this._callApi(`podcasts/${podcastId}`, episodeId || podcastId);

    if (!episodeId) {
      const entries: VideoInfo[] = [];
      for (let page = 0; ; page++) {
        let count = 0;
        for await (const e of this._fetchPage(podcastId, podcast, page)) {
          entries.push(e);
          count++;
        }
        if (count < PodchaserIE._PAGE_SIZE) break;
      }
      return this.playlist_result(
        entries,
        str_or_none(podcast.id) ?? podcastId,
        podcast.title as string | undefined,
        podcast.description as string | undefined,
      );
    }

    const episode = await this._callApi(`podcasts/${podcastId}/episodes/${episodeId}/player_ids`, episodeId);
    return this._parseEpisode(episode, podcast);
  }
}
