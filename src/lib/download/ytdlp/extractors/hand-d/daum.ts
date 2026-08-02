/**
 * Daum / Kakao TV pot family — ported from yt-dlp daum.py
 */

import { ExtractorError, InfoExtractor } from '../../common';
import type { VideoInfo } from '../../types';
import { parse_qs } from '../../utils';

const KAKAO_EMBED_BASE = 'http://tv.kakao.com/embed/player/cliplink/';

export class DaumBaseIE extends InfoExtractor {
  static IE_NAME = 'daumbase';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('DaumBaseIE is not a standalone extractor', { expected: true });
  }
}

export class DaumIE extends DaumBaseIE {
  static IE_NAME = 'daum.net';
  static _VALID_URL =
    /https?:\/\/(?:(?:m\.)?tvpot\.daum\.net\/v\/|videofarm\.daum\.net\/controller\/player\/VodPlayer\.swf\?vid=)(?<id>[^?#&]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    let videoId = decodeURIComponent(this._match_id(url));
    if (!/^\d+$/.test(videoId)) videoId += '@my';
    return this.url_result(`${KAKAO_EMBED_BASE}${videoId}`, 'Kakao', videoId);
  }
}

export class DaumClipIE extends DaumBaseIE {
  static IE_NAME = 'daum.net:clip';
  static _VALID_URL =
    /https?:\/\/(?:m\.)?tvpot\.daum\.net\/(?:clip\/ClipView\.(?:do|tv)|mypot\/View\.do)\?.*?clipid=(?<id>\d+)/;
  static _URL_TEMPLATE = 'http://tvpot.daum.net/clip/ClipView.do?clipid=%s';

  static suitable(url: string): boolean {
    if (DaumPlaylistIE.suitable(url) || DaumUserIE.suitable(url)) return false;
    return super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const videoId = this._match_id(url);
    return this.url_result(`${KAKAO_EMBED_BASE}${videoId}`, 'Kakao', videoId);
  }
}

export class DaumListIE extends InfoExtractor {
  static IE_NAME = 'daumlist';
  static _VALID_URL: RegExp | string | Array<string | RegExp> | false | null = false;

  async _real_extract(_url: string): Promise<VideoInfo> {
    throw new ExtractorError('DaumListIE is not a standalone extractor', { expected: true });
  }

  protected async _getEntries(
    listId: string,
    listIdType: 'playlistid' | 'ownerid',
  ): Promise<[string | undefined, VideoInfo[]]> {
    let name: string | undefined;
    const entries: VideoInfo[] = [];
    for (let pagenum = 1; pagenum < 500; pagenum++) {
      const listInfo = await this._download_json<Record<string, unknown>>(
        `http://tvpot.daum.net/mypot/json/GetClipInfo.do?size=48&init=true&order=date&page=${pagenum}&${listIdType}=${listId}`,
        listId,
        `Downloading list info - ${pagenum}`,
      );
      const clipList = listInfo.clip_list as Array<{ vid?: string }> | undefined;
      for (const clip of clipList || []) {
        if (clip?.vid) {
          entries.push(this.url_result(`http://tvpot.daum.net/v/${clip.vid}`));
        }
      }
      if (!name) {
        const playlistBean = listInfo.playlist_bean as Record<string, unknown> | undefined;
        const potInfo = listInfo.potInfo as Record<string, unknown> | undefined;
        name =
          (typeof playlistBean?.name === 'string' ? playlistBean.name : undefined) ||
          (typeof potInfo?.name === 'string' ? potInfo.name : undefined);
      }
      if (!listInfo.has_more) break;
    }
    return [name, entries];
  }

  protected _checkClip(url: string, listId: string): VideoInfo | null {
    const queryDict = parse_qs(url);
    const clipIds = queryDict.clipid;
    if (!clipIds?.[0]) return null;
    const clipId = clipIds[0];
    if (!this._yesPlaylist(listId, clipId)) {
      return this.url_result(DaumClipIE._URL_TEMPLATE.replace('%s', clipId), 'DaumClip', clipId);
    }
    return null;
  }

  protected _yesPlaylist(playlistId: string, videoId: string): boolean {
    void playlistId;
    if (this.params.noplaylist) {
      this.to_screen(`Downloading just video ${videoId} because of --no-playlist`);
      return false;
    }
    return true;
  }
}

export class DaumPlaylistIE extends DaumListIE {
  static IE_NAME = 'daum.net:playlist';
  static _VALID_URL =
    /https?:\/\/(?:m\.)?tvpot\.daum\.net\/mypot\/(?:View\.do|Top\.tv)\?.*?playlistid=(?<id>[0-9]+)/;
  static _URL_TEMPLATE = 'http://tvpot.daum.net/mypot/View.do?playlistid=%s';

  static suitable(url: string): boolean {
    if (DaumUserIE.suitable(url)) return false;
    return super.suitable(url);
  }

  async _real_extract(url: string): Promise<VideoInfo> {
    const listId = this._match_id(url);
    const clipResult = this._checkClip(url, listId);
    if (clipResult) return clipResult;
    const [name, entries] = await this._getEntries(listId, 'playlistid');
    return this.playlist_result(entries, listId, name);
  }
}

export class DaumUserIE extends DaumListIE {
  static IE_NAME = 'daum.net:user';
  static _VALID_URL =
    /https?:\/\/(?:m\.)?tvpot\.daum\.net\/mypot\/(?:View|Top)\.(?:do|tv)\?.*?ownerid=(?<id>[0-9a-zA-Z]+)/;

  async _real_extract(url: string): Promise<VideoInfo> {
    const listId = this._match_id(url);
    const clipResult = this._checkClip(url, listId);
    if (clipResult) return clipResult;

    const queryDict = parse_qs(url);
    const playlistIds = queryDict.playlistid;
    if (playlistIds?.[0]) {
      return this.url_result(
        DaumPlaylistIE._URL_TEMPLATE.replace('%s', playlistIds[0]),
        'DaumPlaylist',
        playlistIds[0],
      );
    }

    const [name, entries] = await this._getEntries(listId, 'ownerid');
    return this.playlist_result(entries, listId, name);
  }
}
