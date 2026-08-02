/**
 * NateIE / NateProgramIE — ported from yt-dlp nate.py
 */

import { InfoExtractor } from '../../common';
import type { Format, VideoInfo } from '../../types';
import { int_or_none, str_or_none, traverse_obj, unified_strdate } from '../../utils';

const QUALITY: Record<string, number> = {
  '36': 2160,
  '35': 1080,
  '34': 720,
  '33': 480,
  '32': 360,
  '31': 270,
};

export class NateIE extends InfoExtractor {
  static IE_NAME = 'nate';
  static _VALID_URL = /https?:\/\/tv\.nate\.com\/clip\/(?<id>[0-9]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    const videoData = await this._download_json<Record<string, unknown>>(
      `https://tv.nate.com/api/v1/clip/${videoId}`,
      videoId,
    );
    const formats: Format[] = ((videoData.smcUriList as string[]) || []).map((fUrl) => ({
      format_id: fUrl.slice(-2),
      url: fUrl,
      height: QUALITY[fUrl.slice(-2)],
      quality: int_or_none(fUrl.slice(-2)) ?? undefined,
    }));

    const hashTag = videoData.hashTag as string | undefined;
    return {
      id: videoId,
      title: str_or_none(videoData.clipTitle) ?? undefined,
      description: str_or_none(videoData.synopsis) ?? undefined,
      thumbnail: str_or_none(videoData.contentImg) ?? undefined,
      upload_date: unified_strdate(traverse_obj(videoData, ['broadDate', 'regDate'])) ?? undefined,
      age_limit: int_or_none(videoData.targetAge) ?? undefined,
      duration: int_or_none(videoData.playTime) ?? undefined,
      formats,
      uploader: str_or_none(videoData.programTitle) ?? undefined,
      channel: str_or_none(videoData.programTitle) ?? undefined,
      channel_id: str_or_none(videoData.programSeq) ?? undefined,
      uploader_id: str_or_none(videoData.programSeq) ?? undefined,
      tags: hashTag ? hashTag.split(',') : undefined,
    };
  }
}

export class NateProgramIE extends InfoExtractor {
  static IE_NAME = 'nate:program';
  static _VALID_URL = /https?:\/\/tv\.nate\.com\/program\/clips\/(?<id>[0-9]+)/;

  protected async *_entries(playlistId: string): AsyncGenerator<VideoInfo> {
    for (let pageNum = 1; ; pageNum++) {
      const programData = await this._download_json<Record<string, unknown>>(
        `https://tv.nate.com/api/v1/program/${playlistId}/clip/ranking?size=20&page=${pageNum}`,
        playlistId,
        `Downloading page ${pageNum}`,
      );
      for (const clip of (programData.content as Array<Record<string, unknown>>) || []) {
        const clipId = clip.clipSeq;
        if (clipId) {
          yield this.url_result(`https://tv.nate.com/clip/${clipId}`, 'Nate', String(clipId), playlistId) as VideoInfo;
        }
      }
      if (programData.last) break;
    }
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const playlistId = this._match_id(url);
    const entries: VideoInfo[] = [];
    for await (const entry of this._entries(playlistId)) entries.push(entry);
    return this.playlist_result(entries, playlistId);
  }
}
