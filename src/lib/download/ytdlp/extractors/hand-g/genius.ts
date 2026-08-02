/**
 * GeniusIE / GeniusLyricsIE — ported from yt-dlp genius.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { js_to_json, smuggle_url, str_or_none, traverse_obj, unescapeHTML } from '../../utils';

export class GeniusIE extends InfoExtractor {
  static IE_NAME = 'genius';
  static _VALID_URL = /https?:\/\/(?:www\.)?genius\.com\/(?:videos|(?<article>a))\/(?<id>[^?/#]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const m = this._match_valid_url(url)!;
    const displayId = m.groups!.id!;
    const isArticle = m.groups!.article;
    const webpage = await this._download_webpage(url, displayId);

    const metadata = this._search_json<Record<string, unknown>>(
      /<meta content="/,
      webpage,
      'metadata',
      displayId,
      {
        end_pattern: /"\s+itemprop="page_data"/,
        transform_source: unescapeHTML,
      },
    );

    const videoId = traverse_obj(metadata, [
      ['article', 'media', 'ALL'],
      ['video'],
      ['provider_id'],
      ['dfp_kv', 'ALL', { name: 'brightcove_video_id' }, 'values', 'ALL'],
    ]) as string | undefined;

    if (!videoId) {
      throw new ExtractorError('Brightcove video ID not found in webpage', { expected: !!isArticle });
    }

    const config =
      this._search_json<Record<string, unknown>>(/var\s*APP_CONFIG\s*=/, webpage, 'config', videoId, {
        default: {},
      }) || {};
    const accountId = (config.brightcove_account_id as string | undefined) || '4863540648001';
    const playerId =
      (config.brightcove_standard_web_player_id as string | undefined) ||
      (config.brightcove_standard_no_autoplay_web_player_id as string | undefined) ||
      (config.brightcove_modal_web_player_id as string | undefined) ||
      (config.brightcove_song_story_web_player_id as string | undefined) ||
      'S1ZcmcOC1x';

    return this.url_result(
      smuggle_url(
        `https://players.brightcove.net/${accountId}/${playerId}_default/index.html?videoId=${videoId}`,
        { referrer: url },
      ),
      'BrightcoveNew',
      videoId,
    );
  }
}

export class GeniusLyricsIE extends InfoExtractor {
  static IE_NAME = 'geniuslyrics';
  static _VALID_URL = /https?:\/\/(?:www\.)?genius\.com\/(?<id>[^?/#]+)-lyrics(?:[?/#]|$)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const displayId = this._match_id(url);
    const webpage = await this._download_webpage(url, displayId);

    const jsonString = this._search_json<string>(/window\.__PRELOADED_STATE__\s*=\s*JSON\.parse\(/, webpage, 'json string', displayId, {
      transform_source: js_to_json,
      end_pattern: /'{(?s:.+)}'/,
    });
    const songInfo = this._parse_json<Record<string, unknown>>(jsonString!, displayId)!;
    const songId = str_or_none(traverse_obj(songInfo, ['songPage', 'song']));
    if (!songId) throw new ExtractorError('Song id not found in webpage');

    const tracking = (traverse_obj(songInfo, ['songPage', 'trackingData', 'ALL'], { get_all: true }) ||
      []) as Array<Record<string, unknown>>;
    const title =
      (tracking.find((x) => x.key === 'Title')?.value as string | undefined) || 'untitled';
    const artist =
      (tracking.find((x) => x.key === 'Primary Artist')?.value as string | undefined) || 'unknown artist';
    const entities = (songInfo.entities as Record<string, Record<string, unknown>>) || {};
    const media = (traverse_obj(entities, ['songs', songId, 'media']) as Array<Record<string, unknown>>) || [];

    const entries: VideoInfo[] = [];
    for (const item of media) {
      if (!['video', 'audio'].includes(String(item.type)) || !item.url) continue;
      if (item.provider === 'spotify') {
        this.to_screen(`${songId}: Skipping Spotify audio embed`);
        continue;
      }
      entries.push(this.url_result(String(item.url)));
    }

    return this.playlist_result(entries, songId, title, `${title} by ${artist}`);
  }
}
