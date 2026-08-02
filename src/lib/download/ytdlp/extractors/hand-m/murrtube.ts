/**
 * MurrtubeIE / MurrtubeUserIE — ported from yt-dlp murrtube.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { clean_html, extract_attributes, get_element_by_class, parse_count, remove_end, update_url_query } from '../../utils';
import { hiddenInputs, urlencodePostdata } from './_helpers';

export class MurrtubeIE extends InfoExtractor {
  static IE_NAME = 'murrtube';
  static _VALID_URL =
    /(?:murrtube:|https?:\/\/murrtube\.net\/(?:v\/|videos\/(?<slug>[a-z0-9-]+?)-))(?<id>[A-Z0-9]{4}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/;

  private _initialized = false;

  protected async _ensureSession(): Promise<void> {
    if (this._initialized) return;
    const homepage = await this._download_webpage('https://murrtube.net', 'murrtube', 'Getting session token');
    await this._request_webpage(
      {
        url: 'https://murrtube.net/accept_age_check',
        data: urlencodePostdata(hiddenInputs(homepage)),
      },
      'murrtube',
      'Setting age cookie',
    );
    this._initialized = true;
  }

  protected _extractCount(name: string, html: string): number | undefined {
    const m = html.match(new RegExp(`([\\d,]+)\\s+<span[^>]*>${name}</span>`));
    return parse_count(m?.[1]) ?? undefined;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    await this._ensureSession();
    let videoId = this._match_id(url);
    if (videoId.startsWith('murrtube:')) {
      throw new ExtractorError('Support for murrtube: prefix URLs is broken', { expected: true });
    }

    const videoPage = await this._download_webpage(url, videoId);
    const videoTag = videoPage.match(/<video\b[^>]*id=["']video["'][^>]*>/i)?.[0] || '';
    const videoAttrs = extract_attributes(videoTag);
    const playlist = update_url_query(String(videoAttrs['data-url'] || ''), {});
    const m3u8Id = playlist.match(/\/([\da-f]+)\/index.m3u8/i)?.[1];
    if (m3u8Id) videoId = m3u8Id;

    return {
      id: videoId,
      title: remove_end(this._og_search_title(videoPage) || '', ' - Murrtube') || undefined,
      age_limit: 18,
      formats: await this._extract_m3u8_formats(playlist, videoId, 'mp4'),
      description: this._og_search_description(videoPage) || undefined,
      thumbnail: update_url_query(this._og_search_thumbnail(videoPage) || '', {}) || undefined,
      uploader: clean_html(get_element_by_class('pl-1 is-size-6 has-text-lighter', videoPage) || '') || undefined,
      view_count: this._extractCount('Views', videoPage),
      like_count: this._extractCount('Likes', videoPage),
      comment_count: this._extractCount('Comments', videoPage),
    };
  }
}

export class MurrtubeUserIE extends InfoExtractor {
  static IE_NAME = 'murrtube:user';
  static _VALID_URL = /https?:\/\/murrtube\.net\/(?<id>[^/]+)$/;
  static _PAGE_SIZE = 10;

  protected async _downloadGql(
    videoId: string,
    op: Record<string, unknown>,
    note?: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const result = await this._download_json<{ data: Record<string, unknown> }>(
        'https://murrtube.net/graphql',
        videoId,
        note,
        {
          data: JSON.stringify(op),
          headers: { 'Content-Type': 'application/json' },
        },
      );
      return result.data;
    } catch {
      return null;
    }
  }

  protected async *_fetchPage(username: string, userId: string, page: number): AsyncGenerator<VideoInfo> {
    const data = await this._downloadGql(username, {
      operationName: 'Media',
      variables: {
        limit: MurrtubeUserIE._PAGE_SIZE,
        offset: page * MurrtubeUserIE._PAGE_SIZE,
        sort: 'latest',
        userId,
      },
      query: `query Media($q: String, $sort: String, $userId: ID, $offset: Int!, $limit: Int!) {
  media(q: $q, sort: $sort, userId: $userId, offset: $offset, limit: $limit) {
    id
    __typename
  }
}`,
    }, `Downloading page ${page + 1}`);

    if (!data) throw new ExtractorError(`Failed to retrieve video list for page ${page + 1}`, { expected: true });
    for (const entry of (data.media as Array<{ id?: string }>) || []) {
      if (entry.id) yield this.url_result(`murrtube:${entry.id}`, 'murrtube');
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const username = this._match_id(url);
    const data = await this._downloadGql(
      username,
      {
        operationName: 'User',
        variables: { id: username },
        query: `query User($id: ID!) { user(id: $id) { id __typename } }`,
      },
      'Downloading user info',
    );
    if (!data?.user) throw new ExtractorError('Failed to fetch user info', { expected: true });

    const user = data.user as Record<string, unknown>;
    const entries: VideoInfo[] = [];
    for (let page = 0; ; page++) {
      let count = 0;
      for await (const entry of this._fetchPage(username, String(user.id ?? ''), page)) {
        entries.push(entry);
        count++;
      }
      if (count < MurrtubeUserIE._PAGE_SIZE) break;
    }

    return this.playlist_result(entries, username);
  }
}
