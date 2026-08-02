/**
 * Nebula family — ported from yt-dlp nebula.py (login/auth main path; Art19/podcast edges simplified)
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Subtitle, VideoInfo } from '../../types';
import { int_or_none, smuggle_url, unsmuggle_url, update_url_query, url_or_none } from '../../utils';
import { extractM3u8FormatsAndSubtitles, make_archive_id, parseIso8601, urljoin } from './_helpers';

const BASE_URL_RE =
  /https?:\/\/(?:www\.|beta\.)?(?:watchnebula\.com|nebula\.app|nebula\.tv)/;

export class NebulaBaseIE extends InfoExtractor {
  static IE_NAME = 'nebulabase';
  static _VALID_URL: RegExp | string | false | null = false;

  protected _apiToken: string | null = null;
  protected _token: string | null = null;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('NebulaBaseIE is not a standalone extractor', { expected: true });
  }

  protected async _realInitialize(): Promise<void> {
    if (!this._apiToken) {
      const cookies = await this._get_cookies('https://nebula.tv');
      this._apiToken = cookies['nebula_auth.apiToken'] || null;
    }
    const resp = await this._download_json<{ token?: string }>(
      'https://users.api.nebula.app/api/v1/authorization/',
      undefined,
      'Authorizing to Nebula',
      {
        method: 'POST',
        data: '',
        headers: this._apiToken ? { Authorization: `Token ${this._apiToken}` } : {},
      },
    );
    this._token = resp.token || null;
  }

  protected async _callApi<T = Record<string, unknown>>(
    url: string,
    videoId: string | undefined,
    note?: string,
    opts: Record<string, unknown> = {},
  ): Promise<T> {
    const headers = { ...(opts.headers as Record<string, string>), ...(this._token ? { Authorization: `Bearer ${this._token}` } : {}) };
    try {
      return await this._download_json<T>(url, videoId, note, { ...opts, headers });
    } catch (e) {
      const status = (e as { cause?: { status?: number } })?.cause?.status;
      if (status === 401 || status === 403) {
        await this._realInitialize();
        return this._download_json<T>(url, videoId, note, {
          ...opts,
          headers: { ...(opts.headers as Record<string, string>), Authorization: `Bearer ${this._token}` },
        });
      }
      throw e;
    }
  }

  protected async _extractFormats(contentId: string, slug: string): Promise<{ formats: VideoInfo['formats']; subtitles: Record<string, Subtitle[]> }> {
    await this._realInitialize();
    const kind = contentId.split(':')[0];
    const m3u8Url = `https://content.api.nebula.app/${kind}s/${contentId}/manifest.m3u8`;
    try {
      const finalUrl = update_url_query(m3u8Url, {
        token: this._token || '',
        app_version: '23.10.0',
        platform: 'ios',
      });
      const { formats, subtitles } = await extractM3u8FormatsAndSubtitles(this, finalUrl, slug, 'hls');
      return { formats, subtitles: subtitles as Record<string, Subtitle[]> };
    } catch (e) {
      const status = (e as { cause?: { status?: number } })?.cause?.status;
      if (status === 401) this.raise_login_required('Nebula login required');
      throw e;
    }
  }

  protected _extractVideoMetadata(episode: Record<string, unknown>): Partial<VideoInfo> {
    const channelSlug = (episode.channel_slug as string) || (episode.class_slug as string);
    const channelUrl = channelSlug ? urljoin('https://nebula.tv/', channelSlug) : undefined;
    const zypeId = episode.zype_id as string | undefined;
    return {
      id: String(episode.id || '').split(':')[2] || String(episode.id || ''),
      display_id: episode.slug as string | undefined,
      title: episode.title as string | undefined,
      description: episode.description as string | undefined,
      timestamp: parseIso8601(episode.published_at) ?? undefined,
      duration: int_or_none(episode.duration) ?? undefined,
      channel_id: channelSlug,
      uploader_id: channelSlug,
      channel: episode.channel_title as string | undefined,
      uploader: episode.channel_title as string | undefined,
      series: episode.channel_title as string | undefined,
      creator: episode.channel_title as string | undefined,
      thumbnail: url_or_none((episode.images as Record<string, Record<string, string>>)?.thumbnail?.src) ?? undefined,
      episode_number: int_or_none(episode.order) ?? undefined,
      channel_url: channelUrl,
      uploader_url: channelUrl,
      _old_archive_ids: zypeId
        ? [make_archive_id('Nebula', zypeId), make_archive_id('NebulaSubscriptions', zypeId)]
        : undefined,
    };
  }
}

export class NebulaIE extends NebulaBaseIE {
  static IE_NAME = 'nebula:video';
  static _VALID_URL = new RegExp(`${BASE_URL_RE.source}/videos/(?<id>[\\w-]+)`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const slug = this._match_id(url);
    const [, smuggled] = unsmuggle_url(url, {});
    if (smuggled.id) {
      return {
        id: String(smuggled.id),
        display_id: slug,
        title: '',
        ...(await this._extractFormats(String(smuggled.id), slug)),
      };
    }

    const metadata = await this._callApi<Record<string, unknown>>(
      `https://content.api.nebula.app/content/videos/${slug}`,
      slug,
      'Fetching video metadata',
    );
    return {
      ...this._extractVideoMetadata(metadata),
      ...(await this._extractFormats(String(metadata.id), slug)),
    } as VideoInfo;
  }
}

export class NebulaClassIE extends NebulaBaseIE {
  static IE_NAME = 'nebula:media';
  static _VALID_URL = new RegExp(
    `${BASE_URL_RE.source}/(?!(?:myshows|library|videos)/)(?<id>[\\w-]+)/(?<ep>[\\w-]+)/?(?:$|[?#])`,
  );

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const classSlug = m.groups?.id || '';
    const epSlug = m.groups?.ep || '';
    const metadata = await this._callApi<Record<string, unknown>>(
      `https://content.api.nebula.app/content/classes/${classSlug}/episodes/${epSlug}`,
      epSlug,
      'Fetching episode metadata',
    );
    return {
      ...this._extractVideoMetadata(metadata),
      ...(await this._extractFormats(String(metadata.id), epSlug)),
    } as VideoInfo;
  }
}

export class NebulaSubscriptionsIE extends NebulaBaseIE {
  static IE_NAME = 'nebulasubscriptions';
  static _VALID_URL = new RegExp(`${BASE_URL_RE.source}/(?:myshows|library)(?:[/?#]|$)`);

  async _real_extract(_url: string): Promise<VideoInfo> {
    await this._realInitialize();
    const data = await this._callApi<{ results?: Array<Record<string, unknown>> }>(
      'https://content.api.nebula.app/content/videos/subscriptions',
      undefined,
      'Fetching subscriptions',
    );
    const entries = (data.results || []).map((item) =>
      this.url_result(
        smuggle_url(`https://nebula.tv/videos/${item.slug}`, { id: item.id }),
        'Nebula',
        String(item.id),
      ) as VideoInfo,
    );
    return this.playlist_result(entries, 'subscriptions');
  }
}

export class NebulaChannelIE extends NebulaBaseIE {
  static IE_NAME = 'nebula:channel';
  static _VALID_URL = new RegExp(`${BASE_URL_RE.source}/(?!(?:videos|myshows|library)/)(?<id>[\\w-]+)/?(?:$|[?#])`);

  static suitable(url: string): boolean {
    if (NebulaIE.suitable(url) || NebulaClassIE.suitable(url)) return false;
    return InfoExtractor.suitable.call(this, url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelSlug = this._match_id(url);
    const data = await this._callApi<{ results?: Array<Record<string, unknown>> }>(
      `https://content.api.nebula.app/content/channels/${channelSlug}/videos`,
      channelSlug,
      'Fetching channel videos',
    );
    const entries = (data.results || []).map((v) =>
      this.url_result(`https://nebula.tv/videos/${v.slug}`, 'Nebula', String(v.id)) as VideoInfo,
    );
    return this.playlist_result(entries, channelSlug);
  }
}

export class NebulaSeasonIE extends NebulaBaseIE {
  static IE_NAME = 'nebula:season';
  static _VALID_URL = new RegExp(`${BASE_URL_RE.source}/(?<id>[\\w-]+)/season/(?<season>[\\w-]+)/?(?:$|[?#])`);

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const classSlug = m.groups?.id || '';
    const seasonSlug = m.groups?.season || '';
    const data = await this._callApi<{ results?: Array<Record<string, unknown>> }>(
      `https://content.api.nebula.app/content/classes/${classSlug}/seasons/${seasonSlug}/episodes`,
      seasonSlug,
      'Fetching season episodes',
    );
    const entries = (data.results || []).map((ep) =>
      this.url_result(`https://nebula.tv/${classSlug}/${ep.slug}`, 'NebulaClass', String(ep.id)) as VideoInfo,
    );
    return this.playlist_result(entries, `${classSlug}/${seasonSlug}`);
  }
}
