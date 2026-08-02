/** MaveBaseIE / MaveIE / MaveChannelIE — ported from yt-dlp mave.py */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, int_or_none, str_or_none } from '../../utils';
import { parseIso8601, urljoin } from './_helpers';

export class MaveBaseIE extends InfoExtractor {
  static IE_NAME = 'mavebase';
  static _API_BASE_URL = 'https://api.mave.digital/v1/website';
  static _API_BASE_STORAGE_URL = 'https://store.cloud.mts.ru/mave/';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('MaveBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _loadChannelMeta(channelId: string, displayId: string): Promise<Record<string, unknown>> {
    const resp = await this._download_json<Record<string, unknown>>(
      `${MaveBaseIE._API_BASE_URL}/${channelId}/`,
      displayId,
      'Downloading channel metadata',
    );
    return (resp.podcast as Record<string, unknown>) || {};
  }

  protected async _loadEpisodeMeta(
    channelId: string,
    episodeCode: string,
    displayId: string,
  ): Promise<Record<string, unknown>> {
    return this._download_json(
      `${MaveBaseIE._API_BASE_URL}/${channelId}/episodes/${episodeCode}`,
      displayId,
      'Downloading episode metadata',
    );
  }

  protected _createEntry(
    channelId: string,
    channelMeta: Record<string, unknown>,
    episodeMeta: Record<string, unknown>,
  ): VideoInfo {
    const episodeCode = int_or_none(episodeMeta.code);
    if (episodeCode == null) throw new ExtractorError('Missing episode code');

    const reactions = (episodeMeta.reactions as Array<Record<string, unknown>>) || [];
    const like = reactions.find((r) => r.type === 'like');
    const dislike = reactions.find((r) => r.type === 'dislike');

    const audioPath = str_or_none(episodeMeta.audio);
    return {
      display_id: `${channelId}-${episodeCode}`,
      extractor_key: 'Mave',
      extractor: 'mave',
      webpage_url: `https://${channelId}.mave.digital/ep-${episodeCode}`,
      channel_id: channelId,
      channel_url: `https://${channelId}.mave.digital/`,
      vcodec: 'none',
      id: str_or_none(episodeMeta.id) ?? `${channelId}-${episodeCode}`,
      url: audioPath ? urljoin(MaveBaseIE._API_BASE_STORAGE_URL, audioPath) : undefined,
      title: str_or_none(episodeMeta.title) ?? undefined,
      description: clean_html(str_or_none(episodeMeta.description)) ?? undefined,
      thumbnail: episodeMeta.image ? urljoin(MaveBaseIE._API_BASE_STORAGE_URL, String(episodeMeta.image)) : undefined,
      duration: int_or_none(episodeMeta.duration) ?? undefined,
      season_number: int_or_none(episodeMeta.season) ?? undefined,
      episode_number: int_or_none(episodeMeta.number) ?? undefined,
      view_count: int_or_none(episodeMeta.listenings) ?? undefined,
      like_count: int_or_none(like?.count) ?? undefined,
      dislike_count: int_or_none(dislike?.count) ?? undefined,
      age_limit: episodeMeta.is_explicit ? 18 : undefined,
      timestamp: parseIso8601(episodeMeta.publish_date) ?? undefined,
      series_id: str_or_none(channelMeta.id) ?? undefined,
      series: str_or_none(channelMeta.title) ?? undefined,
      channel: str_or_none(channelMeta.title) ?? undefined,
      uploader: str_or_none(channelMeta.author) ?? undefined,
      formats: audioPath
        ? [{ url: urljoin(MaveBaseIE._API_BASE_STORAGE_URL, audioPath), format_id: 'audio', vcodec: 'none', ext: 'mp3' }]
        : [],
    };
  }
}

export class MaveIE extends MaveBaseIE {
  static IE_NAME = 'mave';
  static _VALID_URL = /https?:\/\/(?<channel_id>[\w-]+)\.mave\.digital\/ep-(?<episode_code>\d+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const channelId = m.groups!.channel_id!;
    const episodeCode = m.groups!.episode_code!;
    const displayId = `${channelId}-${episodeCode}`;
    const channelMeta = await this._loadChannelMeta(channelId, displayId);
    const episodeMeta = await this._loadEpisodeMeta(channelId, episodeCode, displayId);
    return this._createEntry(channelId, channelMeta, episodeMeta);
  }
}

export class MaveChannelIE extends MaveBaseIE {
  static IE_NAME = 'mave:channel';
  static _VALID_URL = /https?:\/\/(?<id>[\w-]+)\.mave\.digital\/?(?:$|[?#])/;
  static _PAGE_SIZE = 50;

  protected async _entries(
    channelId: string,
    channelMeta: Record<string, unknown>,
    pageNum: number,
  ): Promise<VideoInfo[]> {
    const pageData = await this._download_json<Record<string, unknown>>(`${MaveBaseIE._API_BASE_URL}/${channelId}/episodes`, channelId, `Downloading page ${pageNum + 1}`, {
      query: { view: 'all', page: String(pageNum + 1), sort: 'newest', format: 'all' },
    });
    const episodes = (pageData.episodes as Array<Record<string, unknown>>) || [];
    return episodes
      .filter((ep) => ep.audio && ep.id)
      .map((ep) => this._createEntry(channelId, channelMeta, ep));
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelId = this._match_id(url);
    const channelMeta = await this._loadChannelMeta(channelId, channelId);
    const total = int_or_none(channelMeta.episodes_count) || 0;
    const pages = Math.ceil(total / MaveChannelIE._PAGE_SIZE) || 1;
    const entries: VideoInfo[] = [];
    for (let page = 0; page < pages; page++) {
      entries.push(...(await this._entries(channelId, channelMeta, page)));
    }
    return {
      _type: 'playlist',
      id: channelId,
      title: str_or_none(channelMeta.title) ?? undefined,
      description: str_or_none(channelMeta.description) ?? undefined,
      entries,
      playlist_count: entries.length,
      extractor: this.IE_NAME,
      extractor_key: this.ie_key,
    };
  }
}
