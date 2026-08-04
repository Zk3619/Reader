// @ts-nocheck
/**
 * VoicyBaseIE / VoicyIE / VoicyChannelIE â€?ported from yt-dlp voicy.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import {
  smuggle_url,
  str_or_none,
  traverse_obj,
  unified_strdate,
  unsmuggle_url,
} from '../../utils';

type PlaylistData = Record<string, unknown> & {
  PlaylistId?: unknown;
  PlaylistName?: unknown;
  SpeakerName?: unknown;
  SpeakerId?: unknown;
  ChannelName?: unknown;
  ChannelId?: unknown;
  Published?: unknown;
  PlayCount?: unknown;
  VoiceData?: Array<Record<string, unknown>>;
};

export class VoicyBaseIE extends InfoExtractor {
  static IE_NAME = 'voicybase';
  static _VALID_URL: RegExp | string | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('VoicyBaseIE is not a standalone extractor', { expected: true });
  }

  protected _extractFromPlaylistData(value: PlaylistData): VideoInfo {
    const voiceId = String(value.PlaylistId ?? '');
    const uploadDate = unified_strdate(value.Published) || undefined;
    const items = ((value.VoiceData as Array<Record<string, unknown>>) || []).map((v) =>
      this._extractSingleArticle(v),
    );
    return {
      _type: 'multi_video',
      entries: items,
      id: voiceId,
      title: str_or_none(value.PlaylistName) || voiceId,
      uploader: str_or_none(value.SpeakerName) || undefined,
      uploader_id: str_or_none(value.SpeakerId) || undefined,
      channel: str_or_none(value.ChannelName) || undefined,
      channel_id: str_or_none(value.ChannelId) || undefined,
      upload_date: uploadDate,
    };
  }

  protected _extractSingleArticle(entry: Record<string, unknown>): VideoInfo {
    const formats: Format[] = [
      {
        url: String(entry.VoiceHlsFile || ''),
        format_id: 'hls',
        ext: 'm4a',
        acodec: 'aac',
        vcodec: 'none',
        protocol: 'm3u8_native',
      },
      {
        url: String(entry.VoiceFile || ''),
        format_id: 'mp3',
        ext: 'mp3',
        acodec: 'mp3',
        vcodec: 'none',
      },
    ];
    return {
      id: String(entry.ArticleId ?? ''),
      title: str_or_none(entry.ArticleTitle) || undefined,
      description: str_or_none(entry.MediaName) || undefined,
      formats,
    };
  }

  protected async _callApi(url: string, videoId: string, note?: string): Promise<unknown> {
    const response = await this._download_json<Record<string, unknown>>(url, videoId, note);
    if (response.Status !== 0) {
      const message =
        (traverse_obj(response, ['Value', 'Error', 'Message']) as string | undefined) ||
        `There was a error in the response: ${response.Status}`;
      throw new ExtractorError(message);
    }
    return response.Value;
  }
}

export class VoicyIE extends VoicyBaseIE {
  static IE_NAME = 'voicy';
  static _WORKING = false;
  static _VALID_URL = /https?:\/\/voicy\.jp\/channel\/(?<channel_id>\d+)\/(?<id>\d+)/;
  static ARTICLE_LIST_API_URL = 'https://vmw.api.voicy.jp/articles_list?channel_id=%s&pid=%s';

  async _real_extract(url: string): Promise<VideoInfo> {
    const mobj = this._match_valid_url(url)!;
    const voiceId = mobj.groups!.id!;
    const channelId = mobj.groups!.channel_id!;
    const [, smuggled] = unsmuggle_url(url, {});
    let articleList = Object.keys(smuggled).length ? (smuggled as PlaylistData) : null;
    if (!articleList || articleList.PlaylistId == null) {
      articleList = (await this._callApi(
        VoicyIE.ARTICLE_LIST_API_URL.replace('%s', channelId).replace('%s', voiceId),
        voiceId,
      )) as PlaylistData;
    }
    return this._extractFromPlaylistData(articleList);
  }
}

export class VoicyChannelIE extends VoicyBaseIE {
  static IE_NAME = 'voicy:channel';
  static _WORKING = false;
  static _VALID_URL = /https?:\/\/voicy\.jp\/channel\/(?<id>\d+)/;
  static PROGRAM_LIST_API_URL =
    'https://vmw.api.voicy.jp/program_list/all?channel_id=%s&limit=20&public_type=3%s';

  static suitable(url: string): boolean {
    return !VoicyIE.suitable(url) && super.suitable(url);
  }

  protected async _entries(channelId: string): Promise<PlaylistData[]> {
    const out: PlaylistData[] = [];
    let pager = '';
    for (let count = 1; count < 500; count++) {
      const articleList = (await this._callApi(
        VoicyChannelIE.PROGRAM_LIST_API_URL.replace('%s', channelId).replace('%s', pager),
        channelId,
        `Paging #${count}`,
      )) as PlaylistData;
      const playlistData = articleList.PlaylistData as PlaylistData[] | undefined;
      if (!playlistData?.length) break;
      out.push(...playlistData);
      const last = playlistData[playlistData.length - 1]!;
      pager = `&pid=${last.PlaylistId}&p_date=${last.Published}&play_count=${last.PlayCount}`;
    }
    return out;
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const channelId = this._match_id(url);
    const articles = await this._entries(channelId);
    const first = articles[0];
    let title = str_or_none(first?.ChannelName) || undefined;
    const speakerName = str_or_none(first?.SpeakerName) || undefined;
    if (!title && speakerName) title = `Uploads from ${speakerName}`;
    if (!title) title = `Uploads from channel ID ${channelId}`;

    const entries = articles.map((value) =>
      this.url_result(
        smuggle_url(`https://voicy.jp/channel/${channelId}/${value.PlaylistId}`, value),
        VoicyIE.IE_NAME,
        String(value.PlaylistId ?? ''),
      ),
    );

    return this.playlist_result(entries, channelId, title);
  }
}
